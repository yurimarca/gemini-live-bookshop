"""NON_BLOCKING tools: the voice agent keeps talking while a specialist works.

``recommend_books`` answers WHEN_IDLE, so the model speaks about the picks once
it has stopped talking. ``note_taste`` answers SILENT, so the profile updates
without a spoken reaction. Each specialist posts its own A2UI surface; the
voice model never writes UI.
"""

from __future__ import annotations

from google.adk.tools import ToolContext

from .. import services
from ..a2ui import builders
from ..catalog.models import IndexEntry
from ..live import timeline
from ..live.session_bus import SessionContext, TasteProfile
from ..protocol.events import A2ui
from ..specialists.core.schemas import Candidate, ProfileRequest, RecommendRequest, Taste
from ._context import call_id_of, session_of

CANDIDATE_POOL = 30


def _candidate(e: IndexEntry) -> Candidate:
    return Candidate(id=e.id, title=e.title, title_pt=e.title_pt, authors=e.author_names[:2], category=e.category,
                     subjects=e.subjects[:6], year=e.year, languages=e.languages, rating=e.rating,
                     popularity=e.popularity, description=(e.description or "")[:200] or None)


def _taste(ctx: SessionContext) -> Taste:
    return Taste(likes=ctx.taste.likes, dislikes=ctx.taste.dislikes, languages=ctx.taste.languages,
                 summary=ctx.taste.summary)


def gather_candidates(request: str, taste: Taste, exclude: set[str]) -> list[IndexEntry]:
    """About 30 candidates: matches for the request, then for each like, then the most read."""
    index = services.get().catalog.index
    pool: dict[str, IndexEntry] = {}
    language = taste.languages[0] if len(taste.languages) == 1 else None

    def take(entries: list[IndexEntry]) -> None:
        for e in entries:
            if e.id not in exclude and len(pool) < CANDIDATE_POOL:
                pool.setdefault(e.id, e)

    take(index.search(request, language=language, limit=15))
    for like in taste.likes[:4]:
        take(index.search(like, limit=6))
    take(index.search("", language=language, limit=CANDIDATE_POOL))
    take(index.search("", limit=CANDIDATE_POOL))
    return list(pool.values())


async def recommend_books(tool_context: ToolContext, request: str) -> dict:
    """Ask the recommender specialist for books that fit the shopper. Runs in the background and
    takes a few seconds; keep the conversation going meanwhile. The picks appear on the shopper's
    screen as cards, and you receive them when they are ready.

    Args:
        request: What the shopper is looking for, in a short phrase (for example "something like
            Dom Casmurro" or "a short classic for a flight").
    """
    ctx = session_of(tool_context)
    svc = services.get()
    call_id = call_id_of(tool_context)

    timeline.progress(ctx, call_id, "gathering_candidates")
    taste = _taste(ctx)
    cart = await svc.cart.get(ctx.uid)
    entries = gather_candidates(request, taste, exclude={i.id for i in cart.items})
    req = RecommendRequest(request=request[:500], locale=ctx.locale, taste=taste,
                           candidates=[_candidate(e) for e in entries])

    timeline.progress(ctx, call_id, "ranking", note=f"{len(entries)} candidates")
    async with timeline.sub_call(ctx, parent=call_id, agent="recommender", tool="rank_candidates",
                                 runs_on=svc.specialists.runs_on,
                                 args_summary=f"{len(entries)} candidates, {len(taste.likes)} likes") as outcome:
        result = await svc.specialists.recommend(req)
        outcome["summary"] = f"{len(result.picks)} picks ({result.source})"

    by_id = {e.id: e for e in entries}
    books = [{"id": p.id, "title": by_id[p.id].title_pt if ctx.locale == "pt-BR" and by_id[p.id].title_pt
              else by_id[p.id].title, "author": ", ".join(by_id[p.id].author_names[:2]),
              "cover_id": by_id[p.id].cover_id or 0, "price_cents": by_id[p.id].price_cents, "reason": p.reason}
             for p in result.picks if p.id in by_id]
    if not books:
        return {"status": "no_picks", "note": "Nothing suitable was found. Ask what else they enjoy."}

    subtitle = "Recomendador" if ctx.locale == "pt-BR" else "Recommender"
    first = builders.SURFACE_RECS not in ctx.surfaces
    ctx.surfaces.add(builders.SURFACE_RECS)
    ctx.bus.publish(A2ui(agent="recommender", call_id=call_id,
                         messages=builders.recommendations(headline=result.headline, subtitle=subtitle,
                                                           books=books, first=first)))
    ctx.shown_book_ids = [b["id"] for b in books]
    return {"status": "ready",
            "note": "These picks are now on the shopper's screen as cards. Mention one or two briefly.",
            "picks": [{"id": b["id"], "title": b["title"], "author": b["author"], "reason": b["reason"]}
                      for b in books]}


async def note_taste(tool_context: ToolContext, likes: list[str] | None = None, dislikes: list[str] | None = None,
                     languages: list[str] | None = None) -> dict:
    """Record what the shopper says about their reading taste. Call it whenever they mention an
    author, genre, mood or language they like or dislike. It updates silently; do not announce it.

    Args:
        likes: Short tags for things they enjoy, for example ["realism", "Machado de Assis"].
        dislikes: Short tags for things they want to avoid.
        languages: Reading languages as codes: "eng" for English, "por" for Portuguese.
    """
    ctx = session_of(tool_context)
    svc = services.get()
    call_id = call_id_of(tool_context)
    req = ProfileRequest(current=_taste(ctx), likes=[s[:40] for s in (likes or [])][:8],
                         dislikes=[s[:40] for s in (dislikes or [])][:8],
                         languages=[s[:8] for s in (languages or [])][:4], locale=ctx.locale)

    async with timeline.sub_call(ctx, parent=call_id, agent="taste_profiler", tool="update_profile",
                                 runs_on=svc.specialists.runs_on,
                                 args_summary=f"{len(req.likes)} likes, {len(req.dislikes)} dislikes") as outcome:
        result = await svc.specialists.profile(req)
        outcome["summary"] = f"{len(result.taste.likes)} likes on file ({result.source})"

    taste = result.taste
    ctx.taste = TasteProfile(likes=taste.likes, dislikes=taste.dislikes, languages=taste.languages,
                             summary=taste.summary)
    first = builders.SURFACE_TASTE not in ctx.surfaces
    ctx.surfaces.add(builders.SURFACE_TASTE)
    ctx.bus.publish(A2ui(agent="taste_profiler", call_id=call_id,
                         messages=builders.taste_profile(summary=taste.summary, likes=taste.likes,
                                                         dislikes=taste.dislikes, languages=taste.languages,
                                                         first=first)))
    return {"status": "saved"}
