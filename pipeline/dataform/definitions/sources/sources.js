// Raw landing tables, loaded by `bq load` with the JSON column kept as a STRING.
["works", "authors", "editions", "reading_log", "ratings", "redirects", "wikidata"].forEach((name) =>
  declare({ schema: "ol_raw", name })
);

// Seed tables, loaded from pipeline/seeds/*.csv. They live in ol_staging because ol_raw expires after 7 days.
["seed_brazilian_authors", "seed_subject_category_map", "seed_overrides"].forEach((name) =>
  declare({ schema: "ol_staging", name })
);
