"""Document store used by publish: Firestore in the cloud, a JSON directory locally.

Set ``FIRESTORE_EMULATOR_HOST`` to point the Firestore store at the emulator.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator, Protocol


class DocStore(Protocol):
    def set_many(self, collection: str, docs: dict[str, dict]) -> int: ...
    def set(self, collection: str, doc_id: str, doc: dict) -> None: ...
    def get(self, collection: str, doc_id: str) -> dict | None: ...
    def ids_where_not(self, collection: str, field: str, value: str) -> Iterator[str]: ...
    def delete_many(self, collection: str, ids: list[str]) -> int: ...


class LocalDocStore:
    """One JSON file per document under ``root/collection/``. Used by tests and dry runs."""

    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _path(self, collection: str, doc_id: str) -> Path:
        return self.root / collection / f"{doc_id}.json"

    def set(self, collection: str, doc_id: str, doc: dict) -> None:
        path = self._path(collection, doc_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc, sort_keys=True, ensure_ascii=False))

    def set_many(self, collection: str, docs: dict[str, dict]) -> int:
        for doc_id, doc in docs.items():
            self.set(collection, doc_id, doc)
        return len(docs)

    def get(self, collection: str, doc_id: str) -> dict | None:
        path = self._path(collection, doc_id)
        return json.loads(path.read_text()) if path.exists() else None

    def ids_where_not(self, collection: str, field: str, value: str) -> Iterator[str]:
        for path in sorted((self.root / collection).glob("*.json")):
            if json.loads(path.read_text()).get(field) != value:
                yield path.stem

    def delete_many(self, collection: str, ids: list[str]) -> int:
        for doc_id in ids:
            self._path(collection, doc_id).unlink(missing_ok=True)
        return len(ids)


class FirestoreDocStore:
    BATCH = 400  # Firestore allows 500 writes per batch

    def __init__(self, database: str = "(default)"):
        from google.cloud import firestore

        self._db = firestore.Client(database=database)

    def set(self, collection: str, doc_id: str, doc: dict) -> None:
        self._db.collection(collection).document(doc_id).set(doc)

    def set_many(self, collection: str, docs: dict[str, dict]) -> int:
        items = list(docs.items())
        for start in range(0, len(items), self.BATCH):
            batch = self._db.batch()
            for doc_id, doc in items[start:start + self.BATCH]:
                batch.set(self._db.collection(collection).document(doc_id), doc)
            batch.commit()
        return len(items)

    def get(self, collection: str, doc_id: str) -> dict | None:
        snap = self._db.collection(collection).document(doc_id).get()
        return snap.to_dict() if snap.exists else None

    def ids_where_not(self, collection: str, field: str, value: str) -> Iterator[str]:
        # A != query skips documents that lack the field, so compare client-side on a
        # projection. The collection is at most about 2k documents.
        for snap in self._db.collection(collection).select([field]).stream():
            if (snap.to_dict() or {}).get(field) != value:
                yield snap.id

    def delete_many(self, collection: str, ids: list[str]) -> int:
        for start in range(0, len(ids), self.BATCH):
            batch = self._db.batch()
            for doc_id in ids[start:start + self.BATCH]:
                batch.delete(self._db.collection(collection).document(doc_id))
            batch.commit()
        return len(ids)


def open_store(spec: str) -> DocStore:
    """``firestore`` or ``firestore:<database>`` or ``local:<dir>``."""
    kind, _, arg = spec.partition(":")
    if kind == "local":
        return LocalDocStore(arg or "out/firestore")
    if kind == "firestore":
        return FirestoreDocStore(arg or "(default)")
    raise ValueError(f"unknown doc store {spec!r}")
