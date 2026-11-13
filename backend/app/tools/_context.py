"""How a tool finds its own session. Never trust anything but the ID ADK provides."""

from __future__ import annotations

from google.adk.tools import ToolContext

from .. import services
from ..live.session_bus import SessionContext


class NoSession(RuntimeError):
    pass


def session_of(tool_context: ToolContext) -> SessionContext:
    ctx = services.get().registry.get(tool_context.session.id)
    if ctx is None:
        raise NoSession("the live session has ended")
    return ctx


def call_id_of(tool_context: ToolContext) -> str:
    return tool_context.function_call_id or "call-unknown"
