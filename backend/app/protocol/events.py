"""Protocol 2 wire contract. ``frontend/src/protocol/events.ts`` mirrors this file.

Text frames are JSON with snake_case fields. Binary frames are audio only:
client to server PCM16 mono 16 kHz, server to client PCM16 mono 24 kHz.
Every server event carries ``seq`` and ``ts``, added by the session bus.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

PROTOCOL_VERSION = 2
MAX_USER_TEXT = 500

Locale = Literal["en", "pt-BR"]
AgentName = Literal["voice", "taste_profiler", "recommender", "cart_timer"]
Behavior = Literal["BLOCKING", "NON_BLOCKING"]
Scheduling = Literal["INTERRUPT", "WHEN_IDLE", "SILENT"]
RunsOn = Literal["gateway", "agent_runtime", "cloud_tasks"]
ToolStatus = Literal["ok", "error", "denied", "cancelled"]
EndReason = Literal["time_limit", "quota", "idle", "client", "upstream", "error"]


class CloseCode:
    NORMAL = 1000
    UPSTREAM = 1011
    BAD_START = 4400
    BAD_TOKEN = 4401
    FORBIDDEN = 4403
    TIME_LIMIT = 4408
    QUOTA = 4429
    AT_CAPACITY = 4503


class _Event(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- client to server -------------------------------------------------------------
class SessionStart(_Event):
    type: Literal["session.start"]
    protocol: int
    id_token: str
    app_check_token: str | None = None
    locale: Locale = "en"
    a2ui_capabilities: dict[str, Any] = Field(default_factory=dict)


class SessionUpdate(_Event):
    type: Literal["session.update"]
    locale: Locale


class Mic(_Event):
    type: Literal["mic"]
    muted: bool


class UserText(_Event):
    type: Literal["user.text"]
    text: str = Field(min_length=1, max_length=MAX_USER_TEXT)
    client_msg_id: str = Field(max_length=64)


class A2uiAction(_Event):
    type: Literal["a2ui.action"]
    op_id: str = Field(min_length=8, max_length=64)
    message: dict[str, Any]


class SessionStop(_Event):
    type: Literal["session.stop"]


class Ping(_Event):
    type: Literal["ping"]


ClientEvent = Annotated[
    Union[SessionStart, SessionUpdate, Mic, UserText, A2uiAction, SessionStop, Ping],
    Field(discriminator="type"),
]
client_event = TypeAdapter(ClientEvent)


# --- server to client -------------------------------------------------------------
class Limits(_Event):
    max_seconds: int
    warn_at_seconds: int
    sessions_left_today: int


class SessionReady(_Event):
    type: Literal["session.ready"] = "session.ready"
    session_id: str
    expires_at: float
    server_time: float
    limits: Limits
    dataset_version: str
    cart: dict[str, Any]


class AudioStart(_Event):
    type: Literal["audio.start"] = "audio.start"
    utterance_id: str


class TranscriptDelta(_Event):
    type: Literal["transcript.delta"] = "transcript.delta"
    utterance_id: str
    role: Literal["user", "agent"]
    text: str


class TranscriptFinal(_Event):
    type: Literal["transcript.final"] = "transcript.final"
    utterance_id: str
    role: Literal["user", "agent"]
    text: str
    interrupted: bool = False


class TurnInterrupted(_Event):
    type: Literal["turn.interrupted"] = "turn.interrupted"
    utterance_id: str | None = None
    cancelled_call_ids: list[str] = Field(default_factory=list)


class TurnComplete(_Event):
    type: Literal["turn.complete"] = "turn.complete"


class ToolStarted(_Event):
    type: Literal["tool.started"] = "tool.started"
    call_id: str
    agent: AgentName
    tool: str
    behavior: Behavior
    scheduling_requested: Scheduling | None = None
    runs_on: RunsOn
    args_summary: str | None = None
    parent_call_id: str | None = None


class ToolProgress(_Event):
    type: Literal["tool.progress"] = "tool.progress"
    call_id: str
    stage: str
    note: str | None = None


class ToolFinished(_Event):
    type: Literal["tool.finished"] = "tool.finished"
    call_id: str
    status: ToolStatus
    scheduling_effective: Scheduling | None = None
    latency_ms: int
    summary: str | None = None


class A2ui(_Event):
    type: Literal["a2ui"] = "a2ui"
    agent: AgentName
    call_id: str | None = None
    messages: list[dict[str, Any]]


class UiCommand(_Event):
    type: Literal["ui.command"] = "ui.command"
    command: Literal["show_books", "open_book", "open_cart"]
    book_ids: list[str] = Field(default_factory=list)
    book_id: str | None = None
    title: str | None = None


class CartUpdated(_Event):
    type: Literal["cart.updated"] = "cart.updated"
    items: list[dict[str, Any]]
    total_cents: int
    hold_expires_at: float | None = None
    op_id: str | None = None


class SessionWarning(_Event):
    type: Literal["session.warning"] = "session.warning"
    reason: Literal["time_limit"] = "time_limit"
    seconds_left: int


class SessionEnded(_Event):
    type: Literal["session.ended"] = "session.ended"
    reason: EndReason


class ErrorEvent(_Event):
    type: Literal["error"] = "error"
    code: str
    message: str  # generic text only; never an exception string
    fatal: bool = False


class Pong(_Event):
    type: Literal["pong"] = "pong"


ServerEvent = Union[
    SessionReady, AudioStart, TranscriptDelta, TranscriptFinal, TurnInterrupted, TurnComplete, ToolStarted,
    ToolProgress, ToolFinished, A2ui, UiCommand, CartUpdated, SessionWarning, SessionEnded, ErrorEvent, Pong,
]
