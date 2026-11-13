"""Stage 1: stream pinned Open Library dump files into the lake, with checksums.

The dump date is required; URLs derive from it. MD5 is checked against the
archive.org metadata API. Landing objects are written if-not-exists.
"""

from __future__ import annotations

import hashlib
import logging

import httpx

from . import manifest, storage
from .models import SourceFile

log = logging.getLogger(__name__)

USER_AGENT = "olpipe/0.1 (catalog demo pipeline)"
KNOWN_FILES = ("works", "editions", "authors", "reading-log", "ratings", "redirects", "wikidata")


def item_name(dump_date: str) -> str:
    return f"ol_dump_{dump_date}"


def resolve_files(listing: list[dict], dump_date: str, names: list[str]) -> dict[str, dict]:
    """Map short names ("works") to the archive.org metadata rows for this dump."""
    resolved: dict[str, dict] = {}
    for short in names:
        if short not in KNOWN_FILES:
            raise ValueError(f"unknown dump file {short!r}; expected one of {KNOWN_FILES}")
        wanted = f"ol_dump_{short}_{dump_date}.txt.gz"
        match = next((row for row in listing if row.get("name") == wanted), None)
        if match is None:
            raise LookupError(f"{wanted} is not listed in {item_name(dump_date)}")
        if not match.get("md5"):
            raise LookupError(f"{wanted} has no MD5 in the archive.org metadata")
        resolved[short] = match
    return resolved


def fetch_listing(client: httpx.Client, dump_date: str) -> list[dict]:
    resp = client.get(f"https://archive.org/metadata/{item_name(dump_date)}/files")
    resp.raise_for_status()
    return resp.json().get("result", [])


def stream_to(uri: str, chunks, *, expected_md5: str, if_not_exists: bool = True) -> tuple[int, str, str]:
    """Write an iterator of byte chunks to ``uri`` while hashing. Deletes the object on mismatch."""
    md5, sha = hashlib.md5(), hashlib.sha256()  # noqa: S324 - MD5 is the checksum archive.org publishes
    size = 0
    with storage.open_write(uri, content_type="application/gzip", if_not_exists=if_not_exists) as out:
        for chunk in chunks:
            md5.update(chunk)
            sha.update(chunk)
            size += len(chunk)
            out.write(chunk)
    if md5.hexdigest() != expected_md5:
        storage.delete(uri)
        raise ValueError(f"MD5 mismatch for {uri}: got {md5.hexdigest()}, expected {expected_md5}")
    return size, md5.hexdigest(), sha.hexdigest()


def run(*, dump_date: str, files: list[str], lake: str, client: httpx.Client | None = None) -> list[SourceFile]:
    own_client = client is None
    client = client or httpx.Client(
        headers={"User-Agent": USER_AGENT}, follow_redirects=True,
        timeout=httpx.Timeout(60.0, read=300.0),
    )
    try:
        resolved = resolve_files(fetch_listing(client, dump_date), dump_date, files)
        sources = {s.name: s for s in manifest.load_sources(lake, dump_date)}
        for short, row in resolved.items():
            name = row["name"]
            dest = storage.join(lake, "raw", f"dump_date={dump_date}", name)
            if storage.exists(dest) and name in sources and sources[name].md5 == row["md5"]:
                log.info("skip %s: already landed with a matching MD5", name)
                continue
            if storage.exists(dest):
                raise FileExistsError(
                    f"{dest} exists without a matching manifest entry; raw objects are immutable, remove it by hand"
                )
            url = f"https://archive.org/download/{item_name(dump_date)}/{name}"
            log.info("fetch %s (%s bytes)", name, row.get("size", "?"))
            with client.stream("GET", url) as resp:
                resp.raise_for_status()
                size, md5, sha = stream_to(dest, resp.iter_bytes(8 * 1024 * 1024), expected_md5=row["md5"])
            sources[name] = SourceFile(name=name, url=url, bytes=size, md5=md5, sha256=sha)
            manifest.save_sources(lake, dump_date, list(sources.values()))
            log.info("landed %s: %d bytes sha256=%s", name, size, sha)
        return list(sources.values())
    finally:
        if own_client:
            client.close()
