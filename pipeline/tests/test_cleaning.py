from pathlib import Path

import pytest

from olpipe import categories, cleaning

CFG = (Path(__file__).resolve().parents[1] / "dataform" / "includes" / "cfg.js").read_text(encoding="utf-8")


@pytest.mark.parametrize("pattern", [
    cleaning.DESC_CUT, cleaning.DESC_LINK, cleaning.DESC_EMPHASIS, cleaning.DESC_REFERENCE, cleaning.DESC_URL,
    cleaning.DESC_EMPTY_PARENS, cleaning.DESC_SPACES, cleaning.TITLE_BRACKET_NOTE, cleaning.TITLE_PRICE, cleaning.TITLE_EDITION_NOTE,
    categories.BRAZILIAN_SUBJECT, categories.CLASSICS_SUBJECT,
])
def test_sql_uses_the_same_patterns(pattern):
    assert f"String.raw`{pattern}`" in CFG


def test_sql_uses_the_same_scripts():
    assert all(f'"{s}"' in CFG for s in cleaning.NON_LATIN_TITLE_SCRIPTS)


def test_description_cleaning():
    raw = ("**Dom Casmurro** is a [novel](https://en.wikipedia.org/wiki/Dom_Casmurro) by Machado de Assis[1], "
           "told by Bento Santiago. See https://example.org for more.\n----------\nContains:\n- Part one")
    assert cleaning.clean_description(raw) == ("Dom Casmurro is a novel by Machado de Assis, told by Bento Santiago. "
                                               "See for more.")
    assert cleaning.clean_description("([source][1])") is None
    assert cleaning.clean_description("Short.") is None
    assert cleaning.clean_description(None) is None


@pytest.mark.parametrize(("title", "expected"), [
    ("The Adventures of Sherlock Holmes [12 stories]", "The Adventures of Sherlock Holmes"),
    ("PERTO DO CORAÇÃO SELVAGEM -(EURO 11.47)", "Perto Do Coração Selvagem"),
    ("IT", "IT"),
    ("Varias historias (Portuguese edition)", "Varias historias"),
    ("Menino Maluquinho, O (Portuguese Edition)", "Menino Maluquinho, O"),
    ("Reinações de Narizinho Edição Luxo", "Reinações de Narizinho"),
    ("Bom-dia, Todas as Cores! (Em Portuguese do Brasil)", "Bom-dia, Todas as Cores!"),
    ("Dom Casmurro", "Dom Casmurro"),
])
def test_title_cleaning(title, expected):
    assert cleaning.clean_title(title) == expected


def test_non_latin():
    assert cleaning.is_non_latin("Анна Каренина") and cleaning.is_non_latin("人間失格")
    assert not cleaning.is_non_latin("Memórias póstumas de Brás Cubas")
