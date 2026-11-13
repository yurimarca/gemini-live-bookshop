"""``/ws/live``: the protocol 2 handshake, then a LiveSession.

Browsers cannot set headers on a WebSocket, so the ID token arrives in the
first message, not in the query string (which lands in request logs).
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from ..auth.firebase import AuthError, origin_allowed, verify_app_check, verify_id_token
from ..live.session import LiveSession
from ..protocol import events as ev

log = logging.getLogger(__name__)
router = APIRouter()
START_TIMEOUT_SECONDS = 5


async def _reject(ws: WebSocket, code: int, error_code: str, message: str, detail: str = "") -> None:
    # The client gets a generic message; the reason is logged here for the operator.
    log.warning("session rejected: code=%d reason=%s%s", code, error_code, f" {detail}" if detail else "")
    try:
        await ws.send_json({"type": "error", "code": error_code, "message": message, "fatal": True,
                            "seq": 0, "ts": 0})
        await ws.close(code=code)
    except Exception:
        pass


@router.websocket("/ws/live")
async def live(ws: WebSocket) -> None:
    svc = ws.app.state.services
    settings = svc.settings
    await ws.accept()  # a custom close code can only be sent on an accepted socket

    origin = ws.headers.get("origin")
    if not origin_allowed(origin, settings):
        return await _reject(ws, ev.CloseCode.FORBIDDEN, "origin", "This site may not open a session.",
                             detail=f"origin={origin!r} not in ALLOWED_ORIGINS")
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=START_TIMEOUT_SECONDS)
        start = ev.SessionStart.model_validate_json(raw)
        if start.protocol != ev.PROTOCOL_VERSION:
            raise ValueError("protocol")
    except (asyncio.TimeoutError, ValidationError, ValueError, KeyError):
        return await _reject(ws, ev.CloseCode.BAD_START, "bad_start", "The session could not be started.")
    except (WebSocketDisconnect, RuntimeError):
        return

    try:
        uid = await verify_id_token(start.id_token, settings)
    except AuthError:
        return await _reject(ws, ev.CloseCode.BAD_TOKEN, "auth", "Sign-in failed. Reload the page and try again.")
    try:
        await verify_app_check(start.app_check_token, settings)
    except AuthError:
        return await _reject(ws, ev.CloseCode.FORBIDDEN, "app_check", "This browser could not be verified.")

    if len(svc.registry) >= settings.max_concurrent_sessions or svc.registry.for_uid(uid):
        return await _reject(ws, ev.CloseCode.AT_CAPACITY, "capacity",
                             "The demo is busy right now. Please try again in a few minutes.")
    decision = await svc.quota.try_start(uid)
    if not decision.allowed:
        message = ("The demo has reached its daily limit. Please come back tomorrow." if decision.reason == "global"
                   else "You have used today's voice sessions. Please come back tomorrow.")
        return await _reject(ws, ev.CloseCode.QUOTA, "quota", message)

    session = LiveSession(ws, svc, ws.app.state.runner, uid=uid, locale=start.locale,
                          sessions_left=decision.sessions_left_today)
    await session.run()
