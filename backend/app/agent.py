"""
ADK Agent definition for the BookShop voice assistant.
"""

import logging

from google.adk.agents import Agent
from google.genai import types

from app.tools.ecommerce_tools import ECOMMERCE_TOOLS
from app.config.settings import settings

logger = logging.getLogger(__name__)

agent = Agent(
    name="bookshop_voice_assistant",
    model=settings.ai_model_name,
    instruction=settings.agent_config.system_instruction,
    tools=ECOMMERCE_TOOLS,
    generate_content_config=types.GenerateContentConfig(
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode=types.FunctionCallingConfigMode.AUTO
            )
        )
    ),
)

logger.info(
    "Agent '%s' created with %d tools: %s",
    agent.name,
    len(agent.tools),
    [getattr(t, "__name__", repr(t)) for t in agent.tools],
)
