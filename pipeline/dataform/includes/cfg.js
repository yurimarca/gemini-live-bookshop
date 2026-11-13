// Typed access to the workflow vars. Every value arrives as a string.
const v = dataform.projectConfig.vars;
const num = (key) => {
  const n = Number(v[key]);
  if (Number.isNaN(n)) throw new Error(`var ${key} is not a number: ${v[key]}`);
  return n;
};

module.exports = {
  dumpDate: v.dump_date,
  revision: v.revision,
  datasetVersion: v.dataset_version,
  useEditions: v.use_editions === "true",
  num,
  // Lowercase substrings, as a SQL array literal.
  excludedSubjects: "[" + v.excluded_subjects.split("|").map((s) => `'${s.replace(/'/g, "")}'`).join(", ") + "]",
  // Strip accents and punctuation so "Memórias Póstumas" and "memorias postumas" compare equal.
  fold: (expr) =>
    `REGEXP_REPLACE(REGEXP_REPLACE(NORMALIZE(LOWER(${expr}), NFD), r'\\pM', ''), r'[^a-z0-9]+', ' ')`,
  olid: (expr, suffix) => `REGEXP_EXTRACT(${expr}, r'OL\\d+${suffix}')`,
  // Same formula as olpipe.models.fictional_price_cents: $7.90 to $39.90 from a hash of the work key.
  priceCents: (keyExpr) =>
    `790 + MOD(CAST(CONCAT('0x', TO_HEX(SUBSTR(SHA256(${keyExpr}), 1, 4))) AS INT64), 33) * 100`,
};
