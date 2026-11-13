"""Helpers that put a tool call on the "agents at work" timeline.

Summaries never carry raw user content: they hold counts, IDs and enum values only.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from ..protocol.events import ToolFinished, ToolProgress, ToolStarted
from .session_bus import SessionContext


def started(ctx: SessionContext, *, call_id: str, agent: str, tool: str, behavior: str, runs_on: str,
            scheduling: str | None = None, args_summary: str | None = None, parent: str | None = None) -> None:
    ctx.open_calls[call_id] = time.monotonic()
    ctx.bus.publish(ToolStarted(call_id=call_id, agent=agent, tool=tool, behavior=behavior,
                                scheduling_requested=scheduling, runs_on=runs_on, args_summary=args_summary,
                                parent_call_id=parent))


def progress(ctx: SessionContext, call_id: str, stage: str, note: str | None = None) -> None:
    ctx.bus.publish(ToolProgress(call_id=call_id, stage=stage, note=note))


def finished(ctx: SessionContext, *, call_id: str, status: str, scheduling_requested: str | None = None,
             summary: str | None = None) -> None:
    began = ctx.open_calls.pop(call_id, None)
    if began is None:
        return  # already closed (for example denied in the plugin)
    effective = scheduling_requested
    if scheduling_requested == "INTERRUPT" and ctx.user_speaking:
        effective = "WHEN_IDLE"  # the Live API downgrades INTERRUPT while the user is speaking
    ctx.bus.publish(ToolFinished(call_id=call_id, status=status, scheduling_effective=effective,
                                 latency_ms=int((time.monotonic() - began) * 1000), summary=summary))


@asynccontextmanager
async def sub_call(ctx: SessionContext, *, parent: str, agent: str, tool: str, runs_on: str,
                   args_summary: str | None = None):
    """A specialist's own row on the timeline, nested under the voice agent's tool call."""
    call_id = f"{parent}:{agent}"
    started(ctx, call_id=call_id, agent=agent, tool=tool, behavior="NON_BLOCKING", runs_on=runs_on,
            args_summary=args_summary, parent=parent)
    outcome = {"status": "ok", "summary": None}
    try:
        yield outcome
    except Exception:
        outcome["status"] = "error"
        raise
    finally:
        finished(ctx, call_id=call_id, status=outcome["status"], summary=outcome["summary"])
