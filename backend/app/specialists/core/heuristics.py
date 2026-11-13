"""Deterministic specialists: the fallback when the LLM is off, slow or wrong, and the test oracle."""

from __future__ import annotations

import re
import unicodedata

from .schemas import (Angle, Candidate, Pick, ProfileRequest, ProfileResult, RecommendRequest, RecommendResult,
                      ResearchRequest, ResearchResult, Taste)

MAX_TAGS = 8
_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = frozenset("a an and the of to for in on with by e o os as de da do um uma que me my i something like "
                  "book books livro livros want read quero ler algo como".split())


def _fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def _tokens(text: str) -> set[str]:
    return {t for t in _TOKEN.findall(_fold(text)) if t not in _STOP and len(t) > 2}


def _candidate_tokens(c: Candidate) -> set[str]:
    return _tokens(" ".join([c.title, c.title_pt or "", " ".join(c.authors), c.category, " ".join(c.subjects),
                             c.description or ""]))


def _reason(c: Candidate, matched_like: str | None, locale: str) -> str:
    if locale == "pt-BR":
        if matched_like:
            return f"Combina com o seu interesse por {matched_like}."
        return f"Um dos mais lidos em {c.category}."
    if matched_like:
        return f"Matches your interest in {matched_like}."
    return f"One of the most read in {c.category}."


def recommend(req: RecommendRequest) -> RecommendResult:
    wanted = _tokens(req.request)
    likes = {like: _tokens(like) for like in req.taste.likes}
    avoid = set().union(*(_tokens(d) for d in req.taste.dislikes)) if req.taste.dislikes else set()
    preferred_langs = set(req.taste.languages)

    scored = []
    for c in req.candidates:
        toks = _candidate_tokens(c)
        if avoid and len(avoid & toks) >= 1 and not wanted & toks:
            continue
        matched_like = next((like for like, lt in likes.items() if lt and lt & toks), None)
        score = 3.0 * len(wanted & toks) + (2.0 if matched_like else 0.0) + 0.3 * c.popularity
        if preferred_langs & set(c.languages):
            score += 1.0
        scored.append((score, c, matched_like))
    scored.sort(key=lambda item: (-item[0], item[1].id))

    picks, seen_authors = [], set()
    for _, c, matched_like in scored:
        author = c.authors[0] if c.authors else ""
        if author in seen_authors:  # one book per author keeps the shelf varied
            continue
        seen_authors.add(author)
        picks.append(Pick(id=c.id, reason=_reason(c, matched_like, req.locale)))
        if len(picks) == req.max_picks:
            break
    headline = "Escolhas para você" if req.locale == "pt-BR" else "Picked for you"
    return RecommendResult(headline=headline, picks=picks, source="heuristic")


def _merge(current: list[str], new: list[str], drop: list[str]) -> list[str]:
    dropped = {_fold(d).strip() for d in drop}
    out, seen = [], set()
    for tag in [*new, *current]:  # newest first
        tag = " ".join(tag.split())[:40]
        key = _fold(tag)
        if not tag or key in seen or key in dropped:
            continue
        seen.add(key)
        out.append(tag)
    return out[:MAX_TAGS]


def summarize(taste: Taste, locale: str) -> str:
    parts = []
    if locale == "pt-BR":
        if taste.likes:
            parts.append("Gosta de " + ", ".join(taste.likes[:4]) + ".")
        if taste.dislikes:
            parts.append("Evita " + ", ".join(taste.dislikes[:3]) + ".")
        if taste.languages:
            parts.append("Lê em " + ", ".join(taste.languages) + ".")
    else:
        if taste.likes:
            parts.append("Likes " + ", ".join(taste.likes[:4]) + ".")
        if taste.dislikes:
            parts.append("Avoids " + ", ".join(taste.dislikes[:3]) + ".")
        if taste.languages:
            parts.append("Reads in " + ", ".join(taste.languages) + ".")
    return " ".join(parts)


def profile(req: ProfileRequest) -> ProfileResult:
    taste = Taste(
        likes=_merge(req.current.likes, req.likes, req.dislikes),
        dislikes=_merge(req.current.dislikes, req.dislikes, req.likes),
        languages=_merge(req.current.languages, req.languages, []),
    )
    taste.summary = summarize(taste, req.locale)
    return ProfileResult(taste=taste, source="heuristic")


def research(req: ResearchRequest) -> ResearchResult:
    """Search angles from the strongest likes: one per like, plus the top two combined."""
    likes = [like for like in req.taste.likes if _tokens(like)]
    pt = req.locale == "pt-BR"
    angles = [Angle(label=(f"Mais {like}" if pt else f"More {like}")[:60], query=like[:60], tag=like[:40])
              for like in likes[:3]]
    if len(likes) >= 2 and len(angles) < req.max_angles:
        a, b = likes[0], likes[1]
        angles.append(Angle(label=f"{a} + {b}"[:60], query=f"{a} {b}"[:60], tag=a[:40]))
    return ResearchResult(angles=angles[:req.max_angles], source="heuristic")


def clean_llm_research(result: ResearchResult, req: ResearchRequest) -> ResearchResult | None:
    """Keep angles whose tag is a real like and whose query has search words. None means: use the heuristic."""
    likes = {_fold(like).strip(): like for like in req.taste.likes}
    angles, seen = [], set()
    for angle in result.angles:
        tag = likes.get(_fold(angle.tag).strip())
        key = _fold(angle.query).strip()
        if tag is None or not _tokens(angle.query) or key in seen:
            continue
        seen.add(key)
        angles.append(Angle(label=angle.label.strip()[:60] or tag, query=angle.query.strip()[:60], tag=tag))
    if not angles:
        return None
    return ResearchResult(angles=angles[:req.max_angles], source="llm")


def clean_llm_recommendation(result: RecommendResult, req: RecommendRequest) -> RecommendResult | None:
    """Keep only picks that name a real candidate. None means: fall back to the heuristic."""
    valid = {c.id for c in req.candidates}
    picks, seen = [], set()
    for pick in result.picks:
        if pick.id in valid and pick.id not in seen and pick.reason.strip():
            seen.add(pick.id)
            picks.append(pick)
    if not picks:
        return None
    return RecommendResult(headline=result.headline.strip() or "Picked for you",
                           picks=picks[:req.max_picks], source="llm")
