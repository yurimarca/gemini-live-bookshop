import ast
from pathlib import Path

from app.catalog.search import fold, normalize_language, tokens

BACKEND_MODELS = Path(__file__).resolve().parents[1] / "app" / "catalog" / "models.py"
PIPELINE_MODELS = Path(__file__).resolve().parents[2] / "pipeline" / "src" / "olpipe" / "models.py"


def _classes(path: Path) -> dict[str, str]:
    tree = ast.parse(path.read_text())
    return {n.name: ast.dump(n) for n in tree.body if isinstance(n, ast.ClassDef)}


def test_models_match_the_pipeline_contract():
    ours, theirs = _classes(BACKEND_MODELS), _classes(PIPELINE_MODELS)
    assert ours, "no models found"
    for name, body in ours.items():
        assert theirs[name] == body, f"{name} drifted from pipeline/src/olpipe/models.py"


def test_fixture_loads(svc):
    assert svc.catalog.dataset_version == "ol-fixture-r1"
    assert len(svc.catalog.index.entries) == 30


def test_fold_and_tokens():
    assert fold("Memórias Póstumas") == "memorias postumas"
    assert tokens("The Hobbit, or There and Back Again") == ["hobbit", "or", "there", "back", "again"]
    assert normalize_language("pt-BR") == "por" and normalize_language("English") == "eng"


def test_search_is_accent_insensitive(svc):
    hits = svc.catalog.index.search("memorias postumas bras cubas")
    assert hits[0].title.lower().startswith("memórias póstumas")


def test_search_by_author_and_prefix(svc):
    assert {e.author_names[0] for e in svc.catalog.index.search("machado de assis", limit=3)} == {"Machado de Assis"}
    assert svc.catalog.index.search("hobb")[0].title == "The Hobbit"


def test_filters_and_default_order(svc):
    index = svc.catalog.index
    top = index.search("", limit=5)
    assert [e.popularity for e in top] == sorted((e.popularity for e in top), reverse=True)
    assert all("brazilian_author" in e.segments for e in index.search("", segment="brazilian_author", limit=30))
    assert all("por" in e.languages for e in index.search("", language="pt", limit=30))
    assert any(e.category == "Poetry" for e in index.search("", subject="poetry"))
    assert index.search("zzzzqqq") == []


async def test_get_returns_full_document_and_rejects_unknown_ids(svc):
    book = await svc.catalog.get("OL27482W")
    assert book.title == "The Hobbit" and book.price_is_fictional
    assert await svc.catalog.get("OL0W") is None
