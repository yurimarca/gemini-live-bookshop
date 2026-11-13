"""Run and source manifests, stored as JSON next to the data they describe."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from . import storage
from .models import Manifest, SourceFile


def git_sha() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def config_hash(seeds_dir: str | Path) -> str:
    """Hash of every seed file, so a selection change shows up in the manifest."""
    digest = hashlib.sha256()
    for path in sorted(Path(seeds_dir).glob("*")):
        if path.is_file():
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def dumps(model) -> bytes:
    return (json.dumps(model.model_dump(mode="json"), sort_keys=True, indent=2) + "\n").encode()


def source_manifest_uri(lake: str, dump_date: str) -> str:
    return storage.join(lake, "raw", f"dump_date={dump_date}", "manifests", "source.json")


def load_sources(lake: str, dump_date: str) -> list[SourceFile]:
    uri = source_manifest_uri(lake, dump_date)
    if not storage.exists(uri):
        return []
    return [SourceFile(**row) for row in json.loads(storage.read_bytes(uri))]


def save_sources(lake: str, dump_date: str, sources: list[SourceFile]) -> None:
    rows = [s.model_dump(mode="json") for s in sorted(sources, key=lambda s: s.name)]
    storage.write_bytes(
        source_manifest_uri(lake, dump_date),
        (json.dumps(rows, sort_keys=True, indent=2) + "\n").encode(),
        content_type="application/json",
    )


def save_run(lake: str, manifest: Manifest) -> str:
    uri = storage.join(lake, "runs", manifest.run_id, "manifest.json")
    storage.write_bytes(uri, dumps(manifest), content_type="application/json")
    # One-line copy, loadable into ol_ops.run_log with `bq load --source_format=NEWLINE_DELIMITED_JSON`.
    line = json.dumps(
        {**manifest.model_dump(mode="json", exclude={"sources", "row_counts"}),
         "row_counts": json.dumps(manifest.row_counts, sort_keys=True)},
        sort_keys=True,
    )
    storage.write_bytes(storage.join(lake, "runs", manifest.run_id, "run_log.ndjson"),
                        (line + "\n").encode(), content_type="application/x-ndjson")
    return uri
