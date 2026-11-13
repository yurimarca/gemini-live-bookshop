from olpipe.models import CatalogBook, dataset_version, fictional_price_cents


def test_fixture_matches_the_contract(fixture_books):
    assert len(fixture_books) == 30
    books = [CatalogBook.model_validate(b) for b in fixture_books]
    assert len({b.id for b in books}) == 30
    assert all(b.price_is_fictional and b.currency == "USD" for b in books)
    assert any("portuguese_language" in b.segments for b in books)
    assert any("brazilian_author" in b.segments for b in books)


def test_price_is_deterministic_and_in_range(fixture_books):
    for b in fixture_books:
        price = fictional_price_cents(b["work_key"])
        assert price == b["price_cents"] == fictional_price_cents(b["work_key"])
        assert 790 <= price <= 3990 and price % 100 == 90


def test_index_entry_truncates_description(fixture_books):
    entry = CatalogBook.model_validate(fixture_books[0]).to_index_entry()
    assert entry.description is None or len(entry.description) <= 280


def test_dataset_version():
    assert dataset_version("2026-10-31", "r1") == "ol-2026-10-31-r1"
