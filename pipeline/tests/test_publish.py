import gzip
import json

import pytest

from olpipe import publish
from olpipe.docstore import LocalDocStore
from olpipe.models import CatalogBook, CatalogIndex


def _run(export_dir, store, **kw):
    return publish.run(dataset_version="ol-fixture-r1", lake=str(export_dir / "lake"),
                       catalog=str(export_dir / "catalog"), store=store, min_books=10, max_books=50, **kw)


def test_parse_version():
    assert publish.parse_version("ol-2026-10-31-r1") == ("2026-10-31", "r1")
    with pytest.raises(ValueError):
        publish.parse_version("latest")


def test_publish_writes_docs_index_pointer_and_manifest(export_dir):
    store = LocalDocStore(export_dir / "fs")
    m = _run(export_dir, store)
    assert m.firestore_writes == 30 and m.rejects == 0

    pointer = store.get("meta", "catalog")
    assert pointer["count"] == 30 and pointer["dataset_version"] == "ol-fixture-r1"
    assert pointer["segment_counts"]["brazilian_author"] >= 1

    blob = (export_dir / "catalog" / "index" / "ol-fixture-r1" / "catalog-index.json.gz").read_bytes()
    index = CatalogIndex.model_validate(json.loads(gzip.decompress(blob)))
    assert index.count == 30 and [b.id for b in index.books] == sorted(b.id for b in index.books)
    assert (export_dir / "lake" / "runs" / m.run_id / "manifest.json").exists()
    assert CatalogBook.model_validate(store.get("books", index.books[0].id))


def test_index_blob_is_deterministic(fixture_books):
    books = [CatalogBook.model_validate(b) for b in fixture_books]
    assert publish.build_index(books, "v") == publish.build_index(list(reversed(books)), "v")


def test_republish_is_idempotent_and_removes_stale_docs(export_dir):
    store = LocalDocStore(export_dir / "fs")
    first = _run(export_dir, store)
    store.set("books", "OL1W", {"id": "OL1W", "dataset_version": "ol-old-r0"})
    second = _run(export_dir, store)
    assert second.index_sha256 == first.index_sha256
    assert second.firestore_deletes == 1 and store.get("books", "OL1W") is None
    assert len(list((export_dir / "fs" / "books").glob("*.json"))) == 30


def test_bad_rows_go_to_dead_letter_and_fail_the_run(export_dir):
    gold = export_dir / "lake" / "gold" / "ol-fixture-r1"
    (gold / "catalog-000000000009.json").write_text('{"id": "OL5W", "title": ""}\nnot json\n')
    store = LocalDocStore(export_dir / "fs")
    with pytest.raises(RuntimeError, match="rejected"):
        _run(export_dir, store)
    rejects = (export_dir / "lake" / "runs" / "publish-ol-fixture-r1" / "rejects.ndjson").read_text().splitlines()
    assert len(rejects) == 2
    assert store.get("meta", "catalog") is None  # pointer never flipped


def test_bigquery_style_string_integers_are_accepted(fixture_books):
    row = json.loads(json.dumps(fixture_books[0]))
    row["price_cents"] = str(row["price_cents"])
    row["popularity"]["rank"] = str(row["popularity"]["rank"])
    books, rejects = publish.validate([(1, row, None)], "ol-fixture-r1")
    assert len(books) == 1 and not rejects
