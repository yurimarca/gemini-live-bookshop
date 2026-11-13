"""Spike 1 (gates everything): NON_BLOCKING tools with scheduling on gemini-3.8-live, through ADK 2.14.

Question: does the model keep talking while a slow tool runs, and does each scheduling mode
(WHEN_IDLE, INTERRUPT, SILENT) behave as documented? It also prints the raw transcription
events, to settle whether text arrives as fragments or as cumulative strings.

    cd backend
    uv run python ../spikes/spike1_async_tools.py --scheduling WHEN_IDLE
    uv run python ../spikes/spike1_async_tools.py --scheduling INTERRUPT
    uv run python ../spikes/spike1_async_tools.py --scheduling SILENT
    uv run python ../spikes/spike1_async_tools.py --scheduling INTERRUPT --wav speech.wav   # user speaks while the tool returns
    uv run python ../spikes/spike1_async_tools.py --blocking                                # the control run

What to write down in planning/research-summary.md:
- time of FUNCTION_CALL, of the first AUDIO after it, and of FUNCTION_RESPONSE: audio between
  the call and the response means the model did not wait.
- WHEN_IDLE: the model speaks about the result only after it stopped talking.
- INTERRUPT: it cuts itself off; with --wav, whether it waits for the user to finish instead.
- SILENT: no new speech after the response.
- whether a call is ever issued twice; any 1008 or 1011 close.
- IN_TRANSCRIPT / OUT_TRANSCRIPT lines: fragments or cumulative text, and the `finished` flag.
"""

from __future__ import annotations

import argparse
import asyncio

from _common import MODEL, log, read_wav_pcm16, require_project
from google.adk.agents import Agent, LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import InMemoryRunner
from google.adk.tools import FunctionTool
from google.genai import types


async def find_recommendations(topic: str) -> dict:
    """Find book recommendations for a topic. This takes several seconds.

    Args:
        topic: What the reader is interested in.
    """
    log("TOOL_BODY start", f"topic has {len(topic)} chars")
    TOOL_STARTED.set()
    await asyncio.sleep(DELAY)
    log("TOOL_BODY end")
    return {"picks": ["Dom Casmurro by Machado de Assis", "The Hobbit by J. R. R. Tolkien"]}


async def main(args: argparse.Namespace) -> None:
    tool = FunctionTool(find_recommendations)
    if args.blocking:
        tool.behavior = types.Behavior.BLOCKING
    else:
        tool.behavior = types.Behavior.NON_BLOCKING
        tool.response_scheduling = types.FunctionResponseScheduling(args.scheduling)
    if args.preamble:
        instruction = ("You are a chatty bookshop assistant. When asked for recommendations, FIRST say one or two "
                       "sentences telling the reader you are asking the shop's recommender and describing the shop, "
                       "and only THEN call find_recommendations, in the same turn. Speak about the picks when "
                       "they arrive.")
    else:
        instruction = ("You are a chatty bookshop assistant. When asked for recommendations, call "
                       "find_recommendations and KEEP TALKING while it runs: describe the shop for at least "
                       "fifteen seconds. Speak about the picks when they arrive.")
    agent = Agent(name="spike_agent", model=MODEL, tools=[tool], instruction=instruction)
    runner = InMemoryRunner(agent=agent, app_name="spike1")
    session = await runner.session_service.create_session(app_name="spike1", user_id="spike")
    queue = LiveRequestQueue()
    config = RunConfig(streaming_mode=StreamingMode.BIDI, response_modalities=[types.Modality.AUDIO],
                       input_audio_transcription=types.AudioTranscriptionConfig(),
                       output_audio_transcription=types.AudioTranscriptionConfig())
    log("CONFIG", f"model={MODEL} behavior={tool.behavior.value} scheduling={args.scheduling if not args.blocking else '-'}")
    queue.send_content(types.Content(role="user", parts=[types.Part(text="Hi! Can you recommend me some classics?")]))

    async def speak_later() -> None:
        """Play the WAV file as the user's voice right when the tool is about to return."""
        await asyncio.sleep(max(0.0, DELAY - 1.0))
        pcm = read_wav_pcm16(args.wav)
        log("USER_AUDIO start", f"{len(pcm) / 32000:.1f}s")
        for i in range(0, len(pcm), 3200):  # 100 ms chunks, in real time
            queue.send_realtime(types.Blob(mime_type="audio/pcm;rate=16000", data=pcm[i:i + 3200]))
            await asyncio.sleep(0.1)
        log("USER_AUDIO end")

    async def stop_later() -> None:
        await asyncio.sleep(args.seconds)
        queue.close()

    async def follow_up() -> None:
        """Type a second user message while the tool runs: does the model answer before the result?"""
        await TOOL_STARTED.wait()
        await asyncio.sleep(args.followup)
        log("USER_TEXT", "follow-up sent while the tool runs")
        queue.send_content(types.Content(role="user", parts=[types.Part(
            text="While we wait, what is your shop like? And do you sell poetry?")]))

    tasks = [asyncio.create_task(stop_later())]
    if args.wav:
        tasks.append(asyncio.create_task(speak_later()))
    if args.followup is not None:
        tasks.append(asyncio.create_task(follow_up()))
    audio_bytes, calls = 0, {}
    try:
        async for event in runner.run_live(user_id="spike", session_id=session.id, live_request_queue=queue,
                                           run_config=config):
            if event.input_transcription:
                log("IN_TRANSCRIPT", f"finished={event.input_transcription.finished} text={event.input_transcription.text!r}")
            if event.output_transcription:
                log("OUT_TRANSCRIPT", f"finished={event.output_transcription.finished} partial={event.partial} "
                                      f"text={event.output_transcription.text!r}")
            for part in (event.content.parts if event.content and event.content.parts else []):
                if part.inline_data and part.inline_data.data:
                    if audio_bytes == 0 or audio_bytes // 48000 != (audio_bytes + len(part.inline_data.data)) // 48000:
                        log("AUDIO", f"about {audio_bytes / 48000:.0f}s of speech so far")
                    audio_bytes += len(part.inline_data.data)
                if part.function_call:
                    calls[part.function_call.id] = calls.get(part.function_call.id, 0) + 1
                    log("FUNCTION_CALL", f"id={part.function_call.id} name={part.function_call.name}")
                if part.function_response:
                    log("FUNCTION_RESPONSE", f"id={part.function_response.id} scheduling={part.function_response.scheduling}")
            if event.interrupted:
                log("INTERRUPTED")
            if event.turn_complete:
                log("TURN_COMPLETE")
            if event.error_code:
                log("ERROR_EVENT", f"{event.error_code}: {event.error_message}")
    except Exception as exc:  # a 1008/1011 close is a result worth recording
        log("CONNECTION_ERROR", f"{type(exc).__name__}: {exc}")
    finally:
        for task in tasks:
            task.cancel()
    log("SUMMARY", f"function calls seen: {len(calls)} distinct, {sum(calls.values())} total; "
                   f"audio received: {audio_bytes / 48000:.1f}s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--scheduling", choices=["WHEN_IDLE", "INTERRUPT", "SILENT"], default="WHEN_IDLE")
    parser.add_argument("--blocking", action="store_true", help="control run: the same tool, BLOCKING")
    parser.add_argument("--delay", type=float, default=6.0, help="seconds the tool takes")
    parser.add_argument("--seconds", type=float, default=40.0, help="how long to keep the session open")
    parser.add_argument("--wav", help="16 kHz mono 16-bit WAV played as user speech when the tool returns")
    parser.add_argument("--preamble", action="store_true",
                        help="prompt variant: speak first, then call the tool in the same turn")
    parser.add_argument("--followup", type=float, metavar="SECONDS",
                        help="type a second user message this many seconds after the tool starts")
    parsed = parser.parse_args()
    DELAY = parsed.delay
    TOOL_STARTED = asyncio.Event()
    require_project()
    asyncio.run(main(parsed))
