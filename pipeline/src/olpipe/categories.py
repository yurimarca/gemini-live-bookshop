"""Genre and collection rules, in Python, to test ``seeds/category_rules.csv`` without the cloud.

``int_candidates.sqlx`` applies the same table in BigQuery. Keep the two in step:

1. Lowercase and trim each subject. A subject that matches an ``_ignore`` rule is dropped.
2. A ``_fiction`` hit marks the book as fiction, unless a ``_nonfiction`` rule also hits.
3. Each kept subject adds, to every genre it matches, the highest weight among that genre's
   matching rules. Rules with ``applies=nonfiction`` count only when the book is not fiction.
   Works carry dozens of subjects, so a genre wins by being tagged often, not by being tagged once.
4. The genre with the highest total wins; a tie goes to the genre whose best rule comes first.
5. With no genre score, a book takes its Brazilian author's ``default_genre`` from
   ``seeds/brazilian_authors.csv`` when there is one (many of those works have no subjects at all).
   Otherwise it falls back to ``Nonfiction`` if a ``_nonfiction`` rule hits, else to ``Fiction``
   (most of the catalog is fiction, and works with only criticism subjects are novels).

Patterns are RE2 syntax. Python's ``re`` with ``re.ASCII`` matches them the same way for this
table (RE2's ``\\b`` is ASCII-only). Do not use lookarounds or backreferences: RE2 has neither.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path

FICTION_FALLBACK = "Fiction"
NONFICTION_FALLBACK = "Nonfiction"
SPECIAL = {"_ignore", "_fiction", "_nonfiction"}
APPLIES = {"any", "nonfiction"}

# The `brazilian` collection, by subject (the author seed is the other way in). Mirrored in SQL.
BRAZILIAN_SUBJECT = r"\bbrazilian (literature|fiction|poetry)\b|\bliteratura brasileira\b|^romance brasileiro$"
CLASSICS_SUBJECT = r"\bclassics?\b|\bcl[aá]ssicos?\b"


@dataclass(frozen=True)
class Rule:
    rule_id: int
    category: str
    applies: str
    pattern: re.Pattern[str]
    weight: int


def load_rules(path: str | Path) -> list[Rule]:
    rules = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["applies"] not in APPLIES:
                raise ValueError(f"rule {row['rule_id']}: applies must be one of {sorted(APPLIES)}")
            rules.append(Rule(int(row["rule_id"]), row["category"], row["applies"],
                              re.compile(row["pattern"], re.ASCII), int(row["weight"])))
    ids = [r.rule_id for r in rules]
    if len(ids) != len(set(ids)):
        raise ValueError("rule_id values must be unique")
    return sorted(rules, key=lambda r: r.rule_id)


def genres(rules: list[Rule]) -> list[str]:
    return sorted({r.category for r in rules if r.category not in SPECIAL} | {FICTION_FALLBACK, NONFICTION_FALLBACK})


def _kept(subjects: list[str], rules: list[Rule]) -> list[str]:
    ignore = [r.pattern for r in rules if r.category == "_ignore"]
    out = []
    for s in subjects:
        s = s.strip().lower()
        if s and not any(p.search(s) for p in ignore):
            out.append(s)
    return out


def _nonfiction_signal(kept: list[str], rules: list[Rule]) -> bool:
    return any(r.pattern.search(s) for r in rules if r.category == "_nonfiction" for s in kept)


def is_fiction(subjects: list[str], rules: list[Rule]) -> bool:
    kept = _kept(subjects, rules)
    hit = lambda cat: any(r.pattern.search(s) for r in rules if r.category == cat for s in kept)  # noqa: E731
    return hit("_fiction") and not hit("_nonfiction")


def classify(subjects: list[str], rules: list[Rule], default: str | None = None) -> str:
    kept = _kept(subjects, rules)
    fiction = is_fiction(subjects, rules)
    scores: dict[str, int] = {}
    first: dict[str, int] = {}
    active = [r for r in rules if r.category not in SPECIAL and not (r.applies == "nonfiction" and fiction)]
    for s in kept:
        best: dict[str, int] = {}
        for r in active:
            if r.pattern.search(s):
                best[r.category] = max(best.get(r.category, 0), r.weight)
                first[r.category] = min(first.get(r.category, r.rule_id), r.rule_id)
        for category, weight in best.items():
            scores[category] = scores.get(category, 0) + weight
    if not scores:
        if default:
            return default
        return NONFICTION_FALLBACK if _nonfiction_signal(kept, rules) else FICTION_FALLBACK
    return min(scores, key=lambda c: (-scores[c], first[c]))


def collections(subjects: list[str], *, is_brazilian_author: bool) -> list[str]:
    lowered = [s.strip().lower() for s in subjects]
    out = []
    if is_brazilian_author or any(re.search(BRAZILIAN_SUBJECT, s, re.ASCII) for s in lowered):
        out.append("brazilian")
    if any(re.search(CLASSICS_SUBJECT, s, re.ASCII) for s in lowered):
        out.append("classics")
    return out
