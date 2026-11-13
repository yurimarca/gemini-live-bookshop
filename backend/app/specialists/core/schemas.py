"""Request and response shapes for the two specialists. Plain pydantic, JSON-serialisable."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Locale = Literal["en", "pt-BR"]


class Taste(BaseModel):
    likes: list[str] = Field(default_factory=list)
    dislikes: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    summary: str = ""


class Candidate(BaseModel):
    id: str
    title: str
    title_pt: str | None = None
    authors: list[str]
    category: str
    subjects: list[str] = Field(default_factory=list)
    year: int | None = None
    languages: list[str] = Field(default_factory=list)
    rating: float | None = None
    popularity: float = 0.0
    description: str | None = None


class RecommendRequest(BaseModel):
    request: str = Field(max_length=500)
    locale: Locale = "en"
    taste: Taste = Field(default_factory=Taste)
    candidates: list[Candidate]
    max_picks: int = Field(default=4, ge=1, le=6)


class Pick(BaseModel):
    id: str
    reason: str = Field(max_length=200)


class RecommendResult(BaseModel):
    headline: str = Field(max_length=120)
    picks: list[Pick]
    source: Literal["llm", "heuristic"] = "heuristic"


class ProfileRequest(BaseModel):
    current: Taste = Field(default_factory=Taste)
    likes: list[str] = Field(default_factory=list)
    dislikes: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    locale: Locale = "en"


class ProfileResult(BaseModel):
    taste: Taste
    source: Literal["llm", "heuristic"] = "heuristic"


class ResearchRequest(BaseModel):
    """The whole profile, likes ranked by weight (strongest first)."""

    taste: Taste
    locale: Locale = "en"
    max_angles: int = Field(default=4, ge=1, le=4)


class Angle(BaseModel):
    label: str = Field(max_length=60, description="Short shelf label for the angle, in the shopper's language")
    query: str = Field(max_length=60, description="Catalog search words: an author, genre, subject or theme")
    tag: str = Field(max_length=40, description="The profile tag this angle comes from, copied exactly")


class ResearchResult(BaseModel):
    angles: list[Angle]
    source: Literal["llm", "heuristic"] = "heuristic"
