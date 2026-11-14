"""Title and description cleaning, in Python, mirroring ``dataform/includes/cfg.js``.

BigQuery runs the SQL versions (``cfg.cleanTitle`` and ``cfg.cleanDescription``). These exist so
the rules can be tested on exported rows without the cloud. The regular expressions are the same
strings; keep them in step (``tests/test_cleaning.py`` checks that every pattern here appears in
``cfg.js``).
"""

from __future__ import annotations

import re

# Descriptions. Applied in this order.
DESC_CUT = r"(?s)(\n\s*-{3,}|\(\[source\]|See also|\n\s*Contains:).*$"   # source notes and appendices
DESC_LINK = r"\[([^\]]+)\]\([^)]*\)"                                       # [text](url) -> text
DESC_EMPHASIS = r"\*\*|__"
DESC_REFERENCE = r"\[\d+\]"
DESC_URL = r"https?://\S+"
DESC_EMPTY_PARENS = r"\(\s*\)"
DESC_SPACES = r"[ \t]+"

# Titles.
TITLE_BRACKET_NOTE = r"\s*\[[^\]]*\]\s*$"                                  # "... [12 stories]"
TITLE_PRICE = r"\s*-?\s*\((?:EURO|EUR|USD|US\$|R\$)\s*[\d.,]+\)"           # "... -(EURO 11.47)"
TITLE_EDITION_NOTE = r"\s*\((?:[A-Za-z]+ [Ee]dition|Em Portugu\S* do Brasil)\)|\s*-?\s*Edi\S* Luxo"  # "(Portuguese Edition)"
NON_LATIN_TITLE_SCRIPTS = ("Cyrillic", "Greek", "Han", "Hiragana", "Katakana", "Hangul", "Arabic", "Hebrew",
                           "Devanagari", "Thai")
ALL_CAPS_MIN_CHARS = 20

# Python has no \p{Script}; these ranges cover the same scripts for the titles we see.
_NON_LATIN = re.compile(
    "[Ͱ-Ͽἀ-῿Ѐ-ԯ֐-׿؀-ۿऀ-ॿ฀-๿"
    "぀-ヿ㐀-䶿一-鿿가-힯]")


def clean_description(text: str | None, min_chars: int = 40) -> str | None:
    if text is None:
        return None
    d = re.sub(DESC_CUT, "", text)
    d = re.sub(DESC_LINK, r"\1", d)
    d = re.sub(DESC_EMPHASIS, "", d)
    d = re.sub(DESC_REFERENCE, "", d)
    d = re.sub(DESC_URL, "", d)
    d = re.sub(DESC_EMPTY_PARENS, "", d)
    d = re.sub(DESC_SPACES, " ", d).strip()
    return d if len(d) >= min_chars else None


def _initcap(t: str) -> str:
    # BigQuery INITCAP(t, ' -'): first letter of each word upper, the rest lower.
    return re.sub(r"[^ \-]+", lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(), t)


def clean_title(title: str) -> str:
    t = re.sub(TITLE_BRACKET_NOTE, "", title)
    t = re.sub(TITLE_PRICE, "", t)
    t = re.sub(TITLE_EDITION_NOTE, "", t).strip()
    if t == t.upper() and len(t) > ALL_CAPS_MIN_CHARS:
        t = _initcap(t)
    return t


def is_non_latin(title: str) -> bool:
    return bool(_NON_LATIN.search(title))
