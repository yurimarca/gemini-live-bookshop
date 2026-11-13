"""Session quota: a per-user daily count and a global daily cap, in one transaction.

Anonymous users can mint new uids at will, so the per-user count only slows a
polite client down. The global cap is the real spending control.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from ..state import DocState

COLLECTION = "quota"
MAX_TRACKED_USERS = 5000  # keeps the daily document well under Firestore's 1 MiB limit


@dataclass
class QuotaDecision:
    allowed: bool
    reason: str | None  # "user" | "global"
    sessions_left_today: int


class QuotaService:
    def __init__(self, state: DocState, *, per_user: int, global_cap: int,
                 clock: Callable[[], float] = time.time) -> None:
        self._state, self._per_user, self._global = state, per_user, global_cap
        self._clock = clock

    def _day(self) -> str:
        return time.strftime("%Y-%m-%d", time.gmtime(self._clock()))

    async def try_start(self, uid: str) -> QuotaDecision:
        def mutate(doc: dict | None):
            doc = doc or {"total": 0, "users": {}}
            used = doc["users"].get(uid, 0)
            if doc["total"] >= self._global:
                return doc, QuotaDecision(False, "global", 0)
            if used >= self._per_user:
                return doc, QuotaDecision(False, "user", 0)
            if uid not in doc["users"] and len(doc["users"]) >= MAX_TRACKED_USERS:
                return doc, QuotaDecision(False, "global", 0)
            doc["total"] += 1
            doc["users"][uid] = used + 1
            left = min(self._per_user - used - 1, self._global - doc["total"])
            return doc, QuotaDecision(True, None, max(left, 0))

        return await self._state.transact(COLLECTION, self._day(), mutate)

    async def remaining(self, uid: str) -> int:
        doc = await self._state.get(COLLECTION, self._day()) or {"total": 0, "users": {}}
        return max(min(self._per_user - doc["users"].get(uid, 0), self._global - doc["total"]), 0)
