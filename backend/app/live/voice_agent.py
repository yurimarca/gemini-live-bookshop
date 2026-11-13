"""The live voice agent: gemini-3.8-live with an explicit behavior on every tool.

The two official doc sets disagree on the default tool behavior, so each tool
states it. Fast tools are BLOCKING. Specialist tools are NON_BLOCKING:
recommendations answer WHEN_IDLE, taste notes answer SILENT. No tool is an
async generator: ADK would send partial FunctionResponses, which the Agent
Platform Live API does not support.
"""

from __future__ import annotations

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google.genai import types

from ..config.settings import Settings
from ..tools import shop_tools, specialist_tools, ui_tools
from .policy_plugin import POLICIES, PolicyPlugin
from .prompts import VOICE_INSTRUCTION

APP_NAME = "bookshop_voice"
B, NB = types.Behavior.BLOCKING, types.Behavior.NON_BLOCKING
WHEN_IDLE, SILENT = types.FunctionResponseScheduling.WHEN_IDLE, types.FunctionResponseScheduling.SILENT

# (function, behavior, scheduling of the response)
TOOL_TABLE = [
    (shop_tools.search_books, B, None),
    (shop_tools.get_book_details, B, None),
    (shop_tools.add_to_cart, B, None),
    (shop_tools.remove_from_cart, B, None),
    (shop_tools.get_cart, B, None),
    (ui_tools.show_books, B, None),
    (ui_tools.open_book, B, None),
    (ui_tools.open_cart, B, None),
    (specialist_tools.recommend_books, NB, WHEN_IDLE),
    (specialist_tools.note_taste, NB, SILENT),
]


def build_tools() -> list[FunctionTool]:
    tools = []
    for func, behavior, scheduling in TOOL_TABLE:
        tool = FunctionTool(func)
        tool.behavior = behavior
        tool.response_scheduling = scheduling
        tools.append(tool)
    names = {t.name for t in tools}
    if names != set(POLICIES):
        raise RuntimeError(f"tool table and policy allowlist differ: {names ^ set(POLICIES)}")
    return tools


def build_runner(settings: Settings, model=None) -> Runner:
    """``model`` overrides the configured Live model; tests pass a fake one."""
    agent = Agent(name="bookshop_voice_assistant", model=model or settings.live_model, instruction=VOICE_INSTRUCTION,
                  tools=build_tools())
    app = App(name=APP_NAME, root_agent=agent, plugins=[PolicyPlugin()])
    # Sessions last five minutes and die with the socket; durable state (cart, quota) is in Firestore.
    return Runner(app=app, session_service=InMemorySessionService())
