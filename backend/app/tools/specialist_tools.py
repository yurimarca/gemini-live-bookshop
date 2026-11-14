"""NON_BLOCKING tools: the voice agent keeps talking while a specialist works.

``recommend_books`` and ``research_for_taste`` answer WHEN_IDLE, so the model speaks
about the picks once it has stopped talking. ``note_taste`` answers SILENT, so the
profile updates without a spoken reaction. Each specialist posts its own A2UI
surface; the voice model never writes UI.

The taste profile belongs to the user, not the session: it is loaded at
``session.start``, saved after every note, and grows across sessions. After
``AUTO_RESEARCH_AFTER_NOTES`` new notes the gateway runs the researcher itself.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from google.adk.tools import ToolContext

from .. import services
from ..a2ui import builders
from ..catalog.models import IndexEntry
from ..live import timeline
from ..live.session_bus import SessionContext
from ..protocol.events import A2ui
from ..specialists.client import served_by
from ..specialists.core import heuristics
from ..specialists.core.schemas import (Angle, Candidate, Pick, ProfileRequest, RecommendRequest, ResearchRequest,
                                        Taste)
from ..taste.profile import CARD_TAGS, Profile, chip, tag_key
from ._context import call_id_of, session_of

log = logging.getLogger(__name__)
CANDIDATE_POOL = 30

FORGOTTEN = {
    "en": "[system] The shopper pressed \"Forget my taste\". Their saved taste profile is deleted. Do not use "
          "earlier taste notes. Confirm in one short sentence.",
    "pt-BR": "[system] O cliente apertou \"Esquecer meu gosto\". O perfil de gosto salvo foi apagado. Não use "
             "as anotações de gosto anteriores. Confirme em uma frase curta.",
}


def _candidate(e: IndexEntry) -> Candidate:
    return Candidate(id=e.id, title=e.title, title_pt=e.title_pt, authors=e.author_names[:2], category=e.category,
                     subjects=e.subjects[:6], year=e.year, languages=e.languages, rating=e.rating,
                     popularity=e.popularity, description=(e.description or "")[:200] or None)


def _taste(ctx: SessionContext) -> Taste:
    return ctx.profile.to_taste()


def _language(taste: Taste) -> str | None:
    return taste.languages[0] if len(taste.languages) == 1 else None


def gather_candidates(request: str, taste: Taste, exclude: set[str]) -> list[IndexEntry]:
    """About 30 candidates: matches for the request, then for each like, then the most read."""
    index = services.get().catalog.index
    pool: dict[str, IndexEntry] = {}
    language = _language(taste)

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


def gather_for_angles(angles: list[Angle], taste: Taste,
                      exclude: set[str]) -> tuple[list[IndexEntry], dict[str, str]]:
    """Candidates for each angle, and the profile tag each candidate was found through.

    No popular-books padding: every candidate comes from an angle, so every pick has a tag.
    """
    index = services.get().catalog.index
    language = _language(taste)
    per_angle = max(4, CANDIDATE_POOL // max(1, len(angles)))
    pool: dict[str, IndexEntry] = {}
    origin: dict[str, str] = {}
    for angle in angles:
        hits = index.search(angle.query, language=language, limit=per_angle)
        if language and not hits:
            hits = index.search(angle.query, limit=per_angle)
        for e in hits:
            if e.id not in exclude and e.id not in pool and len(pool) < CANDIDATE_POOL:
                pool[e.id] = e
                origin[e.id] = angle.tag
    return list(pool.values()), origin


def _books(ctx: SessionContext, entries: list[IndexEntry], picks: list[Pick]) -> list[dict]:
    by_id = {e.id: e for e in entries}
    books = []
    for p in picks:
        e = by_id.get(p.id)
        if e is None:
            continue
        books.append({"id": e.id, "title": e.title_pt if ctx.locale == "pt-BR" and e.title_pt else e.title,
                      "author": ", ".join(e.author_names[:2]), "cover_id": e.cover_id or 0,
                      "price_cents": e.price_cents, "reason": p.reason})
    return books


# --- taste card -----------------------------------------------------------------------
def publish_taste_card(ctx: SessionContext, touched: list[str] | tuple[str, ...] = ()) -> None:
    """Show the whole stored profile. One surface that grows; ``touched`` chips are highlighted briefly."""
    profile = ctx.profile
    likes = Profile.ranked(profile.likes)[:CARD_TAGS]
    dislikes = Profile.ranked(profile.dislikes)[:CARD_TAGS]
    keys = set(touched)
    fresh = [chip(e) for e in [*likes, *dislikes] if tag_key(e.tag) in keys]
    summary = profile.summary or heuristics.summarize(profile.to_taste(), ctx.locale)
    first = builders.SURFACE_TASTE not in ctx.surfaces
    ctx.surfaces.add(builders.SURFACE_TASTE)
    ctx.bus.publish(A2ui(agent="taste_profiler", messages=builders.taste_profile(
        summary=summary, likes=[chip(e) for e in likes], dislikes=[chip(e) for e in dislikes],
        languages=profile.languages, fresh=fresh, notes_session=ctx.taste_notes_session,
        notes_total=profile.note_count, first=first)))


async def forget_profile(uid: str) -> None:
    """Delete the stored profile and clear it from every live session of this user."""
    svc = services.get()
    await svc.taste.clear(uid)
    for ctx in svc.registry.for_uid(uid):
        ctx.profile = Profile()
        ctx.taste_notes_session = ctx.notes_since_research = 0
        for surface in (builders.SURFACE_TASTE, builders.SURFACE_TASTE_RECS):
            if surface in ctx.surfaces:
                ctx.surfaces.discard(surface)
                ctx.bus.publish(A2ui(agent="taste_profiler", messages=builders.delete_surface(surface)))
        if ctx.inject:
            ctx.inject(FORGOTTEN.get(ctx.locale, FORGOTTEN["en"]))


# --- tools ----------------------------------------------------------------------------
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
    ctx.notes_since_research = 0

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
        outcome["summary"] = f"{len(result.picks)} picks ({result.source}, {served_by()})"

    books = _books(ctx, entries, result.picks)
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
    likes = [s[:40] for s in (likes or [])][:8]
    dislikes = [s[:40] for s in (dislikes or [])][:8]
    languages = [s[:8] for s in (languages or [])][:4]

    profile, touched = await svc.taste.note(ctx.uid, likes=likes, dislikes=dislikes, languages=languages,
                                            session_id=ctx.session_id)
    if not touched:
        return {"status": "saved"}
    ctx.profile = profile
    ctx.taste_notes_session += 1

    async with timeline.sub_call(ctx, parent=call_id, agent="taste_profiler", tool="update_profile",
                                 runs_on=svc.specialists.runs_on,
                                 args_summary=f"{len(likes)} likes, {len(dislikes)} dislikes") as outcome:
        # Tags and weights are merged by the gateway; the profiler writes the summary.
        result = await svc.specialists.profile(ProfileRequest(current=profile.to_taste(), locale=ctx.locale))
        outcome["summary"] = (f"{len(profile.likes)} likes, {len(profile.dislikes)} dislikes on file, "
                              f"{profile.note_count} notes ({result.source}, {served_by()})")

    if ctx.profile is not profile:
        return {"status": "saved"}  # forgotten, or replaced by a newer note, while the profiler ran
    profile.summary = result.taste.summary or heuristics.summarize(profile.to_taste(), ctx.locale)
    await svc.taste.set_summary(ctx.uid, profile.summary)
    publish_taste_card(ctx, touched)

    threshold = svc.settings.auto_research_after_notes
    if likes:
        ctx.notes_since_research += 1
    if threshold > 0 and ctx.notes_since_research >= threshold and profile.likes and not ctx.research_running:
        ctx.notes_since_research = 0
        ctx.spawn(auto_research(ctx, notes=threshold))
    return {"status": "saved"}


async def _research(ctx: SessionContext, row_id: str) -> list[dict]:
    """Researcher, then recommender. ``row_id`` is the researcher's timeline row; the recommender nests under it."""
    svc = services.get()
    ctx.research_running = True
    ctx.notes_since_research = 0
    try:
        taste = _taste(ctx)
        timeline.progress(ctx, row_id, "planning_angles")
        plan = await svc.specialists.research(ResearchRequest(taste=taste, locale=ctx.locale))
        cart = await svc.cart.get(ctx.uid)
        entries, origin = gather_for_angles(plan.angles, taste, exclude={i.id for i in cart.items})
        timeline.progress(ctx, row_id, "gathering_candidates",
                          note=f"{len(plan.angles)} angles, {len(entries)} candidates ({plan.source}, {served_by()})")
        if not entries:
            return []
        req = RecommendRequest(request=" / ".join(a.label for a in plan.angles)[:500], locale=ctx.locale,
                               taste=taste, candidates=[_candidate(e) for e in entries])
        async with timeline.sub_call(ctx, parent=row_id, agent="recommender", tool="rank_candidates",
                                     runs_on=svc.specialists.runs_on,
                                     args_summary=f"{len(entries)} candidates, {len(plan.angles)} angles") as outcome:
            result = await svc.specialists.recommend(req)
            outcome["summary"] = f"{len(result.picks)} picks ({result.source}, {served_by()})"
        books = _books(ctx, entries, result.picks)
        for book in books:
            book["tag"] = origin[book["id"]]
        if not books or ctx.profile.is_empty():  # nothing found, or forgotten meanwhile
            return []
        pt = ctx.locale == "pt-BR"
        first = builders.SURFACE_TASTE_RECS not in ctx.surfaces
        ctx.surfaces.add(builders.SURFACE_TASTE_RECS)
        ctx.bus.publish(A2ui(agent="researcher", call_id=row_id, messages=builders.taste_recommendations(
            headline="Com base no seu gosto" if pt else "Based on your taste",
            subtitle="Pesquisador → recomendador" if pt else "Researcher → recommender",
            books=books, first=first)))
        return books
    finally:
        ctx.research_running = False


async def research_for_taste(tool_context: ToolContext) -> dict:
    """Ask the researcher to study the shopper's whole taste profile, search the catalog from several
    angles and pass the finds to the recommender. Use it when the shopper asks what you would suggest
    for them in general, or after they have shared several tastes. Runs in the background; keep
    talking meanwhile. The picks appear on screen under "Based on your taste".
    """
    ctx = session_of(tool_context)
    svc = services.get()
    call_id = call_id_of(tool_context)
    taste = _taste(ctx)
    if not taste.likes:
        return {"status": "no_profile", "note": "Nothing is known about their taste yet. Ask what they enjoy."}
    if ctx.research_running:
        return {"status": "busy", "note": "The researcher is already working; its picks will appear on screen."}

    async with timeline.sub_call(ctx, parent=call_id, agent="researcher", tool="plan_angles",
                                 runs_on=svc.specialists.runs_on,
                                 args_summary=f"{len(taste.likes)} likes, {len(taste.dislikes)} dislikes") as outcome:
        books = await _research(ctx, f"{call_id}:researcher")
        outcome["summary"] = f"{len(books)} picks"
    if not books:
        return {"status": "no_picks", "note": "Nothing new fits their profile. Ask what else they enjoy."}
    ctx.shown_book_ids = [b["id"] for b in books]
    return {"status": "ready",
            "note": "These picks are on the shopper's screen under 'Based on your taste'. Mention one or two "
                    "and the taste each one comes from.",
            "picks": [{"id": b["id"], "title": b["title"], "author": b["author"], "taste": b["tag"]}
                      for b in books]}


async def auto_research(ctx: SessionContext, *, notes: int) -> None:
    """The gateway's own trigger: no voice call, so the researcher gets a top-level timeline row."""
    svc = services.get()
    row = f"auto-research-{uuid.uuid4().hex[:8]}"
    timeline.started(ctx, call_id=row, agent="researcher", tool="research_for_taste", behavior="NON_BLOCKING",
                     runs_on=svc.specialists.runs_on, args_summary=f"auto: {notes} new notes")
    status, summary = "ok", None
    try:
        books = await _research(ctx, row)
        summary = f"{len(books)} picks"
    except asyncio.CancelledError:
        status = "cancelled"
        raise
    except Exception:
        log.exception("automatic research failed")
        status = "error"
    finally:
        timeline.finished(ctx, call_id=row, status=status, summary=summary)
