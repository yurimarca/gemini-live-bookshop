"""Root agent of the ``bookshop-specialists`` deployment on Agent Runtime.

One deployment, three specialists, and a deterministic router in front of them: the gateway
sends ``{"kind": "recommend" | "profile" | "research", "payload": {...}}`` and no LLM decides where it goes.
The specialist code itself lives in ``app/core`` and is copied from the gateway by
``agents/sync.sh``, so both hosts run exactly the same prompts, schemas and fallbacks.

The scaffold's server (``fast_api_app.py``) and its reasoning-engine adapter import both
``root_agent`` and ``app`` from this module. ``app``'s name must match ``app_name`` in
``agents-cli-manifest.yaml``.
"""

import os

from google.adk.apps import App

from .core.agents import build_router, specialist_model

root_agent = build_router(specialist_model(os.environ.get("SPECIALIST_MODEL", "gemini-3.5-flash"),
                                           os.environ.get("SPECIALIST_LOCATION", "global")))

app = App(root_agent=root_agent, name="app")
