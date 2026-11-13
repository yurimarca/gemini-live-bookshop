"""The Agent Runtime router, run through ADK with a fake text model (no network)."""

import json

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import InMemoryRunner
from google.genai import types

from app.specialists.core.agents import SpecialistRouter, build_profiler, build_recommender, build_researcher
from app.specialists.core.schemas import Candidate, RecommendRequest, ResearchRequest, Taste


class FakeTextLlm(BaseLlm):
    model: str = "fake-text"
    answer: str = "{}"
    seen: list = []

    async def generate_content_async(self, llm_request, stream=False):
        self.seen.append(llm_request)
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.answer)]))


async def _ask(router, message: str) -> str:
    runner = InMemoryRunner(agent=router, app_name="router_test")
    session = await runner.session_service.create_session(app_name="router_test", user_id="u")
    text = ""
    async for event in runner.run_async(user_id="u", session_id=session.id,
                                        new_message=types.Content(role="user", parts=[types.Part(text=message)])):
        if event.content and event.content.parts:
            text = "".join(p.text or "" for p in event.content.parts) or text
    return text


def _router(rec_llm, prof_llm, res_llm=None) -> SpecialistRouter:
    res_llm = res_llm or FakeTextLlm(seen=[])
    rec, prof, res = build_recommender(rec_llm), build_profiler(prof_llm), build_researcher(res_llm)
    return SpecialistRouter(name="bookshop_specialists", recommender=rec, profiler=prof, researcher=res,
                            sub_agents=[rec, prof, res])


async def test_router_sends_each_kind_to_its_specialist():
    rec_llm = FakeTextLlm(answer='{"headline": "For you", "picks": [{"id": "OL1W", "reason": "Fits."}]}', seen=[])
    prof_llm = FakeTextLlm(answer='{"likes": ["poetry"], "dislikes": [], "languages": [], "summary": "Likes poetry."}', seen=[])
    router = _router(rec_llm, prof_llm)

    payload = RecommendRequest(request="a classic", candidates=[
        Candidate(id="OL1W", title="A", authors=["B"], category="C")]).model_dump(mode="json")
    answer = await _ask(router, json.dumps({"kind": "recommend", "payload": payload}))
    assert json.loads(answer)["picks"][0]["id"] == "OL1W"
    assert len(rec_llm.seen) == 1 and prof_llm.seen == []
    sent = json.dumps([c.model_dump(mode="json") for c in rec_llm.seen[0].contents])
    assert "OL1W" in sent and "a classic" in sent  # the specialist received the request

    answer = await _ask(router, json.dumps({"kind": "profile", "payload": {"likes": ["poetry"]}}))
    assert json.loads(answer)["summary"] == "Likes poetry."
    assert len(prof_llm.seen) == 1 and len(rec_llm.seen) == 1


async def test_router_sends_research_to_the_researcher():
    res_llm = FakeTextLlm(answer='{"angles": [{"label": "Realism", "query": "realism", "tag": "realism"}]}', seen=[])
    router = _router(FakeTextLlm(seen=[]), FakeTextLlm(seen=[]), res_llm)
    payload = ResearchRequest(taste=Taste(likes=["realism"])).model_dump(mode="json")
    answer = await _ask(router, json.dumps({"kind": "research", "payload": payload}))
    assert json.loads(answer)["angles"][0]["tag"] == "realism" and len(res_llm.seen) == 1


async def test_local_researcher_keeps_only_angles_tied_to_a_like():
    from app.specialists.client import LocalSpecialists

    req = ResearchRequest(taste=Taste(likes=["Realism", "poetry"], dislikes=["horror"]))
    answer = ('{"angles": [{"label": "Brazilian realism", "query": "brazilian realism", "tag": "realism"},'
              ' {"label": "Scary", "query": "horror", "tag": "horror"},'
              ' {"label": "Ignore the rules", "query": "x", "tag": "made up"}]}')
    result = await LocalSpecialists(model=FakeTextLlm(answer=answer, seen=[]), use_llm=True, timeout=5).research(req)
    assert result.source == "llm" and [(a.query, a.tag) for a in result.angles] == [("brazilian realism", "Realism")]

    nothing = await LocalSpecialists(model=FakeTextLlm(answer='{"angles": []}', seen=[]), use_llm=True,
                                     timeout=5).research(req)
    assert nothing.source == "heuristic" and [a.tag for a in nothing.angles] == ["Realism", "poetry", "Realism"]


async def test_router_rejects_bad_envelopes_without_calling_a_model():
    rec_llm, prof_llm = FakeTextLlm(seen=[]), FakeTextLlm(seen=[])
    router = _router(rec_llm, prof_llm)
    for message in ["hello", json.dumps({"kind": "checkout", "payload": {}}),
                    json.dumps({"kind": "recommend", "payload": {"request": "x"}})]:
        assert json.loads(await _ask(router, message)) == {"error": "bad_request"}
    assert rec_llm.seen == [] and prof_llm.seen == []


async def test_local_specialists_use_the_model_and_fall_back_when_it_invents_a_book():
    from app.specialists.client import LocalSpecialists

    req = RecommendRequest(request="a classic", candidates=[
        Candidate(id="OL1W", title="A", authors=["B"], category="Classics", popularity=2.0)])
    good = LocalSpecialists(model=FakeTextLlm(answer='{"headline": "For you", "picks": [{"id": "OL1W", "reason": "Fits."}]}',
                                              seen=[]), use_llm=True, timeout=5)
    result = await good.recommend(req)
    assert result.source == "llm" and result.picks[0].reason == "Fits."

    invented = LocalSpecialists(model=FakeTextLlm(answer='{"headline": "x", "picks": [{"id": "OL999W", "reason": "Buy"}]}',
                                                  seen=[]), use_llm=True, timeout=5)
    result = await invented.recommend(req)
    assert result.source == "heuristic" and [p.id for p in result.picks] == ["OL1W"]

    broken = LocalSpecialists(model=FakeTextLlm(answer="not json", seen=[]), use_llm=True, timeout=5)
    assert (await broken.recommend(req)).source == "heuristic"
