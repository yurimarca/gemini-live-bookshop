"""Root agent of the ``bookshop-specialists`` deployment on Agent Runtime.

One deployment, two specialists, and a deterministic router in front of them: the gateway
sends ``{"kind": "recommend" | "profile", "payload": {...}}`` and no LLM decides where it goes.
The specialist code itself lives in ``app/core`` and is copied from the gateway by
``agents/sync.sh``, so both hosts run exactly the same prompts, schemas and fallbacks.
"""

import os

from .core.agents import build_router

root_agent = build_router(os.environ.get("SPECIALIST_MODEL", "gemini-3.5-flash"))
