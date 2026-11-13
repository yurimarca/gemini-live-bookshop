"""Stage 6: validate the exported mart, write Firestore, build the index, flip the pointer.

Order matters for readers: documents first, then the index blob, then the
manifest, and the ``meta/catalog`` pointer last. Stale documents are deleted
only after the flip. Every step is idempotent, so a failed run is re-run as is.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import logging
import re
from collections import Counter
from datetime import datetime, timezone

from pydantic import ValidationError

from . import manifest as manifest_mod
from . import storage
from .docstore import DocStore
from .models import CatalogBook, CatalogIndex, CatalogPointer, Manifest

log = logging.getLogger(__name__)

MIN_BOOKS = 1000
MAX_BOOKS = 2000
MAX_REJECT_RATE = 0.001


def parse_version(version: str) -> tuple[str, str]:
    """``ol-2026-10-31-r1`` -> (``2026-10-31``, ``r1``)."""
    match = re.fullmatch(r"ol-(.+)-([A-Za-z0-9]+)", version)
    if not match:
        raise ValueError(f"dataset version {version!r} must look like ol-YYYY-MM-DD-rN")
    return match.group(1), match.group(2)


def read_export(pattern: str):
    """Yield (line_number, raw_dict) from every NDJSON file matching the pattern."""
    n = 0
    for uri in storage.list_matching(pattern):
        with storage.open_read(uri) as fh:
            for line in io.TextIOWrapper(fh, encoding="utf-8"):
                line = line.strip()
                if not line:
                    continue
                n += 1
                try:
                    yield n, json.loads(line), None
                except json.JSONDecodeError as exc:
                    yield n, {"_raw": line[:2000]}, str(exc)


def validate(rows, dataset_version: str) -> tuple[list[CatalogBook], list[dict]]:
    books: dict[str, CatalogBook] = {}
    rejects: list[dict] = []
    for n, raw, parse_error in rows:
        if parse_error:
            rejects.append({"line": n, "error": parse_error, "row": raw})
            continue
        try:
            book = CatalogBook.model_validate(raw)
            if book.dataset_version != dataset_version:
                raise ValueError(f"row has dataset_version {book.dataset_version}")
            if book.id in books:
                raise ValueError("duplicate id")
            books[book.id] = book
        except (ValidationError, ValueError) as exc:
            rejects.append({"line": n, "id": raw.get("id"), "error": str(exc)[:1000]})
    return sorted(books.values(), key=lambda b: b.id), rejects


def build_index(books: list[CatalogBook], dataset_version: str) -> bytes:
    """Deterministic blob: sorted entries and keys, gzip mtime 0, no timestamp inside."""
    index = CatalogIndex(
        dataset_version=dataset_version,
        count=len(books),
        books=[b.to_index_entry() for b in sorted(books, key=lambda b: b.id)],
    )
    payload = json.dumps(index.model_dump(mode="json"), sort_keys=True, ensure_ascii=False,
                         separators=(",", ":")).encode("utf-8")
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, mtime=0, compresslevel=9) as gz:
        gz.write(payload)
    return buf.getvalue()


def run(*, dataset_version: str, lake: str, catalog: str, store: DocStore, seeds_dir: str | None = None,
        export_pattern: str | None = None, min_books: int = MIN_BOOKS, max_books: int = MAX_BOOKS,
        max_reject_rate: float = MAX_REJECT_RATE, now: datetime | None = None) -> Manifest:
    dump_date, revision = parse_version(dataset_version)
    pattern = export_pattern or storage.join(lake, "gold", dataset_version, "catalog-*.json")
    run_id = f"publish-{dataset_version}"

    books, rejects = validate(read_export(pattern), dataset_version)
    total = len(books) + len(rejects)
    if rejects:
        storage.write_bytes(
            storage.join(lake, "runs", run_id, "rejects.ndjson"),
            "".join(json.dumps(r, sort_keys=True, ensure_ascii=False) + "\n" for r in rejects).encode(),
            content_type="application/x-ndjson",
        )
    if total == 0:
        raise RuntimeError(f"no rows found at {pattern}")
    if len(rejects) / total > max_reject_rate:
        raise RuntimeError(f"{len(rejects)} of {total} rows rejected, above the {max_reject_rate:.2%} threshold")
    if not min_books <= len(books) <= max_books:
        raise RuntimeError(f"{len(books)} books is outside the allowed range {min_books} to {max_books}")

    writes = store.set_many("books", {b.id: b.model_dump(mode="json") for b in books})

    blob = build_index(books, dataset_version)
    index_sha = hashlib.sha256(blob).hexdigest()
    index_uri = storage.join(catalog, "index", dataset_version, "catalog-index.json.gz")
    # Stored as an opaque gzip object (no Content-Encoding), so readers get the exact bytes that were hashed.
    storage.write_bytes(index_uri, blob, content_type="application/gzip", cache_control="public, max-age=31536000, immutable")

    segment_counts = Counter(seg for b in books for seg in b.segments)
    run_manifest = Manifest(
        run_id=run_id, dataset_version=dataset_version, dump_date=dump_date, revision=revision,
        git_sha=manifest_mod.git_sha(),
        config_hash=manifest_mod.config_hash(seeds_dir) if seeds_dir else None,
        sources=manifest_mod.load_sources(lake, dump_date),
        row_counts={"exported": total, "published": len(books)},
        rejects=len(rejects), firestore_writes=writes, index_sha256=index_sha, index_uri=index_uri,
    )

    pointer = CatalogPointer(
        dataset_version=dataset_version, index_uri=index_uri, index_sha256=index_sha, count=len(books),
        segment_counts=dict(sorted(segment_counts.items())),
        published_at=(now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
    )
    store.set("meta", "catalog", pointer.model_dump(mode="json"))  # the flip

    stale = list(store.ids_where_not("books", "dataset_version", dataset_version))
    run_manifest.firestore_deletes = store.delete_many("books", stale) if stale else 0
    manifest_mod.save_run(lake, run_manifest)
    log.info("published %s: %d books, %d rejects, %d stale deleted, index sha256=%s",
             dataset_version, len(books), len(rejects), run_manifest.firestore_deletes, index_sha)
    return run_manifest
