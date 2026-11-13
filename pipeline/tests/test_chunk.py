import gzip
import io

from olpipe import chunk


class _Part(io.BytesIO):
    def __init__(self, sink, index):
        super().__init__()
        self._sink, self._index = sink, index

    def close(self):
        self._sink[self._index] = self.getvalue()
        super().close()


def _split(data: bytes, part_bytes: int, block: int = 7):
    parts: dict[int, bytes] = {}
    blocks = (data[i:i + block] for i in range(0, len(data), block))
    n, rows = chunk.split_stream(blocks, part_bytes, lambda i: _Part(parts, i))
    return [parts[i] for i in range(n)], rows


def test_parts_are_line_aligned_and_lossless():
    lines = [f"/type/work\t/works/OL{i}W\t1\t2026\t{{\"n\": {i}}}\n".encode() for i in range(200)]
    data = b"".join(lines)
    parts, rows = _split(data, part_bytes=500)
    assert len(parts) > 5
    assert b"".join(parts) == data
    assert rows == 200
    assert all(p.endswith(b"\n") for p in parts)
    assert all(len(p) <= 500 for p in parts)


def test_line_longer_than_a_part_is_kept_whole():
    data = b"short\n" + b"x" * 300 + b"\n" + b"tail\n"
    parts, rows = _split(data, part_bytes=50)
    assert b"".join(parts) == data and rows == 3
    assert all(p.endswith(b"\n") for p in parts)


def test_split_is_deterministic():
    data = b"".join(f"row {i}\n".encode() for i in range(1000))
    assert _split(data, 256, block=13)[0] == _split(data, 256, block=4096)[0]


def test_run_gunzips_multi_member_files_and_records_rows(tmp_path):
    lake = tmp_path / "lake"
    raw = lake / "raw" / "dump_date=2026-10-31"
    raw.mkdir(parents=True)
    body = b"".join(f"a\tb\t{i}\n".encode() for i in range(50))
    (raw / "ol_dump_works_2026-10-31.txt.gz").write_bytes(gzip.compress(body[:100]) + gzip.compress(body[100:]))
    parts, rows = chunk.run(dump_date="2026-10-31", file="works", lake=str(lake), part_bytes=120)
    out = sorted((lake / "bronze" / "dump_date=2026-10-31" / "works").glob("part-*.tsv"))
    assert len(out) == parts and rows == 50
    assert b"".join(p.read_bytes() for p in out) == body
