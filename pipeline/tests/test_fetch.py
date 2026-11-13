import hashlib

import httpx
import pytest

from olpipe import fetch, manifest

DATE = "2026-10-31"
BODY = b"pretend gzip bytes" * 100
NAME = f"ol_dump_ratings_{DATE}.txt.gz"


def _client(md5: str, calls: list[str]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.startswith("/metadata/"):
            return httpx.Response(200, json={"result": [{"name": NAME, "md5": md5, "size": str(len(BODY))}]})
        return httpx.Response(200, content=BODY)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetch_lands_file_with_checksums_and_is_idempotent(tmp_path):
    calls: list[str] = []
    client = _client(hashlib.md5(BODY).hexdigest(), calls)
    sources = fetch.run(dump_date=DATE, files=["ratings"], lake=str(tmp_path), client=client)
    landed = tmp_path / "raw" / f"dump_date={DATE}" / NAME
    assert landed.read_bytes() == BODY
    assert sources[0].sha256 == hashlib.sha256(BODY).hexdigest() and sources[0].bytes == len(BODY)
    assert manifest.load_sources(str(tmp_path), DATE)[0].name == NAME

    fetch.run(dump_date=DATE, files=["ratings"], lake=str(tmp_path), client=client)
    assert sum(1 for c in calls if c.startswith("/download/")) == 1  # second run skipped the download


def test_md5_mismatch_removes_the_object(tmp_path):
    client = _client("0" * 32, [])
    with pytest.raises(ValueError, match="MD5 mismatch"):
        fetch.run(dump_date=DATE, files=["ratings"], lake=str(tmp_path), client=client)
    assert not (tmp_path / "raw" / f"dump_date={DATE}" / NAME).exists()


def test_unknown_or_unlisted_files_fail_early():
    with pytest.raises(ValueError):
        fetch.resolve_files([], DATE, ["nope"])
    with pytest.raises(LookupError):
        fetch.resolve_files([], DATE, ["works"])
