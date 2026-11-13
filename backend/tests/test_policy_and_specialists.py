import json
from pathlib import Path

from app.a2ui import builders
from app.live.policy_plugin import POLICIES, check_args, summarize_args
from app.live.voice_agent import TOOL_TABLE, build_tools
from app.specialists.core import heuristics
from app.specialists.core.schemas import (Candidate, Pick, ProfileRequest, RecommendRequest, RecommendResult, Taste)
from app.tools.specialist_tools import _candidate, gather_candidates
from google.genai import types

SAMPLE = Path(__file__).resolve().parents[2] / "fixtures" / "a2ui-sample.json"


def test_every_tool_states_its_behavior_and_is_on_the_allowlist():
    tools = {t.name: t for t in build_tools()}
    assert set(tools) == set(POLICIES) and len(tools) == len(TOOL_TABLE)
    assert all(t.behavior is not None for t in tools.values())
    assert tools["recommend_books"].behavior is types.Behavior.NON_BLOCKING
    assert tools["recommend_books"].response_scheduling is types.FunctionResponseScheduling.WHEN_IDLE
    assert tools["note_taste"].response_scheduling is types.FunctionResponseScheduling.SILENT
    assert tools["add_to_cart"].behavior is types.Behavior.BLOCKING
    assert "tool_context" not in json.dumps(tools["search_books"]._get_declaration().model_dump(mode="json"))


def test_policy_allows_good_calls():
    assert check_args("search_books", {"query": "dom casmurro", "max_results": 3}) is None
    assert check_args("add_to_cart", {"book_id": "OL27482W", "quantity": 2}) is None
    assert check_args("get_cart", {}) is None
    assert check_args("note_taste", {"likes": ["realism"], "dislikes": None}) is None


def test_policy_denies_everything_else():
    assert check_args("set_user_info", {"email": "a@b.c"}) == "tool_not_allowed"
    assert check_args("add_to_cart", {"book_id": "OL27482W; DROP TABLE"}) == "bad_book_id"
    assert check_args("add_to_cart", {"book_id": "OL27482W", "quantity": 500}) == "bad_quantity"
    assert check_args("add_to_cart", {"book_id": "OL27482W", "quantity": True}) == "bad_quantity"
    assert check_args("add_to_cart", {"quantity": 1}) == "missing_argument"
    assert check_args("open_book", {"book_id": "OL27482W", "url": "https://evil.example"}) == "unknown_argument"
    assert check_args("search_books", {"query": "x" * 121}) == "bad_query"
    assert check_args("show_books", {"book_ids": ["OL1W"] * 7}) == "bad_book_ids"
    assert check_args("recommend_books", "not a dict") == "bad_arguments"


def test_timeline_summaries_never_carry_free_text():
    secret = "my name is Ana and I live at 12 Rua X"
    assert secret not in summarize_args("recommend_books", {"request": secret})
    assert summarize_args("recommend_books", {"request": secret}) == f"request: {len(secret)} chars"
    assert summarize_args("add_to_cart", {"book_id": "OL27482W", "quantity": 2}) == "book_id=OL27482W, quantity=2"
    assert secret not in (summarize_args("note_taste", {"likes": [secret]}) or "")


def _request(svc, text: str, taste: Taste | None = None) -> RecommendRequest:
    taste = taste or Taste()
    return RecommendRequest(request=text, taste=taste,
                            candidates=[_candidate(e) for e in gather_candidates(text, taste, set())])


def test_candidates_are_capped_and_exclude_the_cart(svc):
    entries = gather_candidates("brazilian classics", Taste(likes=["poetry"]), exclude={"OL1003040W"})
    assert 10 <= len(entries) <= 30 and "OL1003040W" not in {e.id for e in entries}


def test_heuristic_recommender_uses_request_and_taste(svc):
    result = heuristics.recommend(_request(svc, "vampires and gothic horror"))
    ids = [p.id for p in result.picks]
    assert "OL85892W" in ids[:2] and len(ids) == len(set(ids)) <= 4
    pt = heuristics.recommend(_request(svc, "poesia", Taste(likes=["Fernando Pessoa"])).model_copy(
        update={"locale": "pt-BR"}))
    assert pt.headline == "Escolhas para você" and any("Fernando Pessoa" in p.reason for p in pt.picks)


def test_heuristic_avoids_dislikes(svc):
    result = heuristics.recommend(_request(svc, "a classic", Taste(dislikes=["horror"])))
    categories = {svc.catalog.entry(p.id).category for p in result.picks}
    assert "Horror" not in categories


def test_llm_output_is_restricted_to_real_candidates():
    req = RecommendRequest(request="x", candidates=[Candidate(id="OL1W", title="A", authors=["B"], category="C")])
    raw = RecommendResult(headline="h", picks=[Pick(id="OL999W", reason="made up"), Pick(id="OL1W", reason="ok"),
                                               Pick(id="OL1W", reason="twice")])
    assert [p.id for p in heuristics.clean_llm_recommendation(raw, req).picks] == ["OL1W"]
    assert heuristics.clean_llm_recommendation(
        RecommendResult(headline="h", picks=[Pick(id="OL999W", reason="x")]), req) is None


def test_profile_merge():
    out = heuristics.profile(ProfileRequest(current=Taste(likes=["Horror", "poetry"]), likes=["Realism", "realism"],
                                            dislikes=["horror"], languages=["por"])).taste
    assert out.likes == ["Realism", "poetry"] and out.dislikes == ["horror"] and out.languages == ["por"]
    assert out.summary.startswith("Likes Realism")


def test_a2ui_builders_match_the_committed_sample():
    """The frontend renders this same file in its tests, so the two sides share one contract."""
    books = [{"id": "OL27482W", "title": "The Hobbit", "author": "J. R. R. Tolkien", "cover_id": 14627509,
              "price_cents": 1590, "reason": "Matches your interest in fantasy."},
             {"id": "OL1003040W", "title": "Dom Casmurro", "author": "Machado de Assis", "cover_id": 12918116,
              "price_cents": 3890, "reason": "One of the most read in Brazilian Literature."}]
    sample = {
        "recs": builders.recommendations(headline="Picked for you", subtitle="Recommender", books=books, first=True),
        "recs_update": builders.recommendations(headline="More picks", subtitle="Recommender", books=books[:1],
                                                first=False),
        "taste": builders.taste_profile(summary="Likes fantasy.", likes=["fantasy"], dislikes=["horror"],
                                        languages=["eng"], first=True),
        "cart_hold": builders.cart_hold(expires_at=1_800_000_000.0, item_count=2, total_cents=5480, expired=False,
                                        first=True),
        "delete": builders.delete_surface("recs"),
    }
    rendered = json.dumps(sample, indent=1, sort_keys=True) + "\n"
    if not SAMPLE.exists():
        SAMPLE.write_text(rendered)
    assert SAMPLE.read_text() == rendered, "fixtures/a2ui-sample.json is stale; delete it and rerun to regenerate"
    assert all(m["version"] == "1.0" for msgs in sample.values() for m in msgs)
    assert [next(k for k in m if k != "version") for m in sample["recs"]] == [
        "createSurface", "updateComponents", "updateDataModel"]
    assert [next(k for k in m if k != "version") for m in sample["recs_update"]] == ["updateDataModel"]


def test_action_parsing_is_a_closed_set():
    ok = {"version": "1.0", "action": {"name": "add_to_cart", "surfaceId": "recs", "context": {"book_id": "OL1W"}}}
    assert builders.parse_action(ok) == ("add_to_cart", {"book_id": "OL1W"}, "recs")
    assert builders.parse_action({"action": {"name": "checkout", "context": {}}}) is None
    assert builders.parse_action("add_to_cart") is None
