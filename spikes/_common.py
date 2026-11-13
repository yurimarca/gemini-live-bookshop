"""Shared helpers for the Phase 1 spikes. Run every spike from ``backend/`` so its virtualenv is used:

    cd backend && uv run python ../spikes/spike1_async_tools.py --help

The spikes call Gemini Live on your project with your Application Default Credentials.
They read GOOGLE_CLOUD_PROJECT from the environment (or backend/.env); nothing is hard-coded.
"""

from __future__ import annotations

import os
import sys
import time
import wave

from dotenv import load_dotenv

load_dotenv()
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")
os.environ.setdefault("ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS", "false")

MODEL = os.environ.get("LIVE_MODEL", "gemini-3.8-live")
T0 = time.monotonic()


def require_project() -> None:
    if not os.environ.get("GOOGLE_CLOUD_PROJECT"):
        sys.exit("Set GOOGLE_CLOUD_PROJECT (for example in backend/.env) and run `gcloud auth application-default login`.")


def log(kind: str, detail: str = "") -> None:
    print(f"[{time.monotonic() - T0:7.2f}s] {kind:<22} {detail}", flush=True)


def read_wav_pcm16(path: str) -> bytes:
    """Read a 16 kHz mono 16-bit WAV file. Convert with: ffmpeg -i in.wav -ar 16000 -ac 1 -sample_fmt s16 out.wav"""
    with wave.open(path, "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (16000, 1, 2):
            sys.exit("The WAV file must be 16 kHz, mono, 16-bit.")
        return wav.readframes(wav.getnframes())
