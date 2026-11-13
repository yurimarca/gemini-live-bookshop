"""Cart-hold timer. A timer, not an agent: Cloud Tasks calls the gateway back when the hold ends.

An in-process timer would be lost when Cloud Run removes the instance, so the
cloud backend is Cloud Tasks with an OIDC token. The local backend is for
development only.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Awaitable, Callable, Protocol

log = logging.getLogger(__name__)

HANDLER_PATH = "/internal/tasks/cart-expiry"


class HoldTimer(Protocol):
    runs_on: str

    async def schedule(self, uid: str, expires_at: float) -> None: ...


class LocalHoldTimer:
    runs_on = "gateway"

    def __init__(self, on_fire: Callable[[str, float], Awaitable[None]], clock: Callable[[], float]) -> None:
        self._on_fire, self._clock = on_fire, clock
        self._tasks: dict[str, asyncio.Task] = {}

    async def schedule(self, uid: str, expires_at: float) -> None:
        previous = self._tasks.pop(uid, None)
        if previous:
            previous.cancel()

        async def _wait() -> None:
            await asyncio.sleep(max(0.0, expires_at - self._clock()))
            await self._on_fire(uid, expires_at)

        self._tasks[uid] = asyncio.create_task(_wait())


class CloudTasksHoldTimer:
    runs_on = "cloud_tasks"

    def __init__(self, *, project: str, location: str, queue: str, base_url: str, service_account: str) -> None:
        from google.cloud import tasks_v2

        if not (project and base_url and service_account):
            raise ValueError("Cloud Tasks needs GOOGLE_CLOUD_PROJECT, PUBLIC_BASE_URL and TASKS_SERVICE_ACCOUNT")
        self._tasks_v2 = tasks_v2
        self._client = tasks_v2.CloudTasksAsyncClient()
        self._parent = self._client.queue_path(project, location, queue)
        self._url = base_url.rstrip("/") + HANDLER_PATH
        self._audience = base_url.rstrip("/")
        self._service_account = service_account

    async def schedule(self, uid: str, expires_at: float) -> None:
        from google.protobuf import timestamp_pb2

        when = timestamp_pb2.Timestamp()
        when.FromMicroseconds(int(expires_at * 1_000_000))
        task = self._tasks_v2.Task(
            schedule_time=when,
            http_request=self._tasks_v2.HttpRequest(
                http_method=self._tasks_v2.HttpMethod.POST,
                url=self._url,
                headers={"Content-Type": "application/json"},
                body=json.dumps({"uid": uid, "expires_at": expires_at}).encode(),
                oidc_token=self._tasks_v2.OidcToken(
                    service_account_email=self._service_account, audience=self._audience),
            ),
        )
        try:
            await self._client.create_task(parent=self._parent, task=task)
        except Exception:  # the cart still expires lazily on the next read
            log.exception("could not schedule the cart-expiry task")
