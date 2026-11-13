"""Server-side gate for every tool call, and the source of timeline events.

The voice model can be steered by what a shopper says, so its tool calls are
never trusted: the tool must be on the allowlist and every argument must pass
its validator before the tool body runs. ADK treats any dict returned from
``before_tool_callback`` as the tool result, including an empty one, so this
plugin returns either ``None`` (run the tool) or a non-empty error dict.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Callable

from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools import BaseTool, ToolContext
from google.genai import types

from .. import services
from . import timeline

log = logging.getLogger(__name__)
BOOK_ID = re.compile(r"^OL\d{1,12}W$")


def _text(max_len: int) -> Callable[[Any], bool]:
    return lambda v: isinstance(v, str) and len(v) <= max_len


def _book_id(v: Any) -> bool:
    return isinstance(v, str) and bool(BOOK_ID.match(v))


def _int_between(low: int, high: int) -> Callable[[Any], bool]:
    return lambda v: isinstance(v, int) and not isinstance(v, bool) and low <= v <= high


def _list_of(item: Callable[[Any], bool], max_len: int) -> Callable[[Any], bool]:
    return lambda v: v is None or (isinstance(v, list) and len(v) <= max_len and all(item(x) for x in v))


@dataclass(frozen=True)
class ToolPolicy:
    validators: dict[str, Callable[[Any], bool]]
    required: frozenset[str] = frozenset()
    # Which arguments are safe to show on the timeline as they are (IDs and numbers, never free text).
    visible: frozenset[str] = frozenset()


POLICIES: dict[str, ToolPolicy] = {
    "search_books": ToolPolicy({"query": _text(120), "subject": _text(60), "language": _text(12),
                                "max_results": _int_between(1, 6)}, visible=frozenset({"language", "max_results"})),
    "get_book_details": ToolPolicy({"book_id": _book_id}, frozenset({"book_id"}), frozenset({"book_id"})),
    "add_to_cart": ToolPolicy({"book_id": _book_id, "quantity": _int_between(1, 5)}, frozenset({"book_id"}),
                              frozenset({"book_id", "quantity"})),
    "remove_from_cart": ToolPolicy({"book_id": _book_id}, frozenset({"book_id"}), frozenset({"book_id"})),
    "get_cart": ToolPolicy({}),
    "show_books": ToolPolicy({"book_ids": _list_of(_book_id, 6), "title": _text(60)}, frozenset({"book_ids"})),
    "open_book": ToolPolicy({"book_id": _book_id}, frozenset({"book_id"}), frozenset({"book_id"})),
    "open_cart": ToolPolicy({}),
    "recommend_books": ToolPolicy({"request": _text(500)}, frozenset({"request"})),
    "note_taste": ToolPolicy({"likes": _list_of(_text(40), 8), "dislikes": _list_of(_text(40), 8),
                              "languages": _list_of(_text(8), 4)}),
}


def check_args(tool_name: str, args: dict[str, Any]) -> str | None:
    """Return None when the call is allowed, otherwise a short machine-readable reason."""
    policy = POLICIES.get(tool_name)
    if policy is None:
        return "tool_not_allowed"
    if not isinstance(args, dict):
        return "bad_arguments"
    unknown = set(args) - set(policy.validators)
    if unknown:
        return "unknown_argument"
    if policy.required - set(args):
        return "missing_argument"
    for name, value in args.items():
        if not policy.validators[name](value):
            return f"bad_{name}"
    return None


def summarize_args(tool_name: str, args: dict[str, Any]) -> str | None:
    policy = POLICIES.get(tool_name)
    if policy is None or not isinstance(args, dict) or not args:
        return None
    parts = []
    for name in sorted(args):
        value = args[name]
        if name in policy.visible:
            parts.append(f"{name}={value}")
        elif isinstance(value, (str, list)):
            unit = "chars" if isinstance(value, str) else "items"
            parts.append(f"{name}: {len(value)} {unit}")
    return ", ".join(parts) or None


def _enum(value) -> str | None:
    return value.value if value is not None else None


class PolicyPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="bookshop_policy")

    @staticmethod
    def _session(tool_context: ToolContext):
        return services.get().registry.get(tool_context.session.id)

    async def before_tool_callback(self, *, tool: BaseTool, tool_args: dict[str, Any],
                                   tool_context: ToolContext) -> dict | None:
        ctx = self._session(tool_context)
        if ctx is None:
            return {"error": "session_ended"}
        call_id = tool_context.function_call_id or f"call-{id(tool_args)}"
        non_blocking = tool.behavior is types.Behavior.NON_BLOCKING
        timeline.started(ctx, call_id=call_id, agent="voice", tool=tool.name,
                         behavior="NON_BLOCKING" if non_blocking else "BLOCKING", runs_on="gateway",
                         scheduling=_enum(tool.response_scheduling) if non_blocking else None,
                         args_summary=summarize_args(tool.name, tool_args))
        reason = check_args(tool.name, tool_args)
        if reason:
            log.warning("tool call denied: %s (%s)", tool.name, reason)
            timeline.finished(ctx, call_id=call_id, status="denied", summary=reason)
            return {"error": "denied", "reason": reason}
        return None

    async def after_tool_callback(self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: ToolContext,
                                  result: dict) -> dict | None:
        ctx = self._session(tool_context)
        if ctx is not None and tool_context.function_call_id:
            failed = isinstance(result, dict) and "error" in result
            timeline.finished(ctx, call_id=tool_context.function_call_id, status="error" if failed else "ok",
                              scheduling_requested=_enum(tool.response_scheduling),
                              summary=str(result.get("error")) if failed else None)
        return None

    async def on_tool_error_callback(self, *, tool: BaseTool, tool_args: dict[str, Any],
                                     tool_context: ToolContext, error: Exception) -> dict | None:
        ctx = self._session(tool_context)
        cancelled = not isinstance(error, Exception)  # asyncio.CancelledError is a BaseException
        if ctx is not None and tool_context.function_call_id:
            timeline.finished(ctx, call_id=tool_context.function_call_id,
                              status="cancelled" if cancelled else "error")
        if cancelled:
            return None
        log.exception("tool %s failed", tool.name, exc_info=error)
        return {"error": "tool_failed"}  # the exception text never reaches the model or the client
