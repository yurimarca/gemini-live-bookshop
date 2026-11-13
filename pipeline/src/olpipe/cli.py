"""``olpipe``: one image, three stage subcommands plus two helpers."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from . import chunk, fetch, publish, selection, storage, transform
from .docstore import open_store
from .models import dataset_version


def _bucket(env: str, flag: str | None) -> str:
    value = flag or os.environ.get(env)
    if not value:
        sys.exit(f"set --{env.lower().replace('_', '-')} or ${env}")
    return value if value.startswith(("gs://", "/", ".")) else f"gs://{value}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="olpipe")
    parser.add_argument("--lake-bucket", help="lake bucket name, gs:// URI or local directory (env LAKE_BUCKET)")
    parser.add_argument("--catalog-bucket", help="catalog bucket name, gs:// URI or local directory (env CATALOG_BUCKET)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("fetch", help="stream dump files from archive.org into the lake")
    p.add_argument("--dump-date", required=True)
    p.add_argument("--files", required=True, help="comma-separated: " + ",".join(fetch.KNOWN_FILES))

    p = sub.add_parser("chunk", help="gunzip and split one dump into line-aligned parts")
    p.add_argument("--dump-date", required=True)
    p.add_argument("--file", required=True)
    p.add_argument("--part-bytes", type=int, default=chunk.DEFAULT_PART_BYTES)

    p = sub.add_parser("publish", help="validate the export, write Firestore and the index, flip the pointer")
    p.add_argument("--dataset-version", required=True)
    p.add_argument("--store", default="firestore", help="firestore | firestore:<database> | local:<dir>")
    p.add_argument("--seeds-dir", default=None)
    p.add_argument("--export-pattern", default=None)
    p.add_argument("--min-books", type=int, default=publish.MIN_BOOKS)
    p.add_argument("--max-books", type=int, default=publish.MAX_BOOKS)

    p = sub.add_parser("seeds", help="copy the seed CSV files into the lake so BigQuery can load them")
    p.add_argument("--revision", required=True)
    p.add_argument("--seeds-dir", default="seeds")

    p = sub.add_parser("transform", help="run the Dataform project (needs the dataform CLI on PATH)")
    p.add_argument("--dump-date", required=True)
    p.add_argument("--revision", required=True)
    p.add_argument("--use-editions", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--dataform-dir", default="dataform")
    p.add_argument("--selection", default="seeds/selection.yaml")

    p = sub.add_parser("dataform-vars", help="print the --vars string for the Dataform CLI")
    p.add_argument("--dump-date", required=True)
    p.add_argument("--revision", required=True)
    p.add_argument("--selection", default="seeds/selection.yaml")

    p = sub.add_parser("version", help="print the dataset version for a dump date and revision")
    p.add_argument("--dump-date", required=True)
    p.add_argument("--revision", required=True)

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    if args.command == "fetch":
        fetch.run(dump_date=args.dump_date, files=[f.strip() for f in args.files.split(",") if f.strip()],
                  lake=_bucket("LAKE_BUCKET", args.lake_bucket))
    elif args.command == "chunk":
        chunk.run(dump_date=args.dump_date, file=args.file, lake=_bucket("LAKE_BUCKET", args.lake_bucket),
                  part_bytes=args.part_bytes)
    elif args.command == "publish":
        publish.run(dataset_version=args.dataset_version, lake=_bucket("LAKE_BUCKET", args.lake_bucket),
                    catalog=_bucket("CATALOG_BUCKET", args.catalog_bucket), store=open_store(args.store),
                    seeds_dir=args.seeds_dir, export_pattern=args.export_pattern,
                    min_books=args.min_books, max_books=args.max_books)
    elif args.command == "seeds":
        lake = _bucket("LAKE_BUCKET", args.lake_bucket)
        for path in sorted(Path(args.seeds_dir).glob("*.csv")):
            storage.write_bytes(storage.join(lake, "seeds", args.revision, path.name), path.read_bytes(),
                                content_type="text/csv")
    elif args.command == "transform":
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        if not project:
            sys.exit("set $GOOGLE_CLOUD_PROJECT")
        return transform.run(dump_date=args.dump_date, revision=args.revision, project=project,
                             location=os.environ.get("REGION", "us-central1"), dataform_dir=args.dataform_dir,
                             selection_path=args.selection, use_editions=args.use_editions, dry_run=args.dry_run)
    elif args.command == "dataform-vars":
        print(selection.dataform_vars(selection.load(args.selection), args.dump_date, args.revision))
    elif args.command == "version":
        print(dataset_version(args.dump_date, args.revision))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
