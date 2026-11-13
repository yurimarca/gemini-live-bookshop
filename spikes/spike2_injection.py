"""Spike 2: can the gateway put a background result into a live conversation?

Two mechanisms are tried in one session:
  A. Unsolicited content: a user-role text message sent mid-session with no pending tool call
     (what the cart-expiry announcement would use; ANNOUNCE_CART_EXPIRY stays off until this works).
  B. A NON_BLOCKING tool that waits on an external event and returns ONE delayed response.
With --unsolicited-response it also sends a FunctionResponse that answers no call, to see
whether the API rejects it.

    cd backend
    uv run python ../spikes/spike2_injection.py
    uv run python ../spikes/spike2_injection.py --unsolicited-response

Write down: did the model speak about the injected text (A)? Did it interrupt itself or wait?
Did the delayed response (B) arrive and get spoken? Did the unsolicited FunctionResponse
close the session (code and reason)?
"""

from __future__ import annotations

import argparse
import asyncio

from _common import MODEL, log, require_project
from google.adk.agents import Agent, LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import InMemoryRunner
from google.adk.tools import FunctionTool
from google.genai import types

release = asyncio.Event()


async def wait_for_stock_check(title: str) -> dict:
    """Check with the warehouse whether a title is available. The warehouse answers later.

    Args:
        title: The book title to check.
    """
    log("TOOL_BODY waiting")
    await release.wait()
    log("TOOL_BODY released")
    return {"title": title, "available": True, "note": "two copies left"}


async def main(args: argparse.Namespace) -> None:
    tool = FunctionTool(wait_for_stock_check)
    tool.behavior = types.Behavior.NON_BLOCKING
    tool.response_scheduling = types.FunctionResponseScheduling.WHEN_IDLE
    agent = Agent(name="spike_agent", model=MODEL, tools=[tool],
                  instruction="You are a bookshop assistant. When asked whether a book is available, call "
                              "wait_for_stock_check, say you are checking, and chat about the book meanwhile. "
                              "Messages in [system] brackets are notices from the shop: tell the shopper about them.")
    runner = InMemoryRunner(agent=agent, app_name="spike2")
    session = await runner.session_service.create_session(app_name="spike2", user_id="spike")
    queue = LiveRequestQueue()
    config = RunConfig(streaming_mode=StreamingMode.BIDI, response_modalities=[types.Modality.AUDIO],
                       output_audio_transcription=types.AudioTranscriptionConfig())
    queue.send_content(types.Content(role="user", parts=[types.Part(text="Is Dom Casmurro available?")]))

    async def script() -> None:
        await asyncio.sleep(10)
        log("INJECT A", "unsolicited user-role [system] text")
        queue.send_content(types.Content(role="user", parts=[types.Part(
            text="[system] The hold on the shopper's cart has just expired and the cart was emptied.")]))
        await asyncio.sleep(10)
        log("INJECT B", "releasing the delayed tool response")
        release.set()
        if args.unsolicited_response:
            await asyncio.sleep(10)
            log("INJECT C", "FunctionResponse with no pending call")
            queue.send_content(types.Content(role="user", parts=[types.Part(function_response=types.FunctionResponse(
                id="no-such-call", name="wait_for_stock_check", response={"note": "a second answer"},
                scheduling=types.FunctionResponseScheduling.WHEN_IDLE))]))
        await asyncio.sleep(12)
        queue.close()

    task = asyncio.create_task(script())
    try:
        async for event in runner.run_live(user_id="spike", session_id=session.id, live_request_queue=queue,
                                           run_config=config):
            if event.output_transcription and event.output_transcription.text:
                log("AGENT_SAYS", repr(event.output_transcription.text))
            for part in (event.content.parts if event.content and event.content.parts else []):
                if part.function_call:
                    log("FUNCTION_CALL", f"id={part.function_call.id}")
                if part.function_response:
                    log("FUNCTION_RESPONSE", f"id={part.function_response.id}")
            if event.interrupted:
                log("INTERRUPTED")
            if event.turn_complete:
                log("TURN_COMPLETE")
            if event.error_code:
                log("ERROR_EVENT", f"{event.error_code}: {event.error_message}")
    except Exception as exc:
        log("CONNECTION_ERROR", f"{type(exc).__name__}: {exc}")
    finally:
        task.cancel()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--unsolicited-response", action="store_true")
    require_project()
    asyncio.run(main(parser.parse_args()))
