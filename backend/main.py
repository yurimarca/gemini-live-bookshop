"""Bookshop gateway: catalog and cart REST, the live voice WebSocket, and the cart-timer callback."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import services as services_module
from app.api import cart as cart_api
from app.api import profile as profile_api
from app.api import catalog as catalog_api
from app.api import internal_tasks, ws_live
from app.auth.quota import QuotaService
from app.cart.service import CartService, CartView
from app.cart.timer import CloudTasksHoldTimer, LocalHoldTimer
from app.catalog.repository import CatalogRepository
from app.config.settings import Settings, get_settings
from app.live.session import publish_cart
from app.live.voice_agent import build_runner
from app.services import Services
from app.specialists.client import build_specialists
from app.state import open_state
from app.taste.profile import TasteStore

# Message content (transcripts, tool arguments) is never logged; only event types and counts are.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("gateway")


async def build_services(settings: Settings) -> Services:
    catalog = CatalogRepository()
    if settings.catalog_source == "cloud":
        await asyncio.to_thread(catalog.load_cloud, database=settings.firestore_database)
    else:
        catalog.load_fixture(settings.catalog_fixture_path)

    state = open_state(settings.state_backend, settings.firestore_database)
    cart = CartService(state, catalog, hold_seconds=settings.cart_hold_seconds, max_items=settings.cart_max_items,
                       max_quantity=settings.cart_max_quantity)
    quota = QuotaService(state, per_user=settings.sessions_per_user_per_day,
                         global_cap=settings.sessions_global_per_day)

    async def fire_local(uid: str, expires_at: float) -> None:
        await cart.expire(uid, expected_expiry=expires_at)

    if settings.tasks_backend == "cloud_tasks":
        timer = CloudTasksHoldTimer(project=settings.google_cloud_project, location=settings.google_cloud_location,
                                    queue=settings.tasks_queue, base_url=settings.public_base_url,
                                    service_account=settings.tasks_service_account)
    else:
        timer = LocalHoldTimer(fire_local, time.time)
    cart.set_hold_scheduler(timer.schedule)

    svc = Services(settings=settings, catalog=catalog, cart=cart, quota=quota,
                   specialists=build_specialists(settings), hold_timer=timer, taste=TasteStore(state))

    async def fan_out(uid: str, view: CartView, op_id: str | None) -> None:
        # Best effort: a Cloud Tasks callback may land on another instance than the user's socket.
        # Firestore is the durable truth and the browser re-reads the cart on load.
        for ctx in svc.registry.for_uid(uid):
            publish_cart(ctx, view, op_id, timer.runs_on, announce=settings.announce_cart_expiry)

    cart.on_change(fan_out)
    return svc


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        svc = await build_services(settings)
        services_module.install(svc)
        app.state.services = svc
        app.state.settings = settings
        app.state.runner = build_runner(settings)
        log.info("gateway ready: catalog=%s state=%s auth=%s specialists=%s model=%s",
                 settings.catalog_source, settings.state_backend, settings.auth_mode,
                 settings.specialists_backend, settings.live_model)
        yield
        services_module.install(None)

    app = FastAPI(title="Bookshop gateway", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["Authorization", "Content-Type"], max_age=600)
    app.include_router(catalog_api.router)
    app.include_router(cart_api.router)
    app.include_router(profile_api.router)
    app.include_router(internal_tasks.router)
    app.include_router(ws_live.router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok", "dataset_version": app.state.services.catalog.dataset_version}

    return app


app = create_app()
