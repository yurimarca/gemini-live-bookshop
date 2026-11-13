import asyncio
import json
from types import SimpleNamespace as NS

import pytest
from conftest import ORIGIN, make_settings
from fakes import ScriptedRunner, agent_said, audio_event, user_said
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.live.policy_plugin import PolicyPlugin
from app.live.voice_agent import build_tools
from main import create_app

START = {"type": "session.start", "protocol": 2, "id_token": "dev:tester1", "locale": "en", "a2ui_capabilities": {}}
TOOLS = {t.name: t for t in build_tools()}


def start(**overrides) -> str:
    return json.dumps({**START, **overrides})


def read_until(ws, wanted: str, limit: int = 80) -> list:
    """Collect frames until an event of type ``wanted``. Binary frames appear as ("audio", n_bytes)."""
    seen = []
    for _ in range(limit):
        frame = ws.receive()
        if frame["type"] == "websocket.close":
            seen.append({"type": "close", "code": frame.get("code")})
            return seen
        if frame.get("bytes") is not None:
            seen.append({"type": "audio", "bytes": len(frame["bytes"])})
            continue
        event = json.loads(frame["text"])
        seen.append(event)
        if event["type"] == wanted:
            return seen
    raise AssertionError(f"{wanted} not seen in {[e['type'] for e in seen]}")


def types_of(events) -> list[str]:
    return [e["type"] for e in events]


async def run_tool(session_id: str, name: str, call_id: str, **args):
    """What ADK does for a tool call: plugin gate, tool body, plugin after-callback."""
    plugin, tool = PolicyPlugin(), TOOLS[name]
    tc = NS(session=NS(id=session_id), function_call_id=call_id)
    result = await plugin.before_tool_callback(tool=tool, tool_args=args, tool_context=tc)
    if result is None:
        result = await tool.func(tc, **args)
        await plugin.after_tool_callback(tool=tool, tool_args=args, tool_context=tc, result=result)
    return result


def connect(client, runner):
    client.app.state.runner = runner
    return client.websocket_connect("/ws/live", headers=ORIGIN)


# --- handshake ----------------------------------------------------------------------
def test_origin_is_checked(client):
    with client.websocket_connect("/ws/live", headers={"origin": "https://evil.example"}) as ws:
        assert read_until(ws, "close")[-1]["code"] == 4403


@pytest.mark.parametrize("first_frame", ["not json", start(protocol=1), json.dumps({"type": "ping"}),
                                         start(extra_field="x")])
def test_bad_start_closes_with_4400(client, first_frame):
    with client.websocket_connect("/ws/live", headers=ORIGIN) as ws:
        ws.send_text(first_frame)
        assert read_until(ws, "close")[-1]["code"] == 4400


def test_bad_token_closes_with_4401_and_does_not_start_a_model_session(client):
    runner = ScriptedRunner()
    with connect(client, runner) as ws:
        ws.send_text(start(id_token="forged"))
        events = read_until(ws, "close")
    assert events[-1]["code"] == 4401 and events[0]["message"].startswith("Sign-in failed")
    assert runner.session_ids == []


def test_quota_closes_with_4429():
    app = create_app(make_settings(sessions_per_user_per_day=1))
    with TestClient(app) as client:
        with connect(client, ScriptedRunner()) as ws:
            ws.send_text(start())
            read_until(ws, "session.ready")
            ws.send_text(json.dumps({"type": "session.stop"}))
            read_until(ws, "close")
        with connect(client, ScriptedRunner()) as ws:
            ws.send_text(start())
            assert read_until(ws, "close")[-1]["code"] == 4429


# --- a conversation -----------------------------------------------------------------
def test_ready_then_transcript_audio_and_turn_events_in_order(client):
    runner = ScriptedRunner([
        user_said("something like "), user_said("Dom Casmurro", finished=True),
        agent_said("Sure, "), audio_event(), agent_said("let me look."), audio_event(),
        NS(turn_complete=True),
    ])
    with connect(client, runner) as ws:
        ws.send_text(start())
        events = read_until(ws, "turn.complete")
        ready = events[0]
        assert ready["type"] == "session.ready" and ready["limits"]["max_seconds"] == 300
        assert ready["dataset_version"] == "ol-fixture-r1" and ready["cart"]["items"] == []
        assert [e["seq"] for e in events if "seq" in e] == sorted(e["seq"] for e in events if "seq" in e)
        assert types_of(events[1:]) == [
            "transcript.delta", "transcript.delta", "transcript.final",       # user
            "transcript.delta", "audio.start", "audio", "transcript.delta", "audio",
            "transcript.final", "turn.complete"]
        user_final, agent_final = events[3], events[-2]
        assert user_final["text"] == "something like Dom Casmurro" and user_final["role"] == "user"
        assert agent_final["text"] == "Sure, let me look." and agent_final["interrupted"] is False
        assert events[5]["utterance_id"] == agent_final["utterance_id"]  # audio.start names the utterance
        ws.send_text(json.dumps({"type": "session.stop"}))
        tail = read_until(ws, "close")
        assert tail[-2] == {**tail[-2], "type": "session.ended", "reason": "client"} and tail[-1]["code"] == 1000
    greeting = runner.received[0].content.parts[0].text
    assert greeting.startswith("[system]")  # written by the server, not the client


def test_barge_in_marks_the_utterance_interrupted(client):
    runner = ScriptedRunner([agent_said("I found a few"), audio_event(), NS(interrupted=True)])
    with connect(client, runner) as ws:
        ws.send_text(start())
        events = read_until(ws, "turn.interrupted")
    final = next(e for e in events if e["type"] == "transcript.final")
    assert final["interrupted"] is True and events[-1]["utterance_id"] == final["utterance_id"]


def test_cumulative_transcription_is_also_handled(client):
    runner = ScriptedRunner([agent_said("Hello"), agent_said("Hello there"), NS(turn_complete=True)])
    with connect(client, runner) as ws:
        ws.send_text(start())
        events = read_until(ws, "turn.complete")
    assert [e["text"] for e in events if e["type"] == "transcript.delta"] == ["Hello", " there"]


def test_client_audio_text_and_mute_reach_the_model(client):
    runner = ScriptedRunner()
    with connect(client, runner) as ws:
        ws.send_text(start())
        read_until(ws, "session.ready")
        ws.send_bytes(b"\x00\x01" * 160)
        ws.send_text(json.dumps({"type": "mic", "muted": True}))
        ws.send_bytes(b"\x00\x02" * 160)  # dropped while muted
        ws.send_text(json.dumps({"type": "user.text", "text": "hello", "client_msg_id": "m1"}))
        assert read_until(ws, "transcript.final")[-1]["text"] == "hello"
        ws.send_text(json.dumps({"type": "user.text", "text": "x" * 501, "client_msg_id": "m2"}))
        assert read_until(ws, "error")[-1]["code"] == "bad_message"
        ws.send_text(json.dumps({"type": "ping"}))
        read_until(ws, "pong")
        ws.send_text(json.dumps({"type": "session.stop"}))
        read_until(ws, "close")
    blobs = [r.blob for r in runner.received if r.blob]
    texts = [r.content.parts[0].text for r in runner.received if r.content]
    assert len(blobs) == 1 and blobs[0].mime_type == "audio/pcm;rate=16000"
    assert texts[-1] == "hello" and len(texts) == 2


# --- tools, timeline, A2UI ------------------------------------------------------------
def test_recommendation_flow_emits_timeline_and_a2ui(client):
    async def step(session_id):
        await run_tool(session_id, "note_taste", "fc-1", likes=["gothic horror"])
        result = await run_tool(session_id, "recommend_books", "fc-2", request="vampires")
        assert result["status"] == "ready" and result["picks"]

    with connect(client, ScriptedRunner([step, NS(turn_complete=True)])) as ws:
        ws.send_text(start())
        events = read_until(ws, "turn.complete")

    started = {e["call_id"]: e for e in events if e["type"] == "tool.started"}
    finished = {e["call_id"]: e for e in events if e["type"] == "tool.finished"}
    assert started["fc-1"] == {**started["fc-1"], "agent": "voice", "tool": "note_taste",
                               "behavior": "NON_BLOCKING", "scheduling_requested": "SILENT", "runs_on": "gateway"}
    assert started["fc-2"]["scheduling_requested"] == "WHEN_IDLE"
    assert started["fc-2:recommender"]["agent"] == "recommender" and started["fc-2:recommender"]["parent_call_id"] == "fc-2"
    assert started["fc-1:taste_profiler"]["agent"] == "taste_profiler"
    assert finished["fc-2"]["status"] == "ok" and finished["fc-2"]["scheduling_effective"] == "WHEN_IDLE"
    assert "vampires" not in json.dumps([started, finished])  # no raw user content on the timeline
    assert [e["stage"] for e in events if e["type"] == "tool.progress"] == ["gathering_candidates", "ranking"]

    a2ui = [e for e in events if e["type"] == "a2ui"]
    assert [e["agent"] for e in a2ui] == ["taste_profiler", "recommender"]
    recs = a2ui[1]["messages"]
    assert recs[0]["createSurface"]["surfaceId"] == "recs" and recs[-1]["updateDataModel"]["value"]["books"]
    assert all(m["version"] == "1.0" for m in recs)


def test_denied_tool_call_never_runs(client):
    outcome = {}

    async def step(session_id):
        outcome["bad_id"] = await run_tool(session_id, "add_to_cart", "fc-1", book_id="OL1W; rm -rf", quantity=1)
        outcome["unknown"] = await run_tool(session_id, "add_to_cart", "fc-2", book_id="OL404W", quantity=1)

    with connect(client, ScriptedRunner([step, NS(turn_complete=True)])) as ws:
        ws.send_text(start())
        events = read_until(ws, "turn.complete")
    assert outcome["bad_id"] == {"error": "denied", "reason": "bad_book_id"}
    assert outcome["unknown"] == {"error": "unknown_book"}
    statuses = {e["call_id"]: e["status"] for e in events if e["type"] == "tool.finished"}
    assert statuses == {"fc-1": "denied", "fc-2": "error"}
    assert "cart.updated" not in types_of(events)


def test_voice_cart_updates_socket_and_rest_and_cart_hold_card(client):
    async def step(session_id):
        await run_tool(session_id, "add_to_cart", "fc-1", book_id="OL27482W", quantity=2)
        await run_tool(session_id, "show_books", "fc-2", book_ids=["OL27482W", "OL404W"])

    with connect(client, ScriptedRunner([step, NS(turn_complete=True)])) as ws:
        ws.send_text(start())
        events = read_until(ws, "turn.complete")
        cart = next(e for e in events if e["type"] == "cart.updated")
        assert cart["items"][0]["quantity"] == 2 and cart["hold_expires_at"] and cart["op_id"] == "voice-fc-1"
        timer = next(e for e in events if e["type"] == "tool.started" and e["agent"] == "cart_timer")
        assert timer["tool"] == "hold_cart"
        hold = next(e for e in events if e["type"] == "a2ui" and e["agent"] == "cart_timer")
        assert hold["messages"][-1]["updateDataModel"]["value"]["item_count"] == 2
        ui = next(e for e in events if e["type"] == "ui.command")
        assert ui["command"] == "show_books" and ui["book_ids"] == ["OL27482W"]  # unknown ids are dropped
        # The same cart is visible over REST for the same user.
        rest = client.get("/api/cart", headers={"Authorization": "Bearer dev:tester1"}).json()
        assert rest["items"][0]["id"] == "OL27482W"


def test_a2ui_actions_are_a_closed_set_handled_by_the_server(client):
    def action(name, op, **context):
        return json.dumps({"type": "a2ui.action", "op_id": op,
                           "message": {"version": "1.0", "action": {"name": name, "surfaceId": "recs",
                                                                    "context": context}}})

    runner = ScriptedRunner()
    with connect(client, runner) as ws:
        ws.send_text(start())
        read_until(ws, "session.ready")
        ws.send_text(action("add_to_cart", "op-aaaaaaaa", book_id="OL85892W"))
        assert read_until(ws, "cart.updated")[-1]["items"][0]["id"] == "OL85892W"
        ws.send_text(action("open_book", "op-bbbbbbbb", book_id="OL85892W"))
        assert read_until(ws, "ui.command")[-1]["book_id"] == "OL85892W"
        ws.send_text(action("checkout", "op-cccccccc"))
        assert read_until(ws, "error")[-1]["code"] == "bad_action"
        ws.send_text(action("add_to_cart", "op-dddddddd", book_id="OL404W"))
        assert read_until(ws, "error")[-1]["code"] == "bad_action"
    # Nothing a UI action carries is forwarded to the voice model.
    assert all("OL85892W" not in str(r.content) for r in runner.received if r.content)


def test_two_sessions_never_see_each_others_events(client):
    """Regression test for the prototype's module-global notification queue."""
    runner_a, runner_b = ScriptedRunner(), ScriptedRunner()

    async def step(session_id):
        await run_tool(session_id, "add_to_cart", "fc-a", book_id="OL27482W", quantity=1)
        await run_tool(session_id, "note_taste", "fc-b", likes=["private taste"])

    runner_a.script = [step, NS(turn_complete=True)]
    with connect(client, runner_a) as ws_a:
        ws_a.send_text(start(id_token="dev:alice"))
        with connect(client, runner_b) as ws_b:
            ws_b.send_text(start(id_token="dev:bobby"))
            read_until(ws_b, "session.ready")
            events_a = read_until(ws_a, "turn.complete")
            ws_b.send_text(json.dumps({"type": "ping"}))
            events_b = read_until(ws_b, "pong")
    assert "cart.updated" in types_of(events_a) and "a2ui" in types_of(events_a)
    assert types_of(events_b) == ["pong"]


def test_session_time_limit_warns_then_closes_with_4408():
    app = create_app(make_settings(session_max_seconds=2, session_warn_seconds=1))
    with TestClient(app) as client:
        with connect(client, ScriptedRunner()) as ws:
            ws.send_text(start())
            events = read_until(ws, "close")
    assert "session.warning" in types_of(events)
    assert events[-2]["reason"] == "time_limit" and events[-1]["code"] == 4408


def test_second_session_for_the_same_user_is_refused(client):
    with connect(client, ScriptedRunner()) as ws:
        ws.send_text(start())
        read_until(ws, "session.ready")
        with client.websocket_connect("/ws/live", headers=ORIGIN) as second:
            second.send_text(start())
            assert read_until(second, "close")[-1]["code"] == 4503
