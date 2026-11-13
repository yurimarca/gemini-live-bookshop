"""Small key-document store behind the cart and the quota: memory locally, Firestore in the cloud.

Only one operation is needed: read-modify-write of one document, atomically.
"""

from __future__ import annotations

import asyncio
import copy
from typing import Callable, Protocol

Mutator = Callable[[dict | None], tuple[dict | None, object]]
"""Takes the current document (or None) and returns (new document or None to delete, result)."""


class DocState(Protocol):
    async def get(self, collection: str, doc_id: str) -> dict | None: ...
    async def transact(self, collection: str, doc_id: str, mutate: Mutator) -> object: ...


class MemoryState:
    def __init__(self) -> None:
        self._docs: dict[tuple[str, str], dict] = {}
        self._lock = asyncio.Lock()

    async def get(self, collection: str, doc_id: str) -> dict | None:
        return copy.deepcopy(self._docs.get((collection, doc_id)))

    async def transact(self, collection: str, doc_id: str, mutate: Mutator) -> object:
        async with self._lock:
            new_doc, result = mutate(copy.deepcopy(self._docs.get((collection, doc_id))))
            if new_doc is None:
                self._docs.pop((collection, doc_id), None)
            else:
                self._docs[(collection, doc_id)] = copy.deepcopy(new_doc)
            return result


class FirestoreState:
    def __init__(self, database: str = "(default)") -> None:
        from google.cloud import firestore

        self._firestore = firestore
        self._db = firestore.AsyncClient(database=database)

    async def get(self, collection: str, doc_id: str) -> dict | None:
        snap = await self._db.collection(collection).document(doc_id).get()
        return snap.to_dict() if snap.exists else None

    async def transact(self, collection: str, doc_id: str, mutate: Mutator) -> object:
        ref = self._db.collection(collection).document(doc_id)

        @self._firestore.async_transactional
        async def _run(transaction):
            snap = await ref.get(transaction=transaction)
            new_doc, result = mutate(snap.to_dict() if snap.exists else None)
            if new_doc is None:
                transaction.delete(ref)
            else:
                transaction.set(ref, new_doc)
            return result

        return await _run(self._db.transaction())


def open_state(backend: str, database: str) -> DocState:
    return FirestoreState(database) if backend == "firestore" else MemoryState()
