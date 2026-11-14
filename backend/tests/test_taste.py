"""Phase 3c: a taste profile that accumulates, persists per user and drives the researcher."""

import asyncio
import json
from types import SimpleNamespace as NS

from conftest import auth, make_settings
from fakes import ScriptedRunner
from fastapi.testclient import TestClient
from test_ws_live import connect, read_until, run_tool, start

from app.live.prompts import CART_EXPIRED, RETURNING
from app.state import MemoryState
from app.taste.profile import Profile, TasteStore, apply_note, chip
from main import create_app


def read_while(ws, done, limit: int = 200) -> list:
    """Collect JSON events until ``done(events)`` is true."""
    events = []
    for _ in range(limit):
        frame = ws.receive()
        if frame.get("text") is not None:
            events.append(json.loads(frame["text"]))
            if done(events):
                return events
    raise AssertionError(f"condition not met in {[e['type'] for e in events]}")


def taste_cards(events) -> list[dict]:
    return [m["updateDataModel"]["value"] for e in events if e["type"] == "a2ui"
            for m in e["messages"] if m.get("updateDataModel", {}).get("surfaceId") == "taste"]


# --- merge and weighting --------------------------------------------------------------
def test_repeated_likes_weigh_more_and_a_dislike_cancels_a_like():
    p = Profile()
    apply_note(p, likes=["Realism", "poetry"], dislikes=[], languages=["por"], session_id="s1", now=1.0)
    apply_note(p, likes=["realism "], dislikes=[], languages=[], session_id="s2", now=2.0)
    apply_note(p, likes=["horror"], dislikes=[], languages=[], session_id="s2", now=3.0)
    assert [chip(e) for e in Profile.ranked(p.likes)] == ["Realism ×2", "horror", "poetry"]
    assert p.likes[0].first_seen == 1.0 and p.likes[0].source_session == "s2"

    touched = apply_note(p, likes=[], dislikes=["Horror"], languages=[], session_id="s2", now=4.0)
    assert touched == ["horror"]
    assert [e.tag for e in p.likes] == ["Realism", "poetry"] and [e.tag for e in p.dislikes] == ["Horror"]
    apply_note(p, likes=["horror"], dislikes=[], languages=[], session_id="s3", now=5.0)
    assert p.dislikes == [] and "horror" in [e.tag for e in p.likes]
    assert p.note_count == 5 and p.to_taste().likes[0] == "Realism" and p.languages == ["por"]
    assert apply_note(p, likes=["  "], dislikes=[], languages=[], session_id="s3", now=6.0) == []
    assert p.note_count == 5  # an empty note is not a note


async def test_store_persists_expires_and_forgets():
    now = [1_000_000.0]
    store = TasteStore(MemoryState(), ttl_days=30, clock=lambda: now[0])
    await store.note("alice", likes=["realism"], dislikes=[], languages=[], session_id="s1")
    await store.note("alice", likes=["realism"], dislikes=[], languages=[], session_id="s2")
    await store.set_summary("alice", "Likes realism.")
    loaded = await store.load("alice")
    assert loaded.likes[0].weight == 2 and loaded.summary == "Likes realism." and loaded.expires_at is not None
    assert (await store.load("bobby")).is_empty()  # isolation between uids

    now[0] += 29 * 86400
    assert not (await store.load("alice")).is_empty()
    now[0] += 2 * 86400  # 31 days without a note
    assert (await store.load("alice")).is_empty()

    await store.note("alice", likes=["poetry"], dislikes=[], languages=[], session_id="s3")
    assert [e.tag for e in (await store.load("alice")).likes] == ["poetry"]  # an expired profile starts over
    await store.clear("alice")
    assert (await store.load("alice")).is_empty()


# --- across sessions ------------------------------------------------------------------
def test_profile_persists_across_two_sessions_of_the_same_user_and_not_to_others():
    app = create_app(make_settings(auto_research_after_notes=0))
    with TestClient(app) as client:
        async def notes(session_id):
            await run_tool(session_id, "note_taste", "fc-1", likes=["realism", "Machado de Assis"], languages=["por"])
            await run_tool(session_id, "note_taste", "fc-2", likes=["realism"])

        with connect(client, ScriptedRunner([notes, NS(turn_complete=True)])) as ws:
            ws.send_text(start(id_token="dev:alice"))
            events = read_until(ws, "turn.complete")
        cards = taste_cards(events)
        assert cards[-1]["likes"] == ["realism ×2", "Machado de Assis"] and cards[-1]["fresh"] == ["realism ×2"]
        assert (cards[-1]["notes_session"], cards[-1]["notes_total"]) == (2, 2)

        runner = ScriptedRunner()
        with connect(client, runner) as ws:
            ws.send_text(start(id_token="dev:alice"))
            events = read_until(ws, "a2ui")
            ws.send_text(json.dumps({"type": "session.stop"}))
            read_until(ws, "close")
        card = taste_cards(events)[0]
        assert card["likes"] == ["realism ×2", "Machado de Assis"] and card["languages"] == ["por"]
        assert (card["notes_session"], card["notes_total"], card["fresh"]) == (0, 2, [])
        greeting = runner.received[0].content.parts[0].text
        assert greeting.endswith(RETURNING) and "realism" not in greeting  # no stored tags in the prompt

        with connect(client, ScriptedRunner()) as ws:
            ws.send_text(start(id_token="dev:bobby"))
            ws.send_text(json.dumps({"type": "ping"}))
            events = read_until(ws, "pong")
        assert "a2ui" not in [e["type"] for e in events]


def test_three_new_notes_start_the_researcher_on_its_own():
    app = create_app(make_settings(auto_research_after_notes=3))
    with TestClient(app) as client:
        async def notes(session_id):
            for i, like in enumerate(["Machado de Assis", "realism", "poetry"]):
                await run_tool(session_id, "note_taste", f"fc-{i}", likes=[like])

        with connect(client, ScriptedRunner([notes])) as ws:
            ws.send_text(start(id_token="dev:alice"))
            events = read_while(ws, lambda ev: any(
                e["type"] == "tool.finished" and e["call_id"].startswith("auto-research-")
                and ":" not in e["call_id"] for e in ev))

    started = {e["call_id"]: e for e in events if e["type"] == "tool.started"}
    auto = next(e for c, e in started.items() if c.startswith("auto-research-"))
    assert auto["agent"] == "researcher" and auto["args_summary"] == "auto: 3 new notes" and "parent_call_id" not in auto
    rec = started[f"{auto['call_id']}:recommender"]
    assert rec["parent_call_id"] == auto["call_id"]
    shelf = next(e for e in events if e["type"] == "a2ui" and e["agent"] == "researcher")
    assert shelf["messages"][0]["createSurface"]["surfaceId"] == "taste-recs"
    books = shelf["messages"][-1]["updateDataModel"]["value"]["books"]
    assert books and all(b["tag"] in {"Machado de Assis", "realism", "poetry"} for b in books)
    assert sum(1 for e in events if e["type"] == "tool.started" and e["agent"] == "researcher") == 1


def test_voice_research_nests_researcher_then_recommender():
    app = create_app(make_settings(auto_research_after_notes=0))
    result = {}
    with TestClient(app) as client:
        async def step(session_id):
            result["empty"] = await run_tool(session_id, "research_for_taste", "fc-0")
            await run_tool(session_id, "note_taste", "fc-1", likes=["Machado de Assis", "gothic horror"])
            result["ready"] = await run_tool(session_id, "research_for_taste", "fc-2")

        with connect(client, ScriptedRunner([step, NS(turn_complete=True)])) as ws:
            ws.send_text(start(id_token="dev:alice"))
            events = read_until(ws, "turn.complete")

    assert result["empty"]["status"] == "no_profile"
    assert result["ready"]["status"] == "ready" and all(p["taste"] for p in result["ready"]["picks"])
    started = {e["call_id"]: e for e in events if e["type"] == "tool.started"}
    assert started["fc-2"]["agent"] == "voice" and started["fc-2"]["scheduling_requested"] == "WHEN_IDLE"
    assert started["fc-2:researcher"]["parent_call_id"] == "fc-2"
    assert started["fc-2:researcher:recommender"]["parent_call_id"] == "fc-2:researcher"
    timeline = json.dumps([e for e in events if e["type"].startswith("tool.")])
    assert "Machado" not in timeline and "gothic" not in timeline  # counts only, never the tags


def test_forget_my_taste_clears_the_store_the_cards_and_tells_the_model(client, svc):
    async def notes(session_id):
        await run_tool(session_id, "note_taste", "fc-1", likes=["poetry"])

    runner = ScriptedRunner([notes, NS(turn_complete=True)])
    with connect(client, runner) as ws:
        ws.send_text(start())
        read_until(ws, "turn.complete")
        assert [e.tag for e in asyncio.run(svc.taste.load("dev-tester1")).likes] == ["poetry"]
        ws.send_text(json.dumps({"type": "a2ui.action", "op_id": "op-forget01", "message": {
            "version": "1.0", "action": {"name": "forget_taste", "surfaceId": "taste", "context": {}}}}))
        events = read_until(ws, "a2ui")
        assert events[-1]["messages"] == [{"version": "1.0", "deleteSurface": {"surfaceId": "taste"}}]
        ws.send_text(json.dumps({"type": "session.stop"}))
        read_until(ws, "close")
    assert asyncio.run(svc.taste.load("dev-tester1")).is_empty()
    assert any("Forget my taste" in (r.content.parts[0].text or "") for r in runner.received if r.content)

    asyncio.run(svc.taste.note("dev-tester1", likes=["poetry"], dislikes=[], languages=[], session_id="x"))
    assert client.delete("/api/profile", headers=auth()).status_code == 204
    assert asyncio.run(svc.taste.load("dev-tester1")).is_empty()
    assert client.delete("/api/profile").status_code == 401


# --- the agent drives the page (C2) and speaks the cart expiry (C5) --------------------
def test_language_navigation_and_highlight_reach_the_page():
    app = create_app(make_settings(cart_hold_seconds=1))
    out = {}
    with TestClient(app) as client:
        async def step(session_id):
            out["lang"] = await run_tool(session_id, "set_language", "fc-1", locale="pt-BR")
            out["browse"] = await run_tool(session_id, "browse_catalog", "fc-2", subject="poetry", language="pt")
            out["all"] = await run_tool(session_id, "browse_catalog", "fc-3", query="machado", sort="year_old")
            out["bad"] = await run_tool(session_id, "browse_catalog", "fc-4", subject="Made Up")
            out["hl"] = await run_tool(session_id, "highlight_book", "fc-5", book_id="OL1003040W")
            await run_tool(session_id, "add_to_cart", "fc-6", book_id="OL27482W", quantity=1)

        runner = ScriptedRunner([step])
        with connect(client, runner) as ws:
            ws.send_text(start())
            events = read_while(ws, lambda ev: any(e.get("op_id") == "hold-expired" for e in ev))
            ws.send_text(json.dumps({"type": "session.stop"}))
            read_until(ws, "close")

    assert next(e for e in events if e["type"] == "ui.locale")["locale"] == "pt-BR"
    navs = [e["params"] for e in events if e["type"] == "ui.navigate"]
    assert navs == [{"subject": "Poetry", "lang": "por"}, {"q": "machado", "sort": "year_old"}]
    # Poetry with Portuguese editions: The Odyssey and Os Lusíadas.
    assert out["browse"]["matching_books"] == 2 and out["all"]["matching_books"] >= 1
    assert out["bad"] == {"error": "denied", "reason": "bad_subject"}
    hl = next(e for e in events if e["type"] == "ui.command")
    assert hl == {**hl, "command": "highlight_book", "book_id": "OL1003040W"}
    texts = [r.content.parts[0].text for r in runner.received if r.content]
    assert CART_EXPIRED["pt-BR"] in texts  # spoken in the session's language, written by the gateway


def test_cart_expiry_is_silent_when_turned_off():
    app = create_app(make_settings(cart_hold_seconds=1, announce_cart_expiry=False))
    with TestClient(app) as client:
        async def step(session_id):
            await run_tool(session_id, "add_to_cart", "fc-1", book_id="OL27482W", quantity=1)

        runner = ScriptedRunner([step])
        with connect(client, runner) as ws:
            ws.send_text(start())
            read_while(ws, lambda ev: any(e.get("op_id") == "hold-expired" for e in ev))
            ws.send_text(json.dumps({"type": "session.stop"}))
            read_until(ws, "close")
    assert not any(CART_EXPIRED["en"] == r.content.parts[0].text for r in runner.received if r.content)
