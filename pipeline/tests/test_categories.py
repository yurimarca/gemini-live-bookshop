"""The genre rule table, run on the hand-checked gold set with each work's full subject list.

The subjects in ``fixtures/category_gold_subjects.json`` come from ``ol_staging.stg_works`` for the r1
catalog (Open Library data, CC0). BigQuery applies the same table in ``catalog_books.sqlx``.
"""

import csv
import json
import re
from pathlib import Path

import pytest

from olpipe import categories, selection

SEEDS = Path(__file__).resolve().parents[1] / "seeds"
SUBJECTS = Path(__file__).resolve().parent / "fixtures" / "category_gold_subjects.json"


@pytest.fixture(scope="module")
def rules():
    return categories.load_rules(SEEDS / "category_rules.csv")


@pytest.fixture(scope="module")
def gold():
    return list(csv.DictReader((SEEDS / "category_gold.csv").open(encoding="utf-8")))


def test_gold_set_meets_the_assertion_threshold(rules, gold):
    subjects = json.loads(SUBJECTS.read_text(encoding="utf-8"))
    limit = selection.load(SEEDS / "selection.yaml")["limits"]["min_gold_share"]
    misses = [(g["title"], g["expected"], categories.classify(subjects[g["work_id"]], rules))
              for g in gold if categories.classify(subjects[g["work_id"]], rules) not in g["expected"].split("|")]
    assert 1 - len(misses) / len(gold) >= limit, misses


def test_gold_expectations_name_real_genres(rules, gold):
    known = set(categories.genres(rules))
    assert {e for g in gold for e in g["expected"].split("|")} <= known


def test_main_genres_exist(rules):
    main = selection.load(SEEDS / "selection.yaml")["main_genres"]
    assert set(main) <= set(categories.genres(rules))


def test_patterns_are_re2_safe(rules):
    # RE2 has no lookaround and no backreferences; Python would accept both silently.
    for r in rules:
        assert not re.search(r"\(\?[=!<]|\\[1-9]", r.pattern.pattern), r.rule_id


def test_nationality_is_not_a_genre(rules):
    assert not any("brazil" in g.lower() or "portug" in g.lower() for g in categories.genres(rules))


@pytest.mark.parametrize(("subjects", "expected"), [
    (["Fiction", "Fantasy fiction", "Wizards", "Juvenile fiction"], "Fantasy"),
    (["Self-help techniques", "Habits", "Success", "Nonfiction"], "Self-Help"),
    (["History and criticism", "Romance brasileiro"], "Fiction"),      # Portuguese "romance" is a novel
    (["Business", "Investments", "Fiction"], "Fiction"),               # non-fiction genres need a non-fiction book
    ([], "Fiction"),
    (["Nonfiction"], "Nonfiction"),
])
def test_examples(rules, subjects, expected):
    assert categories.classify(subjects, rules) == expected


def test_collections():
    assert categories.collections(["Brazilian fiction"], is_brazilian_author=False) == ["brazilian"]
    assert categories.collections(["Fiction classics"], is_brazilian_author=True) == ["brazilian", "classics"]
    assert categories.collections(["Brazil", "History"], is_brazilian_author=False) == []
