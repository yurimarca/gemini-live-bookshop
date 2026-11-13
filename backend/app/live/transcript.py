"""Turns raw transcription events into utterances the client can render.

The backend owns utterance IDs: it emits fragments as ``transcript.delta`` and
one ``transcript.final`` per utterance. Whether the Live API sends fragments or
cumulative text is not settled (spike 1 logs the raw events), so both shapes
are accepted here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import count

from ..protocol.events import AudioStart, TranscriptDelta, TranscriptFinal
from .session_bus import SessionBus


@dataclass
class _Utterance:
    id: str
    text: str = ""
    audio_started: bool = False


@dataclass
class TranscriptAggregator:
    bus: SessionBus
    _ids: count = field(default_factory=lambda: count(1))
    _open: dict[str, _Utterance | None] = field(default_factory=lambda: {"user": None, "agent": None})

    def _ensure(self, role: str) -> _Utterance:
        if self._open[role] is None:
            self._open[role] = _Utterance(id=f"{role[0]}{next(self._ids)}")
        return self._open[role]

    def current_agent_id(self) -> str | None:
        return self._open["agent"].id if self._open["agent"] else None

    def on_text(self, role: str, text: str, finished: bool = False) -> None:
        if not text and not finished:
            return
        utt = self._ensure(role)
        if text:
            if utt.text and text.startswith(utt.text):   # cumulative text
                delta = text[len(utt.text):]
                utt.text = text
            elif finished and utt.text and text.strip() == utt.text.strip():
                delta = ""                               # a final that repeats the whole utterance
            else:                                        # a fragment
                delta = text
                utt.text += text
            if delta:
                self.bus.publish(TranscriptDelta(utterance_id=utt.id, role=role, text=delta))
        if finished:
            self.finalize(role)

    def on_agent_audio(self) -> None:
        utt = self._ensure("agent")
        if not utt.audio_started:
            utt.audio_started = True
            self.bus.publish(AudioStart(utterance_id=utt.id))

    def add_user_text(self, text: str) -> None:
        """Typed input has no transcription events, so it is added as a finished utterance."""
        self.finalize("user")
        utt = self._ensure("user")
        utt.text = text
        self.finalize("user")

    def finalize(self, role: str, *, interrupted: bool = False) -> str | None:
        utt = self._open[role]
        if utt is None:
            return None
        self._open[role] = None
        if utt.text.strip() or utt.audio_started:
            self.bus.publish(TranscriptFinal(utterance_id=utt.id, role=role, text=utt.text.strip(),
                                             interrupted=interrupted))
        return utt.id
