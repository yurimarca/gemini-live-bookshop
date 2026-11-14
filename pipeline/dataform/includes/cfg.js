// Typed access to the workflow vars. Every value arrives as a string.
const v = dataform.projectConfig.vars;
const num = (key) => {
  const n = Number(v[key]);
  if (Number.isNaN(n)) throw new Error(`var ${key} is not a number: ${v[key]}`);
  return n;
};

// A "|"-separated var as a SQL array of lowercase-safe string literals.
const list = (key) =>
  "[" + String(v[key] || "").split("|").filter(Boolean).map((s) => `'${s.replace(/'/g, "")}'`).join(", ") + "]";

// RE2 patterns, mirrored in src/olpipe/cleaning.py (tests/test_cleaning.py checks they match).
const re = {
  descCut: String.raw`(?s)(\n\s*-{3,}|\(\[source\]|See also|\n\s*Contains:).*$`,
  descLink: String.raw`\[([^\]]+)\]\([^)]*\)`,
  descEmphasis: String.raw`\*\*|__`,
  descReference: String.raw`\[\d+\]`,
  descUrl: String.raw`https?://\S+`,
  descEmptyParens: String.raw`\(\s*\)`,
  descSpaces: String.raw`[ \t]+`,
  titleBracketNote: String.raw`\s*\[[^\]]*\]\s*$`,
  titlePrice: String.raw`\s*-?\s*\((?:EURO|EUR|USD|US\$|R\$)\s*[\d.,]+\)`,
  titleEditionNote: String.raw`\s*\((?:[A-Za-z]+ [Ee]dition|Em Portugu\S* do Brasil)\)|\s*-?\s*Edi\S* Luxo`,
  // Collections, mirrored in src/olpipe/categories.py.
  brazilianSubject: String.raw`\bbrazilian (literature|fiction|poetry)\b|\bliteratura brasileira\b|^romance brasileiro$`,
  classicsSubject: String.raw`\bclassics?\b|\bcl[aá]ssicos?\b`,
  nonLatin: ["Cyrillic", "Greek", "Han", "Hiragana", "Katakana", "Hangul", "Arabic", "Hebrew", "Devanagari", "Thai"]
    .map((script) => String.raw`\p{${script}}`).join("|"),
};
// RE2 raw strings in SQL: r'...' cannot hold a single quote, and none of the patterns has one.
const raw = (pattern) => `r'${pattern}'`;

module.exports = {
  dumpDate: v.dump_date,
  revision: v.revision,
  datasetVersion: v.dataset_version,
  useEditions: v.use_editions === "true",
  num,
  // Lowercase substrings, as SQL array literals.
  excludedSubjects: list("excluded_subjects"),
  excludedTitlePatterns: list("excluded_title_patterns"),
  mainGenres: list("main_genres"),
  excludeNonLatinTitles: String(v.exclude_non_latin_titles).toLowerCase() === "true",
  re,
  raw,
  nonLatin: (expr) => `REGEXP_CONTAINS(${expr}, ${raw(re.nonLatin)})`,
  // Strip "[12 stories]" and price notes; title-case long all-caps titles. Mirrors olpipe.cleaning.clean_title.
  cleanTitle: (expr) => `(SELECT IF(t = UPPER(t) AND LENGTH(t) > 20, INITCAP(t, ' -'), t) FROM (SELECT TRIM(
    REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(${expr}, ${raw(re.titleBracketNote)}, ''), ${raw(re.titlePrice)}, ''),
      ${raw(re.titleEditionNote)}, '')) AS t))`,
  // Cut source notes, unwrap Markdown, drop URLs; NULL when too short. Mirrors olpipe.cleaning.clean_description.
  cleanDescription: (expr, minChars) => `(SELECT IF(LENGTH(d) < ${minChars}, NULL, d) FROM (SELECT TRIM(
    REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(${expr},
      ${raw(re.descCut)}, ''), ${raw(re.descLink)}, r'\\1'), ${raw(re.descEmphasis)}, ''), ${raw(re.descReference)}, ''),
      ${raw(re.descUrl)}, ''), ${raw(re.descEmptyParens)}, ''), ${raw(re.descSpaces)}, ' ')) AS d))`,
  // Strip accents and punctuation so "Memórias Póstumas" and "memorias postumas" compare equal.
  fold: (expr) =>
    `REGEXP_REPLACE(REGEXP_REPLACE(NORMALIZE(LOWER(${expr}), NFD), r'\\pM', ''), r'[^a-z0-9]+', ' ')`,
  olid: (expr, suffix) => `REGEXP_EXTRACT(${expr}, r'OL\\d+${suffix}')`,
  // Same formula as olpipe.models.fictional_price_cents: $7.90 to $39.90 from a hash of the work key.
  priceCents: (keyExpr) =>
    `790 + MOD(CAST(CONCAT('0x', TO_HEX(SUBSTR(SHA256(${keyExpr}), 1, 4))) AS INT64), 33) * 100`,
};
