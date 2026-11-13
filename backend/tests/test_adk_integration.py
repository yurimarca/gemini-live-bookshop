"""The real ADK live flow (Runner, plugin, tool dispatch) against a fake Live model.

This is the closest check possible without calling Gemini: it proves that ADK
2.14 declares each tool with the behavior set in ``voice_agent.py``, runs
NON_BLOCKING tools in the background, stamps their responses with the requested
scheduling, and routes every call through the policy plugin.
"""

import json

from conftest import ORIGIN
from fakes import FakeLiveLlm, call
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from test_ws_live import read_until, start, types_of

from app.live.voice_agent import build_runner


def _session(client, responses, wanted_responses: int):
    llm = FakeLiveLlm(responses=responses, history=[], sent=[], function_responses=[], declarations=[])
    client.app.state.runner = build_runner(client.app.state.settings, model=llm)
    events = []
    with client.websocket_connect("/ws/live", headers=ORIGIN) as ws:
        ws.send_text(start())
        events += read_until(ws, "session.ready")
        finished = 0
        while finished < wanted_responses:
            batch = read_until(ws, "tool.finished")
            events += batch
            finished += 1
        ws.send_text(json.dumps({"type": "ping"}))
        events += read_until(ws, "pong")
        ws.send_text(json.dumps({"type": "session.stop"}))
        events += read_until(ws, "close")
    return llm, events


def test_adk_declares_behaviors_and_stamps_scheduling(client):
    llm, events = _session(client, [
        call("search_books", "c1", query="hobbit"),
        call("recommend_books", "c2", request="gothic vampires"),
        call("note_taste", "c3", likes=["horror"]),
    ], wanted_responses=5)  # three voice calls plus the two specialist rows

    declared = {d.name: d.behavior for d in llm.declarations}
    assert declared["recommend_books"] is types.Behavior.NON_BLOCKING
    assert declared["note_taste"] is types.Behavior.NON_BLOCKING
    assert declared["search_books"] is types.Behavior.BLOCKING and declared["add_to_cart"] is types.Behavior.BLOCKING

    responses = {r.id: r for r in llm.function_responses}
    assert set(responses) == {"c1", "c2", "c3"}
    assert responses["c1"].scheduling is None and responses["c1"].response["count"] >= 1
    assert responses["c2"].scheduling is types.FunctionResponseScheduling.WHEN_IDLE
    assert responses["c2"].response["status"] == "ready"
    assert responses["c3"].scheduling is types.FunctionResponseScheduling.SILENT

    started = {e["call_id"]: e for e in events if e["type"] == "tool.started"}
    assert started["c1"]["behavior"] == "BLOCKING" and started["c2"]["behavior"] == "NON_BLOCKING"
    assert {e["agent"] for e in events if e["type"] == "a2ui"} == {"recommender", "taste_profiler"}
    assert "gothic vampires" not in json.dumps([e for e in events if e["type"].startswith("tool.")])


def test_adk_routes_bad_calls_through_the_policy_gate(client):
    llm, events = _session(client, [
        call("add_to_cart", "c1", book_id="OL27482W", quantity=999),
        call("set_user_info", "c2", email="a@b.c"),
    ], wanted_responses=2)
    responses = {r.id: r.response for r in llm.function_responses}
    assert responses["c1"] == {"error": "denied", "reason": "bad_quantity"}
    # A tool the agent does not have (here the prototype's PII tool) is refused by the same gate.
    assert responses["c2"] == {"error": "denied", "reason": "tool_not_allowed"}
    assert "cart.updated" not in types_of(events)
    assert [e["status"] for e in events if e["type"] == "tool.finished"] == ["denied", "denied"]


def test_model_audio_and_transcripts_flow_through_adk(client):
    llm = FakeLiveLlm(responses=[
        LlmResponse(output_transcription=types.Transcription(text="Hello!", finished=False), partial=True),
        LlmResponse(content=types.Content(role="model", parts=[types.Part(
            inline_data=types.Blob(mime_type="audio/pcm;rate=24000", data=b"\x01\x00" * 100))])),
        LlmResponse(turn_complete=True),
    ], history=[], sent=[], function_responses=[], declarations=[])
    client.app.state.runner = build_runner(client.app.state.settings, model=llm)
    with client.websocket_connect("/ws/live", headers=ORIGIN) as ws:
        ws.send_text(start())
        events = read_until(ws, "turn.complete")
        ws.send_bytes(b"\x00\x01" * 160)
        ws.send_text(json.dumps({"type": "session.stop"}))
        read_until(ws, "close")
    kinds = types_of(events)
    assert "audio" in kinds and "audio.start" in kinds
    final = next(e for e in events if e["type"] == "transcript.final")
    assert final["text"] == "Hello!" and final["role"] == "agent"
    assert llm.audio_in == 320
    assert any("[system]" in (p.text or "") for c in llm.sent for p in c.parts or [])  # the server greeting
