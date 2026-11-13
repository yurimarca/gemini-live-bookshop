# Catalog pipeline

Turns a pinned Open Library dump into the bookshop catalog: about 1,000 to 2,000 works in Firestore, plus one compressed search-index blob in Cloud Storage.

```
archive.org dump (pinned date, MD5 checked)
   | 1 fetch      Cloud Run job, streamed to Cloud Storage
   | 2 chunk      gunzip and split works/editions into ~2 GB line-aligned parts
   | 3 load       BigQuery load jobs, JSON kept as a STRING column
   | 4 transform  Dataform: parse, popularity, selection, assertions
   | 5 export     EXPORT DATA to NDJSON
   | 6 publish    validate, write Firestore, build the index, flip the meta/catalog pointer last
```

ELT, not ETL: raw JSON is loaded untouched and all parsing and selection is SQL. Python only does what SQL cannot (HTTP fetch, gunzip and split, Firestore writes). One image, one CLI:

```
olpipe fetch     --dump-date 2026-10-31 --files works,authors,reading-log,ratings,redirects
olpipe chunk     --dump-date 2026-10-31 --file works
olpipe seeds     --revision r1
olpipe transform --dump-date 2026-10-31 --revision r1 [--use-editions] [--dry-run]
olpipe publish   --dataset-version ol-2026-10-31-r1
```

`--lake-bucket` and `--catalog-bucket` (or `$LAKE_BUCKET`, `$CATALOG_BUCKET`) take a bucket name, a `gs://` URI or a local directory, so every stage also runs on a laptop.

## Local work (no cloud)

```bash
uv sync
make test            # unit tests on fixtures
make compile         # compile the Dataform project, no BigQuery access
make local-publish   # publish the 30-book fixture into ./out
make fixture         # rebuild ../fixtures/catalog-fixture.json from the Open Library API (60 polite requests)
```

## Layout

| Path | What it holds |
|---|---|
| `src/olpipe/models.py` | The catalog contract (`CatalogBook`, `IndexEntry`, `Manifest`). The gateway keeps a tested copy. |
| `src/olpipe/` | `fetch`, `chunk`, `publish`, `transform`, the path layer and the document store |
| `dataform/` | SQL models and assertions. The project ID is passed on the command line, never committed. |
| `seeds/selection.yaml` | Weights, segment sizes and limits. Changing it means a new revision. |
| `seeds/*.csv` | Brazilian author seed list, subject-to-category map, manual overrides |
| `workflows/catalog.yaml` | One Cloud Workflows run for all six stages |
| `infra/setup.sh`, `infra/teardown.sh` | Cloud resources, one block per invocation, run by the project owner |
| `tests/fixtures/*.tsv` | Dump-shaped samples, including a malformed row and a work with no cover |

## Reproducibility

- **Pinned input.** The dump date is required; URLs derive from it; MD5 is checked against archive.org; raw objects are written if-not-exists.
- **Versioned output.** `dataset_version` is `ol-{dump_date}-{revision}`. The run manifest records the git SHA and a hash of the seed files.
- **Idempotent.** Deterministic paths, truncating loads, Firestore `set()` by OLID, the pointer flipped last, stale documents deleted after the flip. A failed run is re-run as is.
- **Deterministic index.** Sorted entries and keys, gzip mtime 0, no timestamp inside: the same catalog always produces the same bytes.
- **Dead letters.** Unparseable raw rows go to `ol_ops.rejects`; rows that fail validation at publish go to `runs/{run_id}/rejects.ndjson`. Both have thresholds that fail the run.

## Not yet proven

The SQL compiles but has never run against BigQuery, and the workflow has never been deployed. The layouts of the redirects and wikidata dumps were not sampled. Run `olpipe transform --dry-run` first, and keep a maximum-bytes-billed guard on the first real run.
