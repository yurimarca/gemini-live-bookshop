"""A2UI v1.0 envelopes for the four specialist surfaces.

The gateway builds every envelope from validated specialist output. Neither the
voice model nor a specialist model writes A2UI JSON, so an agent can only ever
fill the slots defined here. Components come from the bookshop catalog
(``urn:bookshop:catalog:v1``), implemented in ``frontend/src/a2ui/catalog.tsx``.
Each surface is created once and then driven by ``updateDataModel``.

Bindings are written as ``{"@path": ...}``. The v1.0 schema also accepts ``path``, but the pinned
renderer (0.15.0) only resolves ``@path`` on a v1.0 surface and silently leaves ``path`` unresolved.
The one exception is a template child list, whose schema takes ``path`` only.
"""

from __future__ import annotations

from typing import Any

A2UI_VERSION = "1.0"
CATALOG_ID = "urn:bookshop:catalog:v1"
SURFACE_RECS = "recs"
SURFACE_TASTE_RECS = "taste-recs"
SURFACE_TASTE = "taste"
SURFACE_CART_HOLD = "cart-hold"
ALLOWED_ACTIONS = frozenset({"add_to_cart", "open_book", "dismiss", "forget_taste"})


def _msg(kind: str, body: dict[str, Any]) -> dict[str, Any]:
    return {"version": A2UI_VERSION, kind: body}


def _event(name: str, context: dict[str, Any]) -> dict[str, Any]:
    return {"event": {"name": name, "context": context}}


def _create(surface_id: str) -> dict[str, Any]:
    return _msg("createSurface", {"surfaceId": surface_id, "catalogId": CATALOG_ID})


def _data(surface_id: str, value: dict[str, Any]) -> dict[str, Any]:
    return _msg("updateDataModel", {"surfaceId": surface_id, "path": "/", "value": value})


def delete_surface(surface_id: str) -> list[dict[str, Any]]:
    return [_msg("deleteSurface", {"surfaceId": surface_id})]


def _shelf(surface_id: str, *, headline: str, subtitle: str, books: list[dict[str, Any]], first: bool,
           tagged: bool) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if first:
        card = {"id": "rec_card", "component": "BookCard", "bookId": {"@path": "id"}, "title": {"@path": "title"},
                "author": {"@path": "author"}, "coverId": {"@path": "cover_id"},
                "priceCents": {"@path": "price_cents"}, "reason": {"@path": "reason"},
                "onAdd": _event("add_to_cart", {"book_id": {"@path": "id"}}),
                "onOpen": _event("open_book", {"book_id": {"@path": "id"}})}
        if tagged:
            card["tag"] = {"@path": "tag"}
        messages.append(_create(surface_id))
        messages.append(_msg("updateComponents", {"surfaceId": surface_id, "components": [
            {"id": "root", "component": "BookShelf", "title": {"@path": "/title"}, "subtitle": {"@path": "/subtitle"},
             "children": {"componentId": "rec_card", "path": "/books"},
             "onDismiss": _event("dismiss", {"surface": surface_id})},
            card,
        ]}))
    messages.append(_data(surface_id, {"title": headline, "subtitle": subtitle, "books": books}))
    return messages


def recommendations(*, headline: str, subtitle: str, books: list[dict[str, Any]], first: bool) -> list[dict[str, Any]]:
    """``books`` items: id, title, author, cover_id, price_cents, reason."""
    return _shelf(SURFACE_RECS, headline=headline, subtitle=subtitle, books=books, first=first, tagged=False)


def taste_recommendations(*, headline: str, subtitle: str, books: list[dict[str, Any]],
                          first: bool) -> list[dict[str, Any]]:
    """The researcher's shelf. ``books`` items also carry ``tag``: the profile tag the pick came from."""
    return _shelf(SURFACE_TASTE_RECS, headline=headline, subtitle=subtitle, books=books, first=first, tagged=True)


def taste_profile(*, summary: str, likes: list[str], dislikes: list[str], languages: list[str], fresh: list[str],
                  notes_session: int, notes_total: int, first: bool) -> list[dict[str, Any]]:
    """The whole stored profile. ``likes`` are chips ranked by weight; ``fresh`` names the chips just heard."""
    messages: list[dict[str, Any]] = []
    if first:
        messages.append(_create(SURFACE_TASTE))
        messages.append(_msg("updateComponents", {"surfaceId": SURFACE_TASTE, "components": [
            {"id": "root", "component": "TasteProfile", "summary": {"@path": "/summary"}, "likes": {"@path": "/likes"},
             "dislikes": {"@path": "/dislikes"}, "languages": {"@path": "/languages"}, "fresh": {"@path": "/fresh"},
             "notesSession": {"@path": "/notes_session"}, "notesTotal": {"@path": "/notes_total"},
             "onForget": _event("forget_taste", {}),
             "onDismiss": _event("dismiss", {"surface": SURFACE_TASTE})},
        ]}))
    messages.append(_data(SURFACE_TASTE, {"summary": summary, "likes": likes, "dislikes": dislikes,
                                          "languages": languages, "fresh": fresh, "notes_session": notes_session,
                                          "notes_total": notes_total}))
    return messages


def cart_hold(*, expires_at: float | None, item_count: int, total_cents: int, expired: bool,
              first: bool) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if first:
        messages.append(_create(SURFACE_CART_HOLD))
        messages.append(_msg("updateComponents", {"surfaceId": SURFACE_CART_HOLD, "components": [
            {"id": "root", "component": "CartHold", "expiresAt": {"@path": "/expires_at"},
             "itemCount": {"@path": "/item_count"}, "totalCents": {"@path": "/total_cents"},
             "expired": {"@path": "/expired"}, "onDismiss": _event("dismiss", {"surface": SURFACE_CART_HOLD})},
        ]}))
    messages.append(_data(SURFACE_CART_HOLD, {"expires_at": expires_at or 0, "item_count": item_count,
                                              "total_cents": total_cents, "expired": expired}))
    return messages


def parse_action(message: dict[str, Any]) -> tuple[str, dict[str, Any], str | None] | None:
    """Read a renderer-to-agent ``action`` envelope. Returns (name, context, surface_id) or None."""
    if not isinstance(message, dict):
        return None
    action = message.get("action") if isinstance(message.get("action"), dict) else message
    name = action.get("name")
    if name not in ALLOWED_ACTIONS:
        return None
    context = action.get("context") if isinstance(action.get("context"), dict) else {}
    surface = action.get("surfaceId") if isinstance(action.get("surfaceId"), str) else None
    return name, context, surface
