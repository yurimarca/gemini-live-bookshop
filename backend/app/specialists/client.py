"""Where the specialists run: in this process, or on Agent Runtime.

``SPECIALISTS_BACKEND=local|agent_runtime`` picks the backend, so the move to
Agent Runtime is reversible. Every path ends in the deterministic heuristic
when the model is off, slow or returns something unusable, so a specialist
call never fails the voice turn.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
from typing import Protocol

from ..config.settings import Settings
from .core import heuristics
from .core.schemas import (ProfileRequest, ProfileResult, RecommendRequest, RecommendResult, ResearchRequest,
                           ResearchResult, Taste)

log = logging.getLogger(__name__)

# Where the last specialist answer in this task came from: "agent_runtime", or "gateway" for the local
# path (including the fallback after a failed remote call). A ContextVar is per task, so concurrent
# sessions never see each other's value. Read it right after awaiting a specialist call.
_served_by: contextvars.ContextVar[str] = contextvars.ContextVar("specialist_served_by", default="gateway")


def served_by() -> str:
    return _served_by.get()


class SpecialistClient(Protocol):
    runs_on: str

    async def recommend(self, req: RecommendRequest) -> RecommendResult: ...
    async def profile(self, req: ProfileRequest) -> ProfileResult: ...
    async def research(self, req: ResearchRequest) -> ResearchResult: ...


def _parse_recommend(text: str, req: RecommendRequest) -> RecommendResult | None:
    try:
        raw = RecommendResult.model_validate({**json.loads(text), "source": "llm"})
    except (ValueError, TypeError):
        return None
    return heuristics.clean_llm_recommendation(raw, req)


def _parse_profile(text: str, req: ProfileRequest) -> ProfileResult | None:
    try:
        taste = Taste.model_validate(json.loads(text))
    except (ValueError, TypeError):
        return None
    taste.likes, taste.dislikes = taste.likes[:heuristics.MAX_TAGS], taste.dislikes[:heuristics.MAX_TAGS]
    if not taste.summary.strip():
        taste.summary = heuristics.summarize(taste, req.locale)
    return ProfileResult(taste=taste, source="llm")


def _parse_research(text: str, req: ResearchRequest) -> ResearchResult | None:
    try:
        raw = ResearchResult.model_validate({**json.loads(text), "source": "llm"})
    except (ValueError, TypeError):
        return None
    return heuristics.clean_llm_research(raw, req)


_BUILDERS = {"recommend": "build_recommender", "profile": "build_profiler", "research": "build_researcher"}


class LocalSpecialists:
    """In-process ADK agents. With ``use_llm=False`` only the heuristic runs (tests, offline work)."""

    runs_on = "gateway"

    def __init__(self, *, model, use_llm: bool, timeout: float, location: str = "") -> None:
        self._model, self._use_llm, self._timeout, self._location = model, use_llm, timeout, location
        self._runners: dict[str, object] = {}

    def _runner(self, kind: str):
        if kind not in self._runners:
            from google.adk.runners import InMemoryRunner

            from .core import agents

            if isinstance(self._model, str):
                self._model = agents.specialist_model(self._model, self._location)
            agent = getattr(agents, _BUILDERS[kind])(self._model)
            self._runners[kind] = InMemoryRunner(agent=agent, app_name=f"specialist_{kind}")
        return self._runners[kind]

    async def _ask(self, kind: str, payload: str) -> str:
        from google.genai import types

        runner = self._runner(kind)
        session = await runner.session_service.create_session(app_name=runner.app_name, user_id="gateway")
        text = ""
        try:
            async for event in runner.run_async(
                    user_id="gateway", session_id=session.id,
                    new_message=types.Content(role="user", parts=[types.Part(text=payload)])):
                if event.is_final_response() and event.content and event.content.parts:
                    text = "".join(p.text or "" for p in event.content.parts)
        finally:
            await runner.session_service.delete_session(
                app_name=runner.app_name, user_id="gateway", session_id=session.id)
        return text

    async def _try(self, kind: str, payload: str) -> str | None:
        _served_by.set("gateway")
        if not self._use_llm:
            return None
        try:
            return await asyncio.wait_for(self._ask(kind, payload), timeout=self._timeout)
        except Exception:  # a specialist failure must never surface to the shopper
            log.warning("local %s specialist failed; using the heuristic", kind, exc_info=True)
            return None

    async def recommend(self, req: RecommendRequest) -> RecommendResult:
        text = await self._try("recommend", req.model_dump_json())
        return (text and _parse_recommend(text, req)) or heuristics.recommend(req)

    async def profile(self, req: ProfileRequest) -> ProfileResult:
        text = await self._try("profile", req.model_dump_json())
        return (text and _parse_profile(text, req)) or heuristics.profile(req)

    async def research(self, req: ResearchRequest) -> ResearchResult:
        text = await self._try("research", req.model_dump_json())
        return (text and _parse_research(text, req)) or heuristics.research(req)


class AgentRuntimeSpecialists:
    """Calls the ``bookshop-specialists`` deployment over HTTPS. Falls back to the local path.

    The request is the reasoning-engine contract (``class_method`` + ``input``); the response is a
    stream of ADK events, one JSON object per line (optionally ``data:``-prefixed). The text of the
    last event that has any is the answer. Thought parts are skipped.
    """

    runs_on = "agent_runtime"

    def __init__(self, *, resource: str, location: str, timeout: float, fallback: LocalSpecialists) -> None:
        if not resource:
            raise ValueError("SPECIALISTS_AGENT_RESOURCE is required for SPECIALISTS_BACKEND=agent_runtime")
        self._url = f"https://{location}-aiplatform.googleapis.com/v1/{resource}:streamQuery?alt=sse"
        self._timeout, self._fallback = timeout, fallback
        self._credentials = None

    async def _token(self) -> str:
        import google.auth
        from google.auth.transport.requests import Request

        if self._credentials is None:
            self._credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        if not self._credentials.valid:
            await asyncio.to_thread(self._credentials.refresh, Request())
        return self._credentials.token

    async def _ask(self, kind: str, payload: dict) -> str | None:
        import httpx

        body = {"class_method": "async_stream_query",
                "input": {"user_id": "gateway", "message": json.dumps({"kind": kind, "payload": payload})}}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._url, json=body,
                                         headers={"Authorization": f"Bearer {await self._token()}"})
                resp.raise_for_status()
            text = ""
            for line in resp.text.splitlines():
                line = line.removeprefix("data:").strip()
                if not line:
                    continue
                parts = (json.loads(line).get("content") or {}).get("parts") or []
                chunk = "".join(p.get("text") or "" for p in parts if not p.get("thought"))
                if chunk:
                    text = chunk  # the last event with text is the final answer
            return text or None
        except Exception:  # the log checks grep for "specialist failed"
            log.warning("Agent Runtime %s specialist failed; using the local path", kind, exc_info=True)
            return None

    async def recommend(self, req: RecommendRequest) -> RecommendResult:
        text = await self._ask("recommend", req.model_dump(mode="json"))
        parsed = text and _parse_recommend(text, req)
        if parsed:
            _served_by.set("agent_runtime")
            return parsed
        return await self._fallback.recommend(req)

    async def profile(self, req: ProfileRequest) -> ProfileResult:
        text = await self._ask("profile", req.model_dump(mode="json"))
        parsed = text and _parse_profile(text, req)
        if parsed:
            _served_by.set("agent_runtime")
            return parsed
        return await self._fallback.profile(req)

    async def research(self, req: ResearchRequest) -> ResearchResult:
        text = await self._ask("research", req.model_dump(mode="json"))
        parsed = text and _parse_research(text, req)
        if parsed:
            _served_by.set("agent_runtime")
            return parsed
        return await self._fallback.research(req)


def build_specialists(settings: Settings) -> SpecialistClient:
    local = LocalSpecialists(model=settings.specialist_model, use_llm=settings.specialists_llm == "on",
                             timeout=settings.specialist_timeout_seconds, location=settings.specialist_location)
    if settings.specialists_backend == "agent_runtime":
        return AgentRuntimeSpecialists(resource=settings.specialists_agent_resource,
                                       location=settings.google_cloud_location,
                                       timeout=settings.specialist_timeout_seconds, fallback=local)
    return local
