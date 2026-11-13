"""Spike 3: is a pending tool response delivered after the connection drops and resumes?

Uses the google-genai Live client directly, because the drop has to be forced:
  1. connect with session resumption on, and ask a question that triggers a NON_BLOCKING tool call;
  2. keep the resumption handle, and close the socket while the call is still pending;
  3. reconnect with the handle and send the FunctionResponse for the old call ID;
  4. see whether the model speaks about it, ignores it, or the server rejects it.

    cd backend && uv run python ../spikes/spike3_reconnect.py

Write down: was a resumption handle issued before the call? Did step 3 raise or close
(code, reason)? Did the model use the late response? The gateway treats a reconnect as a new
session today; this result decides whether that can ever change.
"""

from __future__ import annotations

import asyncio
import os

from _common import MODEL, log, require_project
from google import genai
from google.genai import types

TOOL = types.Tool(function_declarations=[types.FunctionDeclaration(
    name="find_recommendations", description="Find book recommendations. Takes a while.",
    behavior=types.Behavior.NON_BLOCKING,
    parameters_json_schema={"type": "object", "properties": {"topic": {"type": "string"}}, "required": ["topic"]})])


def config(handle: str | None) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO], tools=[TOOL],
        output_audio_transcription=types.AudioTranscriptionConfig(),
        session_resumption=types.SessionResumptionConfig(handle=handle),
        system_instruction="You are a bookshop assistant. For recommendations call find_recommendations "
                           "and keep chatting while it runs.")


async def listen(session, seconds: float, state: dict, stop_when_ready: bool = False) -> None:
    """Log server messages. With stop_when_ready, return as soon as a tool call is pending and a
    resumption handle has arrived after it (the moment to drop the connection)."""
    async def loop() -> None:
        # session.receive() ends at each turn_complete, so keep calling it until the timeout.
        while True:
            async for message in session.receive():
                if handle(message):
                    return

    def handle(message) -> bool:
        """Log one message; True means stop listening."""
        update = message.session_resumption_update
        if update:
            log("RESUMPTION_UPDATE", f"resumable={update.resumable} new_handle={bool(update.new_handle)} "
                                     f"after_call={'call' in state}")
            if update.new_handle:
                state["handle"] = update.new_handle
                state["handles"] = state.get("handles", 0) + 1
                if "call" in state:
                    state["handle_after_call"] = True
        if message.tool_call:
            for call in message.tool_call.function_calls or []:
                state["call"] = call
                log("TOOL_CALL", f"id={call.id} name={call.name}")
        if message.tool_call_cancellation:
            log("TOOL_CANCELLED", str(message.tool_call_cancellation.ids))
        content = message.server_content
        if content and content.output_transcription and content.output_transcription.text:
            log("AGENT_SAYS", repr(content.output_transcription.text))
        if content and content.turn_complete:
            log("TURN_COMPLETE")
        if message.go_away:
            log("GO_AWAY", str(message.go_away.time_left))
        return bool(stop_when_ready and state.get("handle_after_call"))

    try:
        await asyncio.wait_for(loop(), timeout=seconds)
    except asyncio.TimeoutError:
        pass


async def main() -> None:
    client = genai.Client(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"],
                          location=os.environ["GOOGLE_CLOUD_LOCATION"])
    state: dict = {}
    log("CONNECT 1", MODEL)
    async with client.aio.live.connect(model=MODEL, config=config(None)) as session:
        await session.send_client_content(turns=types.Content(role="user", parts=[types.Part(
            text="Please recommend a few Brazilian classics.")]), turn_complete=True)
        # Wait up to 45 s for a call and then a handle issued after it; dropping earlier tests nothing.
        await listen(session, 45, state, stop_when_ready=True)
    log("DROPPED", f"call pending={'call' in state} handles={state.get('handles', 0)} "
                   f"handle_after_call={state.get('handle_after_call', False)}")
    if "call" not in state or "handle" not in state:
        log("RESULT", "no tool call or no resumption handle in 45 s: nothing to test. Record that "
                      "(it may mean the server issues no handle while a call is pending).")
        return
    try:
        log("CONNECT 2", "with the resumption handle")
        async with client.aio.live.connect(model=MODEL, config=config(state["handle"])) as session:
            await session.send_tool_response(function_responses=[types.FunctionResponse(
                id=state["call"].id, name=state["call"].name,
                response={"picks": ["Dom Casmurro", "Vidas Secas"]},
                scheduling=types.FunctionResponseScheduling.WHEN_IDLE)])
            log("SENT", "late FunctionResponse for the old call id")
            await listen(session, 15, state)
        log("RESULT", "session stayed open; check AGENT_SAYS above for the picks")
    except Exception as exc:
        log("RESULT", f"rejected: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    require_project()
    asyncio.run(main())
