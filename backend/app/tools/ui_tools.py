"""BLOCKING tools that move the shopper's screen. They return at once; the browser does the work.

None of them moves keyboard focus or opens the mobile sheet: the page changes in view,
and the microphone stays where it was.
"""

from __future__ import annotations

from google.adk.tools import ToolContext

from .. import services
from ..catalog.search import fold, normalize_language
from ..protocol.events import CatalogFilters, UiCommand, UiLocale, UiNavigate
from ._context import session_of

SORTS = ("popular", "year_new", "year_old")

async def show_books(tool_context: ToolContext, book_ids: list[str], title: str = "") -> dict:
    """Show a set of books on the shopper's screen, for example the results of a search.

    Args:
        book_ids: Up to 6 book ids, in the order to show them.
        title: Optional short heading for the set (at most 60 characters).
    """
    session = session_of(tool_context)
    catalog = services.get().catalog
    ids = [b for b in book_ids if catalog.entry(b)][:6]
    if not ids:
        return {"error": "no_known_books"}
    session.bus.publish(UiCommand(command="show_books", book_ids=ids, title=title[:60] or None))
    return {"status": "shown", "count": len(ids)}


async def open_book(tool_context: ToolContext, book_id: str) -> dict:
    """Open the detail page of one book on the shopper's screen.

    Args:
        book_id: The book id to open.
    """
    session = session_of(tool_context)
    if not services.get().catalog.entry(book_id):
        return {"error": "unknown_book"}
    session.bus.publish(UiCommand(command="open_book", book_id=book_id))
    return {"status": "opened"}


async def open_cart(tool_context: ToolContext) -> dict:
    """Open the cart drawer on the shopper's screen."""
    session_of(tool_context).bus.publish(UiCommand(command="open_cart"))
    return {"status": "opened"}


async def highlight_book(tool_context: ToolContext, book_id: str) -> dict:
    """Point at one book on the shopper's current page: it scrolls into view and pulses once.

    Args:
        book_id: The id of a book that is on screen.
    """
    session = session_of(tool_context)
    if not services.get().catalog.entry(book_id):
        return {"error": "unknown_book"}
    session.bus.publish(UiCommand(command="highlight_book", book_id=book_id))
    return {"status": "highlighted if it is on the current page"}


async def set_language(tool_context: ToolContext, locale: str) -> dict:
    """Switch the language of the page (menus, labels, cards). Call it when the shopper switches
    language, or asks to see the page in another language.

    Args:
        locale: "en" for English or "pt-BR" for Brazilian Portuguese.
    """
    session = session_of(tool_context)
    session.locale = locale
    session.bus.publish(UiLocale(locale=locale))
    return {"status": "switched", "locale": locale}


async def browse_catalog(tool_context: ToolContext, query: str = "", subject: str = "", language: str = "",
                         sort: str = "") -> dict:
    """Open the catalog page with filters, as if the shopper had used the search box and filters.
    The shopper can press Back to return.

    Args:
        query: Optional words to search for in titles, authors and subjects.
        subject: Optional category, exactly as a search result's "category" field.
        language: Optional language filter: "en" for English or "pt" for Portuguese.
        sort: Optional order: "popular", "year_new" or "year_old".
    """
    session = session_of(tool_context)
    filters = CatalogFilters(q=query.strip() or None, subject=services.get().catalog.subject(subject),
                             lang=normalize_language(language) if language else None,
                             sort=sort if sort in SORTS and sort != "popular" else None)
    session.bus.publish(UiNavigate(params=filters))
    return {"status": "shown", "matching_books": count_on_page(filters)}


def count_on_page(filters: CatalogFilters) -> int:
    """How many books the catalog page will list: the same rule as ``filterBooks`` in the frontend."""
    words = fold(filters.q or "").split()
    count = 0
    for e in services.get().catalog.index.entries.values():
        if filters.lang and filters.lang not in e.languages:
            continue
        if filters.subject and e.category != filters.subject:
            continue
        text = fold(" ".join([e.title, e.title_pt or "", " ".join(e.author_names), e.category, " ".join(e.subjects)]))
        if all(w in text for w in words):
            count += 1
    return count
