"""Stage 2: gunzip a landed dump and split it into line-aligned parts.

BigQuery reads a gzip CSV serially and caps it at 4 GB, so the large dumps are
decompressed and split. Parts are deterministic for a given input and size.
"""

from __future__ import annotations

import logging
import zlib

from . import manifest, storage

log = logging.getLogger(__name__)

DEFAULT_PART_BYTES = 2 * 1024**3
READ_BYTES = 8 * 1024 * 1024


def _gunzip_blocks(fh):
    """Yield decompressed blocks; handles multi-member gzip files."""
    decomp = zlib.decompressobj(wbits=zlib.MAX_WBITS | 16)
    while True:
        raw = fh.read(READ_BYTES)
        if not raw:
            break
        while raw:
            block = decomp.decompress(raw)
            if block:
                yield block
            if decomp.eof:
                raw = decomp.unused_data
                decomp = zlib.decompressobj(wbits=zlib.MAX_WBITS | 16)
            else:
                raw = b""
    tail = decomp.flush()
    if tail:
        yield tail


def split_stream(blocks, part_bytes: int, open_part):
    """Write blocks to parts of at most ``part_bytes``, cutting only after a newline.

    A single line longer than ``part_bytes`` gets a part of its own. ``open_part(index)``
    returns a writable binary file. Returns (parts, rows).
    """
    state = {"index": 0, "written": 0, "rows": 0, "out": None}

    def write(data: bytes) -> None:
        if state["out"] is None:
            state["out"] = open_part(state["index"])
        state["out"].write(data)
        state["written"] += len(data)
        state["rows"] += data.count(b"\n")

    def close() -> None:
        if state["out"] is not None:
            state["out"].close()
            state["out"], state["written"] = None, 0
            state["index"] += 1

    def write_lines(lines: bytes) -> None:
        """``lines`` holds whole lines only."""
        while lines:
            room = part_bytes - state["written"]
            if len(lines) <= room:
                write(lines)
                return
            cut = lines.rfind(b"\n", 0, room) + 1 if room > 0 else 0
            if cut == 0:
                if state["written"] > 0:
                    close()  # the next line does not fit here; it may fit in a fresh part
                    continue
                cut = lines.find(b"\n") + 1  # one line longer than a part
            write(lines[:cut])
            lines = lines[cut:]
            close()

    carry = b""  # the unfinished last line of the previous block
    for block in blocks:
        data = carry + block
        last = data.rfind(b"\n")
        if last < 0:
            carry = data
            continue
        carry = data[last + 1:]
        write_lines(data[:last + 1])
    if carry:  # the file did not end with a newline
        if state["written"] and state["written"] + len(carry) > part_bytes:
            close()
        write(carry)
        state["rows"] += 1
    close()
    return state["index"], state["rows"]


def run(*, dump_date: str, file: str, lake: str, part_bytes: int = DEFAULT_PART_BYTES) -> tuple[int, int]:
    name = f"ol_dump_{file}_{dump_date}.txt.gz"
    src = storage.join(lake, "raw", f"dump_date={dump_date}", name)
    dest_dir = storage.join(lake, "bronze", f"dump_date={dump_date}", file)

    def open_part(i: int):
        return storage.open_write(storage.join(dest_dir, f"part-{i:05d}.tsv"), content_type="text/tab-separated-values")

    with storage.open_read(src) as fh:
        parts, rows = split_stream(_gunzip_blocks(fh), part_bytes, open_part)
    log.info("chunked %s into %d parts, %d rows", name, parts, rows)

    sources = manifest.load_sources(lake, dump_date)
    for s in sources:
        if s.name == name:
            s.rows = rows
    if sources:
        manifest.save_sources(lake, dump_date, sources)
    return parts, rows
