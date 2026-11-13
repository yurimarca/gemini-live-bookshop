"""Tiny path layer: the same code runs on local paths and on ``gs://`` URIs.

Everything streams. Cloud Run's filesystem is memory-backed, so no stage may
write a dump to local disk in the cloud.
"""

from __future__ import annotations

import fnmatch
import os
from pathlib import Path
from typing import BinaryIO, Iterator

_client = None


def is_gcs(uri: str) -> bool:
    return uri.startswith("gs://")


def _split(uri: str) -> tuple[str, str]:
    bucket, _, name = uri[len("gs://"):].partition("/")
    return bucket, name


def _blob(uri: str):
    global _client
    if _client is None:
        from google.cloud import storage  # imported lazily so local runs need no credentials

        _client = storage.Client()
    bucket, name = _split(uri)
    return _client.bucket(bucket).blob(name)


def join(base: str, *parts: str) -> str:
    return "/".join([base.rstrip("/"), *[p.strip("/") for p in parts]])


def exists(uri: str) -> bool:
    return _blob(uri).exists() if is_gcs(uri) else Path(uri).exists()


def open_read(uri: str) -> BinaryIO:
    if is_gcs(uri):
        return _blob(uri).open("rb", chunk_size=8 * 1024 * 1024)
    return open(uri, "rb")


def open_write(uri: str, *, content_type: str | None = None, if_not_exists: bool = False) -> BinaryIO:
    """Open for streaming write. ``if_not_exists`` makes raw landing objects immutable."""
    if is_gcs(uri):
        kwargs = {"if_generation_match": 0} if if_not_exists else {}
        return _blob(uri).open("wb", chunk_size=8 * 1024 * 1024, content_type=content_type, **kwargs)
    path = Path(uri)
    if if_not_exists and path.exists():
        raise FileExistsError(uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    return open(path, "wb")


def write_bytes(uri: str, data: bytes, *, content_type: str | None = None,
                content_encoding: str | None = None, cache_control: str | None = None) -> None:
    if is_gcs(uri):
        blob = _blob(uri)
        blob.content_encoding = content_encoding
        blob.cache_control = cache_control
        blob.upload_from_string(data, content_type=content_type or "application/octet-stream")
        return
    path = Path(uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def read_bytes(uri: str) -> bytes:
    with open_read(uri) as fh:
        return fh.read()


def delete(uri: str) -> None:
    if is_gcs(uri):
        _blob(uri).delete()
    else:
        Path(uri).unlink(missing_ok=True)


def list_matching(pattern: str) -> Iterator[str]:
    """List objects matching a single ``*`` glob in the last path segment, sorted."""
    base, _, leaf = pattern.rpartition("/")
    if is_gcs(pattern):
        bucket, prefix = _split(base + "/")
        global _client
        if _client is None:
            from google.cloud import storage

            _client = storage.Client()
        names = [b.name for b in _client.list_blobs(bucket, prefix=prefix, delimiter="/")]
        for name in sorted(names):
            if fnmatch.fnmatch(name.rsplit("/", 1)[-1], leaf):
                yield f"gs://{bucket}/{name}"
        return
    if not os.path.isdir(base):
        return
    for name in sorted(os.listdir(base)):
        if fnmatch.fnmatch(name, leaf):
            yield f"{base}/{name}"
