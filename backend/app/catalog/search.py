"""In-memory search over the slim index: accent-folded tokens, no Firestore reads."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict

from .models import IndexEntry

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = frozenset("a an and as at by de da do das dos e em for in la le o of on os the to um uma with".split())
LANGUAGE_ALIASES = {"en": "eng", "eng": "eng", "english": "eng", "pt": "por", "pt-br": "por", "por": "por",
                    "portuguese": "por", "portugues": "por", "es": "spa", "spa": "spa", "spanish": "spa",
                    "fr": "fre", "fre": "fre", "french": "fre"}


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(fold(text)) if t not in _STOP and len(t) > 1]


def normalize_language(value: str | None) -> str | None:
    return LANGUAGE_ALIASES.get(fold(value).strip()) if value else None


class SearchIndex:
    # Field weights: a title hit counts for more than a subject hit.
    WEIGHTS = {"title": 6.0, "author": 5.0, "category": 3.0, "subject": 2.0, "description": 1.0}

    def __init__(self, entries: list[IndexEntry]):
        self.entries = {e.id: e for e in entries}
        self._postings: dict[str, dict[str, float]] = defaultdict(dict)
        self._by_popularity = [e.id for e in sorted(entries, key=lambda e: (-e.popularity, e.id))]
        for e in entries:
            fields = {
                "title": " ".join(filter(None, [e.title, e.title_pt])),
                "author": " ".join(e.author_names),
                "category": e.category,
                "subject": " ".join(e.subjects),
                "description": e.description or "",
            }
            for field, text in fields.items():
                for tok in set(tokens(text)):
                    posting = self._postings[tok]
                    posting[e.id] = max(posting.get(e.id, 0.0), self.WEIGHTS[field])

    def _matches(self, token: str) -> dict[str, float]:
        exact = self._postings.get(token)
        if exact:
            return exact
        if len(token) < 4:
            return {}
        merged: dict[str, float] = {}
        for key, posting in self._postings.items():  # prefix match; the vocabulary is a few thousand tokens
            if key.startswith(token):
                for book_id, weight in posting.items():
                    merged[book_id] = max(merged.get(book_id, 0.0), weight * 0.6)
        return merged

    def search(self, query: str = "", *, subject: str | None = None, language: str | None = None,
               segment: str | None = None, limit: int = 10) -> list[IndexEntry]:
        lang = normalize_language(language)
        subject_folded = fold(subject).strip() if subject else None

        def keep(e: IndexEntry) -> bool:
            if lang and lang not in e.languages:
                return False
            if segment and segment not in e.segments:
                return False
            if subject_folded and subject_folded not in fold(e.category) and not any(
                    subject_folded in fold(s) for s in e.subjects):
                return False
            return True

        query_tokens = tokens(query)
        if not query_tokens:
            ids = [i for i in self._by_popularity if keep(self.entries[i])]
            return [self.entries[i] for i in ids[:limit]]

        scores: dict[str, float] = defaultdict(float)
        hits: dict[str, int] = defaultdict(int)
        for tok in query_tokens:
            for book_id, weight in self._matches(tok).items():
                scores[book_id] += weight
                hits[book_id] += 1
        ranked = sorted(
            (i for i in scores if keep(self.entries[i])),
            # Books matching more of the query first, then by weight, then by popularity.
            key=lambda i: (-hits[i], -scores[i], -self.entries[i].popularity, i),
        )
        return [self.entries[i] for i in ranked[:limit]]
