"""Stand-ins for Gemini Live, so the whole gateway is tested with no network and no credentials."""

from __future__ import annotations

import asyncio
import contextlib
from types import SimpleNamespace as NS

from google.adk.models.base_llm import BaseLlm
from google.adk.models.base_llm_connection import BaseLlmConnection
from google.adk.models.llm_response import LlmResponse
from google.adk.sessions import InMemorySessionService
from google.genai import types


def audio_event(data: bytes = b"\x01\x00" * 240):
    return NS(content=types.Content(role="model", parts=[
        types.Part(inline_data=types.Blob(mime_type="audio/pcm;rate=24000", data=data))]))


def user_said(text: str, finished: bool = False):
    return NS(input_transcription=types.Transcription(text=text, finished=finished))


def agent_said(text: str):
    return NS(output_transcription=types.Transcription(text=text, finished=False))


class ScriptedRunner:
    """Replaces ``Runner``: plays a list of events (or coroutines to await), then waits for the queue to close."""

    def __init__(self, script=()):
        self.session_service = InMemorySessionService()
        self.script = list(script)
        self.received: list = []
        self.session_ids: list[str] = []

    async def run_live(self, *, user_id, session_id, live_request_queue, run_config):
        self.session_ids.append(session_id)
        for step in self.script:
            if callable(step):
                await step(session_id)
            else:
                yield step
            await asyncio.sleep(0)
        while True:  # stay connected until the gateway closes the queue
            request = await live_request_queue.get()
            self.received.append(request)
            if request.close:
                return


class FakeLiveConnection(BaseLlmConnection):
    def __init__(self, llm: "FakeLiveLlm"):
        self.llm = llm
        self._inbox: asyncio.Queue[LlmResponse | None] = asyncio.Queue()
        for response in llm.responses:
            self._inbox.put_nowait(response)

    async def send_history(self, history):
        self.llm.history.extend(history)

    async def send_content(self, content):
        self.llm.sent.append(content)
        for part in content.parts or []:
            if part.function_response is not None:
                self.llm.function_responses.append(part.function_response)
                self.llm.got_response.set()

    async def send_realtime(self, blob):
        self.llm.audio_in += len(blob.data)

    async def receive(self):
        while True:
            response = await self._inbox.get()
            if response is None:
                return
            yield response

    async def close(self):
        self._inbox.put_nowait(None)


class FakeLiveLlm(BaseLlm):
    """A model whose live connection replays scripted responses and records what the gateway sends."""

    model: str = "fake-live"
    responses: list = []
    history: list = []
    sent: list = []
    function_responses: list = []
    declarations: list = []
    audio_in: int = 0
    got_response: asyncio.Event | None = None

    @classmethod
    def supported_models(cls):
        return ["fake-live"]

    async def generate_content_async(self, llm_request, stream=False):
        raise NotImplementedError("the fake model is live-only")
        yield  # pragma: no cover

    @contextlib.asynccontextmanager
    async def connect(self, llm_request):
        if self.got_response is None:
            self.got_response = asyncio.Event()
        for tool in llm_request.config.tools or []:
            self.declarations.extend(tool.function_declarations or [])
        connection = FakeLiveConnection(self)
        try:
            yield connection
        finally:
            await connection.close()


def call(name: str, call_id: str, **args) -> LlmResponse:
    return LlmResponse(content=types.Content(role="model", parts=[
        types.Part(function_call=types.FunctionCall(name=name, id=call_id, args=args))]))
