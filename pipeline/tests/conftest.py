import json
from pathlib import Path

import pytest

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "catalog-fixture.json"


@pytest.fixture(scope="session")
def fixture_books() -> list[dict]:
    return json.loads(FIXTURE.read_text())["books"]


@pytest.fixture()
def export_dir(tmp_path, fixture_books):
    """A lake directory holding the fixture as a BigQuery-style NDJSON export, split over two files."""
    version = fixture_books[0]["dataset_version"]
    gold = tmp_path / "lake" / "gold" / version
    gold.mkdir(parents=True)
    half = len(fixture_books) // 2
    for i, rows in enumerate((fixture_books[:half], fixture_books[half:])):
        (gold / f"catalog-{i:012d}.json").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    return tmp_path
