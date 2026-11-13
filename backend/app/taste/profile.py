"""Per-user taste profile: weighted tags that accumulate across sessions.

One document per user at ``profiles/{uid}``: memory locally, Firestore on Cloud Run,
written only by the gateway (client rules deny everything). It holds short tags,
language codes and a generated summary, never free text from the shopper.

Weights: each mention of a like adds 1, so repeated likes rank higher. A later
dislike of the same tag removes the like, and the reverse. A profile that is not
used for ``TTL_DAYS`` expires: lazily on read here, and by a Firestore TTL policy on
``expires_at`` in the cloud.
"""

from __future__ import annotations

import time
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Callable

from pydantic import BaseModel, Field

from ..specialists.core.schemas import Taste
from ..state import DocState

COLLECTION = "profiles"
TTL_DAYS = 30
MAX_TAGS = 24          # per list, kept by weight then recency
MAX_LANGUAGES = 4
CARD_TAGS = 12         # chips shown on the card
SPECIALIST_TAGS = 8    # tags handed to a specialist


def tag_key(tag: str) -> str:
    folded = unicodedata.normalize("NFD", tag.lower())
    return " ".join("".join(c for c in folded if unicodedata.category(c) != "Mn").split())


def clean_tag(tag: str) -> str:
    return " ".join(tag.split())[:40]


class TagEntry(BaseModel):
    tag: str
    weight: int = Field(default=1, ge=1)
    first_seen: float
    last_seen: float
    source_session: str


class Profile(BaseModel):
    likes: list[TagEntry] = Field(default_factory=list)
    dislikes: list[TagEntry] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    summary: str = ""
    note_count: int = 0
    updated_at: float = 0.0
    expires_at: datetime | None = None

    def is_empty(self) -> bool:
        return not (self.likes or self.dislikes or self.languages)

    @staticmethod
    def ranked(entries: list[TagEntry]) -> list[TagEntry]:
        return sorted(entries, key=lambda e: (-e.weight, -e.last_seen, e.tag))

    def to_taste(self, limit: int = SPECIALIST_TAGS) -> Taste:
        """What a specialist sees: tags ranked strongest first."""
        return Taste(likes=[e.tag for e in self.ranked(self.likes)[:limit]],
                     dislikes=[e.tag for e in self.ranked(self.dislikes)[:limit]],
                     languages=self.languages[:MAX_LANGUAGES], summary=self.summary)


def chip(entry: TagEntry) -> str:
    """Card label: the tag, with its weight when it was heard more than once."""
    return f"{entry.tag} ×{entry.weight}" if entry.weight > 1 else entry.tag


def _bump(entries: list[TagEntry], tag: str, session_id: str, now: float) -> None:
    key = tag_key(tag)
    for entry in entries:
        if tag_key(entry.tag) == key:
            entry.weight += 1
            entry.last_seen = now
            entry.source_session = session_id
            return
    entries.append(TagEntry(tag=tag, first_seen=now, last_seen=now, source_session=session_id))


def _drop(entries: list[TagEntry], tag: str) -> list[TagEntry]:
    key = tag_key(tag)
    return [e for e in entries if tag_key(e.tag) != key]


def apply_note(profile: Profile, *, likes: list[str], dislikes: list[str], languages: list[str],
               session_id: str, now: float) -> list[str]:
    """Merge one note into ``profile`` in place. Returns the keys of the tags it touched."""
    touched: list[str] = []
    for raw in likes:
        tag = clean_tag(raw)
        if not tag_key(tag):
            continue
        _bump(profile.likes, tag, session_id, now)
        profile.dislikes = _drop(profile.dislikes, tag)
        touched.append(tag_key(tag))
    for raw in dislikes:  # after likes, so a tag named both ways in one note ends up disliked
        tag = clean_tag(raw)
        if not tag_key(tag):
            continue
        _bump(profile.dislikes, tag, session_id, now)
        profile.likes = _drop(profile.likes, tag)
        touched.append(tag_key(tag))
    for raw in languages:
        code = raw.strip().lower()[:8]
        if code and code not in profile.languages:
            profile.languages.insert(0, code)
            touched.append(code)
    profile.likes = Profile.ranked(profile.likes)[:MAX_TAGS]
    profile.dislikes = Profile.ranked(profile.dislikes)[:MAX_TAGS]
    profile.languages = profile.languages[:MAX_LANGUAGES]
    if touched:
        profile.note_count += 1
        profile.updated_at = now
    return touched


class TasteStore:
    def __init__(self, state: DocState, *, ttl_days: int = TTL_DAYS, clock: Callable[[], float] = time.time) -> None:
        self._state, self._ttl, self._clock = state, timedelta(days=ttl_days), clock

    def _expires(self, now: float) -> datetime:
        return datetime.fromtimestamp(now, tz=timezone.utc) + self._ttl

    def _live(self, doc: dict | None, now: float) -> Profile:
        if not doc:
            return Profile()
        profile = Profile.model_validate(doc)
        expires = profile.expires_at
        if expires is not None and expires.timestamp() <= now:
            return Profile()  # the TTL policy may lag by a day; never serve an expired profile
        return profile

    async def load(self, uid: str) -> Profile:
        return self._live(await self._state.get(COLLECTION, uid), self._clock())

    async def note(self, uid: str, *, likes: list[str], dislikes: list[str], languages: list[str],
                   session_id: str) -> tuple[Profile, list[str]]:
        now = self._clock()

        def mutate(doc: dict | None):
            profile = self._live(doc, now)
            touched = apply_note(profile, likes=likes, dislikes=dislikes, languages=languages,
                                 session_id=session_id, now=now)
            if not touched:
                return doc, (profile, touched)
            profile.expires_at = self._expires(now)
            return profile.model_dump(), (profile, touched)

        return await self._state.transact(COLLECTION, uid, mutate)

    async def set_summary(self, uid: str, summary: str) -> None:
        now = self._clock()

        def mutate(doc: dict | None):
            profile = self._live(doc, now)
            if profile.is_empty():
                return doc, None  # forgotten while the profiler was writing
            profile.summary = summary[:300]
            return profile.model_dump(), None

        await self._state.transact(COLLECTION, uid, mutate)

    async def clear(self, uid: str) -> None:
        await self._state.transact(COLLECTION, uid, lambda doc: (None, None))
