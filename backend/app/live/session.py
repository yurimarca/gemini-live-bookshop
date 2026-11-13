"""One live voice session: browser socket on one side, ADK ``run_live`` on the other.

Four tasks run for the life of a session:
- upstream:   browser frames -> the ADK live queue (audio, typed text, UI actions)
- downstream: ADK events -> the session bus (audio, transcripts, turn signals)
- sender:     session bus -> browser. Tool and A2UI events are published by tools at
              any time, so sending never waits for the model to produce an event.
- clock:      warning, hard time limit and idle timeout.
The first task to finish ends the session; the rest are cancelled.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google.adk.agents import LiveRequestQueue
from google.genai import types
from pydantic import ValidationError

from ..a2ui import builders
from ..cart.service import CartError, CartView
from ..protocol import events as ev
from ..services import Services
from . import timeline
from ..tools.specialist_tools import forget_profile, publish_taste_card
from .prompts import CART_EXPIRED, GREETING, RETURNING
from .run_config import INPUT_MIME, build_run_config
from .session_bus import SessionBus, SessionContext
from .transcript import TranscriptAggregator
from .voice_agent import APP_NAME

log = logging.getLogger(__name__)

IDLE_SECONDS = 120
MAX_AUDIO_FRAME = 64 * 1024
CLOSE_FOR_REASON = {"time_limit": ev.CloseCode.TIME_LIMIT, "quota": ev.CloseCode.QUOTA,
                    "upstream": ev.CloseCode.UPSTREAM, "error": ev.CloseCode.UPSTREAM}


def cart_event(view: CartView, op_id: str | None = None) -> ev.CartUpdated:
    return ev.CartUpdated(items=[i.model_dump() for i in view.items], total_cents=view.total_cents,
                          hold_expires_at=view.hold_expires_at, op_id=op_id)


def publish_cart(ctx: SessionContext, view: CartView, op_id: str | None, runs_on: str, *,
                 announce: bool = False) -> None:
    """Push the cart and the cart-hold card to one session. Called for every cart change of its user.

    With ``announce``, an expired hold is also spoken: the gateway injects a short ``[system]`` line in
    the session's language (spike 2 showed injected text is answered).
    """
    ctx.bus.publish(cart_event(view, op_id))
    expired = op_id == "hold-expired"
    if expired and announce and ctx.inject:
        ctx.inject(CART_EXPIRED.get(ctx.locale, CART_EXPIRED["en"]))
    timer_call = f"cart-hold-{ctx.session_id}"
    if view.items and timer_call not in ctx.open_calls:
        timeline.started(ctx, call_id=timer_call, agent="cart_timer", tool="hold_cart", behavior="NON_BLOCKING",
                         runs_on=runs_on, scheduling="WHEN_IDLE", args_summary=f"{len(view.items)} items")
    if not view.items and timer_call in ctx.open_calls:
        timeline.finished(ctx, call_id=timer_call, status="ok" if expired else "cancelled",
                          scheduling_requested="WHEN_IDLE", summary="hold expired" if expired else "cart emptied")
    if view.items or builders.SURFACE_CART_HOLD in ctx.surfaces:
        first = builders.SURFACE_CART_HOLD not in ctx.surfaces
        ctx.surfaces.add(builders.SURFACE_CART_HOLD)
        ctx.bus.publish(ev.A2ui(agent="cart_timer", messages=builders.cart_hold(
            expires_at=view.hold_expires_at, item_count=sum(i.quantity for i in view.items),
            total_cents=view.total_cents, expired=expired, first=first)))


class LiveSession:
    def __init__(self, websocket: WebSocket, services: Services, runner: Any, *, uid: str, locale: str,
                 sessions_left: int) -> None:
        self.ws, self.svc, self.runner = websocket, services, runner
        self.settings = services.settings
        self.session_id = uuid.uuid4().hex
        self.bus = SessionBus()
        self.ctx = SessionContext(session_id=self.session_id, uid=uid, locale=locale, bus=self.bus,
                                  inject=self._inject)
        self.transcript = TranscriptAggregator(self.bus)
        self.queue = LiveRequestQueue()
        self.sessions_left = sessions_left
        self.muted = False
        self.end_reason: str | None = None
        self.last_activity = time.monotonic()
        self.started_at = time.time()

    def _inject(self, text: str) -> None:
        """A server-written ``[system]`` line to the voice model. Never client text."""
        if not self.bus.closed:
            self.queue.send_content(types.Content(role="user", parts=[types.Part(text=text)]))

    # --- lifecycle -----------------------------------------------------------------
    async def run(self) -> None:
        await self.runner.session_service.create_session(app_name=APP_NAME, user_id=self.ctx.uid,
                                                         session_id=self.session_id)
        self.svc.registry.add(self.ctx)
        cart = await self.svc.cart.get(self.ctx.uid)
        self.bus.publish(ev.SessionReady(
            session_id=self.session_id, expires_at=self.started_at + self.settings.session_max_seconds,
            server_time=self.started_at,
            limits=ev.Limits(max_seconds=self.settings.session_max_seconds,
                             warn_at_seconds=self.settings.session_warn_seconds,
                             sessions_left_today=self.sessions_left),
            dataset_version=self.svc.catalog.dataset_version, cart=cart_event(cart).model_dump(exclude={"type"})))
        if cart.items:
            publish_cart(self.ctx, cart, None, self.svc.hold_timer.runs_on)
        self.ctx.profile = await self.svc.taste.load(self.ctx.uid)
        returning = not self.ctx.profile.is_empty()
        if returning:
            publish_taste_card(self.ctx)
        # The greeting prompt is written by the server, never by the client. It names no stored tags.
        self._inject(GREETING[self.ctx.locale] + (RETURNING if returning else ""))

        sender = asyncio.create_task(self._sender(), name="sender")
        workers = [asyncio.create_task(c, name=n) for n, c in (
            ("upstream", self._upstream()), ("downstream", self._downstream()), ("clock", self._clock()))]
        try:
            done, _ = await asyncio.wait(workers, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                if task.exception() and not self.end_reason:
                    log.error("session task %s failed", task.get_name(), exc_info=task.exception())
                    self.end_reason = "error"
        finally:
            for task in workers:
                task.cancel()
            for task in list(self.ctx.background_tasks):
                task.cancel()
            await asyncio.gather(*workers, return_exceptions=True)
            self.queue.close()
            self.svc.registry.remove(self.session_id)
            await self._finish(sender)

    async def _finish(self, sender: asyncio.Task) -> None:
        reason = self.end_reason or "client"
        self.transcript.finalize("agent", interrupted=True)
        self.transcript.finalize("user")
        self.bus.publish(ev.SessionEnded(reason=reason))
        self.bus.closed = True
        try:  # give the sender a moment to flush what is queued, then stop it
            await asyncio.wait_for(self._flush(), timeout=2)
        except (asyncio.TimeoutError, Exception):
            pass
        sender.cancel()
        await asyncio.gather(sender, return_exceptions=True)
        try:
            await self.ws.close(code=CLOSE_FOR_REASON.get(reason, ev.CloseCode.NORMAL))
        except Exception:
            pass
        try:
            await self.runner.session_service.delete_session(app_name=APP_NAME, user_id=self.ctx.uid,
                                                             session_id=self.session_id)
        except Exception:
            pass
        log.info("session ended: reason=%s seconds=%d", reason, int(time.time() - self.started_at))

    async def _flush(self) -> None:
        for kind, payload in self.bus.drain_nowait():
            await self._send(kind, payload)

    async def _send(self, kind: str, payload: Any) -> None:
        if kind == "json":
            await self.ws.send_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        else:
            await self.ws.send_bytes(payload)

    # --- tasks ---------------------------------------------------------------------
    async def _sender(self) -> None:
        while True:
            kind, payload = await self.bus.next()
            await self._send(kind, payload)

    async def _clock(self) -> None:
        warn_at = self.started_at + self.settings.session_warn_seconds
        end_at = self.started_at + self.settings.session_max_seconds
        warned = False
        while True:
            await asyncio.sleep(1)
            now = time.time()
            if self.bus.closed:  # the client stopped reading
                self.end_reason = "error"
                return
            if now >= end_at:
                self.end_reason = "time_limit"
                return
            if not warned and now >= warn_at:
                warned = True
                self.bus.publish(ev.SessionWarning(seconds_left=int(end_at - now)))
            if time.monotonic() - self.last_activity > IDLE_SECONDS:
                self.end_reason = "idle"
                return

    async def _upstream(self) -> None:
        while True:
            try:
                frame = await self.ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                self.end_reason = self.end_reason or "client"
                return
            if frame["type"] == "websocket.disconnect":
                self.end_reason = self.end_reason or "client"
                return
            data = frame.get("bytes")
            if data is not None:
                if not self.muted and 0 < len(data) <= MAX_AUDIO_FRAME:
                    self.queue.send_realtime(types.Blob(mime_type=INPUT_MIME, data=data))
                continue
            try:
                event = ev.client_event.validate_json(frame.get("text") or "")
            except ValidationError:
                self.bus.publish(ev.ErrorEvent(code="bad_message", message="That message was not understood."))
                continue
            if isinstance(event, ev.SessionStop):
                self.end_reason = "client"
                return
            await self._on_client_event(event)

    async def _on_client_event(self, event) -> None:
        if isinstance(event, ev.Ping):
            self.bus.publish(ev.Pong())
        elif isinstance(event, ev.Mic):
            self.muted = event.muted
        elif isinstance(event, ev.SessionUpdate):
            self.ctx.locale = event.locale
        elif isinstance(event, ev.UserText):
            self.last_activity = time.monotonic()
            self.transcript.add_user_text(event.text)
            self.queue.send_content(types.Content(role="user", parts=[types.Part(text=event.text)]))
        elif isinstance(event, ev.A2uiAction):
            self.last_activity = time.monotonic()
            await self._on_action(event)
        # A second session.start is ignored.

    async def _on_action(self, event: ev.A2uiAction) -> None:
        """UI actions are a closed set handled here. They never reach the voice model as instructions."""
        parsed = builders.parse_action(event.message)
        if parsed is None:
            self.bus.publish(ev.ErrorEvent(code="bad_action", message="That action is not available."))
            return
        name, context, _surface = parsed
        book_id = context.get("book_id")
        if name == "forget_taste":
            await forget_profile(self.ctx.uid)
        elif name == "dismiss":
            surface = context.get("surface")
            if surface in self.ctx.surfaces:
                self.ctx.surfaces.discard(surface)
                self.bus.publish(ev.A2ui(agent="voice", messages=builders.delete_surface(surface)))
        elif not isinstance(book_id, str) or self.svc.catalog.entry(book_id) is None:
            self.bus.publish(ev.ErrorEvent(code="bad_action", message="That book is not available."))
        elif name == "open_book":
            self.bus.publish(ev.UiCommand(command="open_book", book_id=book_id))
        elif name == "add_to_cart":
            try:
                await self.svc.cart.set_item(self.ctx.uid, book_id, 1, op_id=f"ui-{event.op_id}")
            except CartError:
                self.bus.publish(ev.ErrorEvent(code="cart", message="The cart could not be updated."))

    async def _downstream(self) -> None:
        try:
            async for event in self.runner.run_live(user_id=self.ctx.uid, session_id=self.session_id,
                                                    live_request_queue=self.queue,
                                                    run_config=build_run_config(self.settings)):
                self._on_model_event(event)
            self.end_reason = self.end_reason or "upstream"
        except asyncio.CancelledError:
            raise
        except Exception:
            # 1011/1008 drops are still reported on gemini-3.8-live; the client may start a new session.
            log.warning("live connection lost", exc_info=True)
            self.bus.publish(ev.ErrorEvent(code="upstream", message="The connection to the voice model was lost.",
                                           fatal=True))
            self.end_reason = self.end_reason or "upstream"

    def _on_model_event(self, event) -> None:
        if getattr(event, "error_code", None):
            log.warning("model error event: %s", event.error_code)
            self.bus.publish(ev.ErrorEvent(code="model", message="The voice model reported a problem."))
            return
        tin, tout = getattr(event, "input_transcription", None), getattr(event, "output_transcription", None)
        if tin is not None and (tin.text or tin.finished):
            self.last_activity = time.monotonic()
            self.ctx.user_speaking = not tin.finished
            self.transcript.on_text("user", tin.text or "", bool(tin.finished))
        if tout is not None and (tout.text or tout.finished):
            self.transcript.on_text("agent", tout.text or "", False)
        content = getattr(event, "content", None)
        if content and content.parts:
            for part in content.parts:
                blob = part.inline_data
                if blob and blob.data and (blob.mime_type or "").startswith("audio/"):
                    self.transcript.on_agent_audio()
                    self.bus.publish_audio(blob.data)
        if getattr(event, "interrupted", None):
            utterance_id = self.transcript.finalize("agent", interrupted=True)
            self.bus.publish(ev.TurnInterrupted(utterance_id=utterance_id))
        if getattr(event, "turn_complete", None):
            self.ctx.user_speaking = False
            self.transcript.finalize("user")
            self.transcript.finalize("agent")
            self.bus.publish(ev.TurnComplete())
