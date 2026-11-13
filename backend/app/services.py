"""Process-wide services, built once in the FastAPI lifespan.

Tools run inside ADK and cannot receive FastAPI dependencies, so they read this
container. Per-session data is never stored here; it lives in the session
registry and is looked up by the session ID that ADK passes to the tool.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .auth.quota import QuotaService
from .cart.service import CartService
from .cart.timer import HoldTimer
from .catalog.repository import CatalogRepository
from .config.settings import Settings
from .live.session_bus import SessionRegistry
from .specialists.client import SpecialistClient
from .taste.profile import TasteStore


@dataclass
class Services:
    settings: Settings
    catalog: CatalogRepository
    cart: CartService
    quota: QuotaService
    specialists: SpecialistClient
    hold_timer: HoldTimer
    taste: TasteStore
    registry: SessionRegistry = field(default_factory=SessionRegistry)


_current: Services | None = None


def install(services: Services | None) -> None:
    global _current
    _current = services


def get() -> Services:
    if _current is None:
        raise RuntimeError("services are not initialised")
    return _current
