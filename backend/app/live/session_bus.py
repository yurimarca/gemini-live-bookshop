"""Per-session event bus and the registry of live sessions.

This replaces the prototype's module-global notification queue, which sent one
user's tool notifications to every connected socket. Each session owns one bus;
tools reach it through the registry, keyed by the ADK session ID that ADK
itself hands to the tool. A dedicated sender task drains the bus, so tool and
A2UI events reach the browser even when the model is silent.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from ..protocol.events import ServerEvent
from ..taste.profile import Profile

MAX_QUEUE = 2000


class SessionBus:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue(maxsize=MAX_QUEUE)
        self._seq = 0
        self.closed = False

    def publish(self, event: ServerEvent) -> None:
        """Queue a JSON event. Never blocks: a tool must not stall on a slow socket."""
        if self.closed:
            return
        self._seq += 1
        payload = event.model_dump(mode="json", exclude_none=True)
        payload["seq"] = self._seq
        payload["ts"] = round(time.time(), 3)
        self._put(("json", payload))

    def publish_audio(self, pcm: bytes) -> None:
        if not self.closed:
            self._put(("bytes", pcm))

    def _put(self, item: tuple[str, Any]) -> None:
        try:
            self._queue.put_nowait(item)
        except asyncio.QueueFull:
            self.closed = True  # the client is not reading; the session loop ends it

    async def next(self) -> tuple[str, Any]:
        return await self._queue.get()

    def drain_nowait(self) -> list[tuple[str, Any]]:
        items = []
        while not self._queue.empty():
            items.append(self._queue.get_nowait())
        return items


@dataclass
class SessionContext:
    """Everything a tool may touch for one live session."""

    session_id: str
    uid: str
    locale: str
    bus: SessionBus
    profile: Profile = field(default_factory=Profile)              # the user's stored taste, loaded at start
    taste_notes_session: int = 0                                     # notes that changed the profile this session
    notes_since_research: int = 0                                    # drives the automatic researcher
    research_running: bool = False
    inject: Callable[[str], None] | None = None                     # send a [system] line to the voice model
    user_speaking: bool = False
    shown_book_ids: list[str] = field(default_factory=list)
    surfaces: set[str] = field(default_factory=set)             # A2UI surfaces already created
    open_calls: dict[str, float] = field(default_factory=dict)   # call_id -> started (monotonic)
    background_tasks: set[asyncio.Task] = field(default_factory=set)

    def spawn(self, coro) -> asyncio.Task:
        """Run work for this session in the background; it is cancelled when the session ends."""
        task = asyncio.create_task(coro)
        self.background_tasks.add(task)
        task.add_done_callback(self.background_tasks.discard)
        return task


class SessionRegistry:
    def __init__(self) -> None:
        self._by_session: dict[str, SessionContext] = {}

    def add(self, ctx: SessionContext) -> None:
        self._by_session[ctx.session_id] = ctx

    def remove(self, session_id: str) -> None:
        self._by_session.pop(session_id, None)

    def get(self, session_id: str) -> SessionContext | None:
        return self._by_session.get(session_id)

    def for_uid(self, uid: str) -> list[SessionContext]:
        return [c for c in self._by_session.values() if c.uid == uid]

    def __len__(self) -> int:
        return len(self._by_session)
