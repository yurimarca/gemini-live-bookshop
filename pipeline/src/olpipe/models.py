"""Catalog contract shared by the pipeline, the gateway and the frontend.

The gateway keeps a copy of these models in ``backend/app/catalog/models.py``.
``tests/test_contract.py`` in both projects validates the committed fixture, so
a drift between the two copies fails a test.
"""

from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = 1
LICENSE = "CC0-1.0"
DESCRIPTION_SNIPPET_CHARS = 280
MAX_SUBJECTS = 12

Segment = Literal["famous", "brazilian_author", "portuguese_language"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AuthorRef(_Model):
    id: str = Field(pattern=r"^OL\d+A$")
    name: str = Field(min_length=1)


class Edition(_Model):
    id: str | None = Field(default=None, pattern=r"^OL\d+M$")
    isbn_13: str | None = None
    isbn_10: str | None = None
    publisher: str | None = None
    pages: int | None = Field(default=None, ge=1)
    publish_year: int | None = None
    language: str | None = None


class Rating(_Model):
    average: float = Field(ge=0, le=5)
    count: int = Field(ge=0)


class Popularity(_Model):
    score: float = Field(ge=0)
    rank: int = Field(ge=1)
    want_to_read: int = Field(default=0, ge=0)
    currently_reading: int = Field(default=0, ge=0)
    already_read: int = Field(default=0, ge=0)


class Source(_Model):
    dump_date: str
    revision: str
    last_modified: str | None = None
    license: Literal["CC0"] = "CC0"


class CatalogBook(_Model):
    """One Firestore document at ``books/{id}``."""

    id: str = Field(pattern=r"^OL\d+W$")
    work_key: str
    title: str = Field(min_length=1)
    subtitle: str | None = None
    title_pt: str | None = None
    authors: list[AuthorRef] = Field(min_length=1)
    author_names: list[str] = Field(min_length=1)
    description: str | None = None
    description_source: Literal["work", "edition", "ai_generated"] | None = None
    subjects: list[str] = Field(default_factory=list, max_length=MAX_SUBJECTS)
    category: str
    cover_id: int | None = None
    first_publish_year: int | None = Field(default=None, ge=-3000, le=2100)
    languages: list[str] = Field(default_factory=list)
    primary_language: str | None = None
    segments: list[Segment] = Field(default_factory=list)
    edition: Edition | None = None
    # No currency field: the same fictional number is shown as $ in English and R$ in Portuguese, never converted.
    price_cents: int = Field(gt=0)
    price_is_fictional: Literal[True] = True
    rating: Rating | None = None
    popularity: Popularity
    book_url: str
    dataset_version: str
    source: Source

    @field_validator("work_key")
    @classmethod
    def _work_key(cls, v: str) -> str:
        if not v.startswith("/works/OL"):
            raise ValueError("work_key must look like /works/OL123W")
        return v

    def to_index_entry(self) -> "IndexEntry":
        desc = (self.description or "").strip()
        return IndexEntry(
            id=self.id,
            title=self.title,
            title_pt=self.title_pt,
            author_names=self.author_names,
            category=self.category,
            subjects=self.subjects,
            year=self.first_publish_year,
            languages=self.languages,
            segments=self.segments,
            price_cents=self.price_cents,
            rating=self.rating.average if self.rating else None,
            rating_count=self.rating.count if self.rating else None,
            popularity=self.popularity.score,
            cover_id=self.cover_id,
            description=desc[:DESCRIPTION_SNIPPET_CHARS] or None,
        )


class IndexEntry(_Model):
    """Slim entry in the search-index blob."""

    id: str
    title: str
    title_pt: str | None = None
    author_names: list[str]
    category: str
    subjects: list[str] = Field(default_factory=list)
    year: int | None = None
    languages: list[str] = Field(default_factory=list)
    segments: list[str] = Field(default_factory=list)
    price_cents: int
    rating: float | None = None
    rating_count: int | None = None
    popularity: float
    cover_id: int | None = None
    description: str | None = None


class CatalogIndex(_Model):
    schema_version: int = SCHEMA_VERSION
    dataset_version: str
    count: int
    license: str = LICENSE
    books: list[IndexEntry]


class CatalogPointer(_Model):
    """Firestore document ``meta/catalog``. Flipped last by a publish."""

    dataset_version: str
    index_uri: str
    index_sha256: str
    count: int
    segment_counts: dict[str, int]
    published_at: str


class SourceFile(_Model):
    name: str
    url: str
    bytes: int
    md5: str
    sha256: str
    rows: int | None = None


class Manifest(_Model):
    """Per-run record. ``source`` entries come from fetch, the rest from publish."""

    run_id: str
    dataset_version: str
    dump_date: str
    revision: str
    git_sha: str | None = None
    config_hash: str | None = None
    sources: list[SourceFile] = Field(default_factory=list)
    row_counts: dict[str, int] = Field(default_factory=dict)
    rejects: int = 0
    firestore_writes: int = 0
    firestore_deletes: int = 0
    index_sha256: str | None = None
    index_uri: str | None = None


def dataset_version(dump_date: str, revision: str) -> str:
    return f"ol-{dump_date}-{revision}"


def fictional_price_cents(work_key: str) -> int:
    """Deterministic fake price from the work key: $7.90 to $39.90, ending in 90.

    The same formula is used in ``dataform/includes/pricing.js``; keep both in step.
    """
    digest = hashlib.sha256(work_key.encode("utf-8")).digest()
    step = int.from_bytes(digest[:4], "big") % 33
    return 790 + step * 100
