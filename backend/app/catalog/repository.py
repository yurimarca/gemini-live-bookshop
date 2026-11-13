"""Catalog repository: the slim index in memory, full documents by OLID.

Cloud mode reads the ``meta/catalog`` pointer once at startup, downloads the
index blob it names from Cloud Storage and checks its SHA-256. Search then
needs no Firestore reads; a detail lookup is one read, cached for the life of
the instance. Fixture mode serves the committed 30-book fixture for local work.
"""

from __future__ import annotations

import asyncio
import gzip
import hashlib
import json
import logging
from pathlib import Path

from .models import CatalogBook, CatalogIndex, CatalogPointer, IndexEntry
from .search import SearchIndex, fold

log = logging.getLogger(__name__)


class CatalogUnavailable(RuntimeError):
    pass


class CatalogRepository:
    def __init__(self) -> None:
        self.dataset_version = ""
        self.index: SearchIndex = SearchIndex([])
        self._slim_json: bytes = b"{}"
        self._books: dict[str, CatalogBook] = {}
        self._firestore = None

    # --- loading -----------------------------------------------------------------
    def _install(self, index: CatalogIndex) -> None:
        self.dataset_version = index.dataset_version
        self.index = SearchIndex(index.books)
        self._slim_json = json.dumps(index.model_dump(mode="json"), ensure_ascii=False,
                                     separators=(",", ":")).encode("utf-8")

    def load_fixture(self, path: str | Path) -> None:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        books = [CatalogBook.model_validate(b) for b in data["books"]]
        self._books = {b.id: b for b in books}
        self._install(CatalogIndex(dataset_version=data["dataset_version"], count=len(books),
                                   books=[b.to_index_entry() for b in books]))
        log.info("catalog: fixture %s with %d books", self.dataset_version, len(books))

    def load_cloud(self, *, database: str) -> None:
        """Blocking; call from the lifespan through a thread."""
        from google.cloud import firestore, storage

        self._firestore = firestore.Client(database=database)
        snap = self._firestore.collection("meta").document("catalog").get()
        if not snap.exists:
            raise CatalogUnavailable("meta/catalog pointer not found; has the pipeline published?")
        pointer = CatalogPointer.model_validate(snap.to_dict())
        if not pointer.index_uri.startswith("gs://"):
            raise CatalogUnavailable("meta/catalog.index_uri is not a gs:// URI")
        bucket, _, name = pointer.index_uri[len("gs://"):].partition("/")
        blob = storage.Client().bucket(bucket).blob(name).download_as_bytes(raw_download=True)
        if hashlib.sha256(blob).hexdigest() != pointer.index_sha256:
            raise CatalogUnavailable("index blob does not match the SHA-256 in meta/catalog")
        self._install(CatalogIndex.model_validate(json.loads(gzip.decompress(blob))))
        log.info("catalog: %s with %d books", self.dataset_version, len(self.index.entries))

    # --- reads -------------------------------------------------------------------
    @property
    def slim_json(self) -> bytes:
        return self._slim_json

    def categories(self) -> list[str]:
        return sorted({e.category for e in self.index.entries.values()})

    def subject(self, value: str) -> str | None:
        """The category that ``value`` names, ignoring case and accents."""
        wanted = fold(value).strip()
        return next((c for c in self.categories() if fold(c) == wanted), None) if wanted else None

    def entry(self, book_id: str) -> IndexEntry | None:
        return self.index.entries.get(book_id)

    async def get(self, book_id: str) -> CatalogBook | None:
        if book_id not in self.index.entries:
            return None  # unknown IDs never reach Firestore
        cached = self._books.get(book_id)
        if cached or self._firestore is None:
            return cached
        snap = await asyncio.to_thread(self._firestore.collection("books").document(book_id).get)
        if not snap.exists:
            return None
        book = CatalogBook.model_validate(snap.to_dict())
        self._books[book_id] = book
        return book
