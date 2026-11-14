"""AgentRuntimeSpecialists: request shape, response parsing, fallback, and where the answer came from."""

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.specialists.client import AgentRuntimeSpecialists, LocalSpecialists, served_by
from app.specialists.core.schemas import Candidate, RecommendRequest

RESOURCE = "projects/123/locations/us-central1/reasoningEngines/456"
FIXTURES = Path(__file__).parent / "fixtures"
REQ = RecommendRequest(request="vampires", candidates=[
    Candidate(id="OL85892W", title="Dracula", authors=["Bram Stoker"], category="Horror"),
    Candidate(id="OL450063W", title="Frankenstein", authors=["Mary Shelley"], category="Horror")])
ANSWER = {"headline": "Dark tales", "picks": [{"id": "OL85892W", "reason": "The classic vampire novel."}]}


def _event(text: str, **part) -> str:
    return json.dumps({"model_version": "gemini-3.5-flash", "author": "recommender",
                       "content": {"role": "model", "parts": [{"text": text, **part}]}})


async def _token(self) -> str:
    return "token"


def _run(body: str | Exception, req: RecommendRequest = REQ, seen: list | None = None):
    """One recommend() call against a fake :streamQuery endpoint. Returns (result, served_by)."""
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if isinstance(body, Exception):
            raise body
        return httpx.Response(200, text=body)

    local = LocalSpecialists(model="unused", use_llm=False, timeout=1)
    specialists = AgentRuntimeSpecialists(resource=RESOURCE, location="us-central1", timeout=1, fallback=local)
    real = httpx.AsyncClient

    async def go():
        result = await specialists.recommend(req)
        return result, served_by()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
        mp.setattr(AgentRuntimeSpecialists, "_token", _token)
        return asyncio.run(go())


def test_request_is_the_reasoning_engine_contract():
    seen: list[httpx.Request] = []
    _run(_event(json.dumps(ANSWER)), seen=seen)
    (request,) = seen
    assert str(request.url) == f"https://us-central1-aiplatform.googleapis.com/v1/{RESOURCE}:streamQuery?alt=sse"
    assert request.headers["authorization"] == "Bearer token"
    body = json.loads(request.content)
    assert body["class_method"] == "async_stream_query" and body["input"]["user_id"] == "gateway"
    envelope = json.loads(body["input"]["message"])
    assert envelope["kind"] == "recommend" and envelope["payload"]["candidates"][0]["id"] == "OL85892W"


@pytest.mark.parametrize("prefix", ["", "data: "])
def test_answer_from_agent_runtime(prefix):
    stream = "\n".join(prefix + line for line in [_event("thinking...", thought=True), _event(json.dumps(ANSWER))])
    result, where = _run(stream + "\n")
    assert result.source == "llm" and [p.id for p in result.picks] == ["OL85892W"]
    assert where == "agent_runtime"


def test_failure_falls_back_to_the_gateway():
    result, where = _run(httpx.ConnectError("down"))
    assert result.source == "heuristic" and result.picks and where == "gateway"


def test_unusable_answer_falls_back_to_the_gateway():
    bad = {"headline": "x", "picks": [{"id": "OL999W", "reason": "invented"}]}
    result, where = _run(_event(json.dumps(bad)))
    assert result.source == "heuristic" and where == "gateway"


@pytest.mark.skipif(not (FIXTURES / "streamquery_recommend.txt").exists(), reason="no recorded response")
def test_recorded_agent_runtime_response():
    """The body a real deployment returned for this request (recorded 2026-11-14, thought signatures cut)."""
    req = RecommendRequest.model_validate_json((FIXTURES / "streamquery_recommend_request.json").read_text())
    result, where = _run((FIXTURES / "streamquery_recommend.txt").read_text(), req=req)
    assert result.source == "llm" and result.picks and where == "agent_runtime"
    assert {p.id for p in result.picks} <= {c.id for c in req.candidates}
