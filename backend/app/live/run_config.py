"""RunConfig for a live session: bidirectional audio with both transcriptions."""

from __future__ import annotations

from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai import types

from ..config.settings import Settings

INPUT_MIME = "audio/pcm;rate=16000"


def build_run_config(settings: Settings) -> RunConfig:
    return RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=[types.Modality.AUDIO],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.voice_name))),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        # Lets ADK reconnect the upstream socket within one session (connections end at about 10 minutes).
        session_resumption=types.SessionResumptionConfig(),
    )
