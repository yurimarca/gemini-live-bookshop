"""Build the committed 30-book fixture from the public Open Library API.

One search and one work lookup per title, one second apart. Run rarely:
    uv run python scripts/build_fixture.py > ../fixtures/catalog-fixture.json
The output is the final ``CatalogBook`` schema, so the gateway and the frontend
can be built before the real pipeline has run.
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from olpipe.models import CatalogBook, fictional_price_cents  # noqa: E402

DATASET_VERSION = "ol-fixture-r1"
FIELDS = ("key,title,author_name,author_key,cover_i,first_publish_year,subject,language,ratings_average,"
          "ratings_count,want_to_read_count,currently_reading_count,already_read_count,isbn")

# (search title, display author, search by author too, segments, Portuguese title or None, category)
TITLES = [
    ("Pride and Prejudice", "Jane Austen", True, ["famous"], "Orgulho e Preconceito", "Romance"),
    ("Nineteen Eighty-Four", "George Orwell", True, ["famous"], "1984", "Science Fiction"),
    ("To Kill a Mockingbird", "Harper Lee", True, ["famous"], None, "Classics"),
    ("The Great Gatsby", "F. Scott Fitzgerald", True, ["famous"], "O Grande Gatsby", "Classics"),
    ("Jane Eyre", "Charlotte Brontë", True, ["famous"], None, "Romance"),
    ("Frankenstein", "Mary Shelley", True, ["famous"], None, "Horror"),
    ("Dracula", "Bram Stoker", True, ["famous"], "Drácula", "Horror"),
    ("Moby Dick", "Herman Melville", True, ["famous"], None, "Adventure"),
    ("Crime and Punishment", "Fyodor Dostoevsky", False, ["famous"], "Crime e Castigo", "Classics"),
    ("The Hobbit", "J. R. R. Tolkien", True, ["famous"], "O Hobbit", "Fantasy"),
    ("Fahrenheit 451", "Ray Bradbury", True, ["famous"], None, "Science Fiction"),
    ("Le Petit Prince", "Antoine de Saint-Exupéry", True, ["famous"], "O Pequeno Príncipe", "Children"),
    ("Cien años de soledad", "Gabriel García Márquez", True, ["famous"], "Cem Anos de Solidão", "Fiction"),
    ("Don Quixote", "Miguel de Cervantes", False, ["famous"], "Dom Quixote", "Classics"),
    ("The Picture of Dorian Gray", "Oscar Wilde", True, ["famous"], "O Retrato de Dorian Gray", "Classics"),
    ("Wuthering Heights", "Emily Brontë", True, ["famous"], "O Morro dos Ventos Uivantes", "Romance"),
    ("Alice's Adventures in Wonderland", "Lewis Carroll", True, ["famous"], "Alice no País das Maravilhas", "Children"),
    ("The Odyssey", "Homer", False, ["famous"], "Odisseia", "Poetry"),
    ("Dom Casmurro", "Machado de Assis", True, ["brazilian_author", "portuguese_language"], "Dom Casmurro", "Brazilian Literature"),
    ("Memórias Póstumas de Brás Cubas", "Machado de Assis", True, ["brazilian_author", "portuguese_language"], "Memórias Póstumas de Brás Cubas", "Brazilian Literature"),
    ("O Alquimista", "Paulo Coelho", True, ["famous", "brazilian_author", "portuguese_language"], "O Alquimista", "Brazilian Literature"),
    ("Capitães da Areia", "Jorge Amado", True, ["brazilian_author", "portuguese_language"], "Capitães da Areia", "Brazilian Literature"),
    ("Gabriela, cravo e canela", "Jorge Amado", True, ["brazilian_author", "portuguese_language"], "Gabriela, Cravo e Canela", "Brazilian Literature"),
    ("A hora da estrela", "Clarice Lispector", True, ["brazilian_author", "portuguese_language"], "A Hora da Estrela", "Brazilian Literature"),
    ("Grande sertão", "Guimarães Rosa", True, ["brazilian_author", "portuguese_language"], "Grande Sertão: Veredas", "Brazilian Literature"),
    ("Vidas secas", "Graciliano Ramos", True, ["brazilian_author", "portuguese_language"], "Vidas Secas", "Brazilian Literature"),
    ("Ensaio sobre a cegueira", "José Saramago", True, ["portuguese_language"], "Ensaio sobre a Cegueira", "Portuguese Literature"),
    ("Os Lusíadas", "Luís de Camões", True, ["portuguese_language"], "Os Lusíadas", "Portuguese Literature"),
    ("Livro do desassossego", "Fernando Pessoa", True, ["portuguese_language"], "Livro do Desassossego", "Portuguese Literature"),
    ("Os Maias", "Eça de Queirós", True, ["portuguese_language"], "Os Maias", "Portuguese Literature"),
]


def clean_subjects(subjects: list[str]) -> list[str]:
    out, seen = [], set()
    for s in subjects:
        s = s.strip()
        key = s.lower()
        if not s or len(s) > 40 or ":" in s or "=" in s or key in seen or any(ch.isdigit() for ch in s):
            continue
        seen.add(key)
        out.append(s)
        if len(out) == 12:
            break
    return out


def description_of(work: dict) -> str | None:
    desc = work.get("description")
    if isinstance(desc, dict):
        desc = desc.get("value")
    if not isinstance(desc, str):
        return None
    # Open Library descriptions often carry a trailing source block; keep the prose.
    for marker in ("\r\n----------", "\n----------", "([source]", "[Source]", "Also contained in:"):
        desc = desc.split(marker)[0]
    return desc.strip() or None


def main() -> None:
    books = []
    # `--merge <existing.json>` keeps the books already built and only looks up the missing titles.
    if len(sys.argv) == 3 and sys.argv[1] == "--merge":
        books = json.loads(Path(sys.argv[2]).read_text())["books"]  # a previous raw run, see --raw
    have = {b["_query"] for b in books}
    with httpx.Client(headers={"User-Agent": "olpipe-fixture/0.1"}, timeout=30, follow_redirects=True) as client:
        for title, author, by_author, segments, title_pt, category in TITLES:
            if title in have:
                continue
            resp = client.get("https://openlibrary.org/search.json",
                              params=({"title": title, "author": author} if by_author else {"q": title})
                              | {"fields": FIELDS, "limit": 5})
            resp.raise_for_status()
            docs = [d for d in resp.json().get("docs", []) if d.get("cover_i") and d.get("author_key")]
            if not docs:
                print(f"no match: {title}", file=sys.stderr)
                continue
            doc = max(docs, key=lambda d: d.get("already_read_count", 0) + d.get("want_to_read_count", 0))
            olid = doc["key"].rsplit("/", 1)[-1]
            time.sleep(1)
            work = client.get(f"https://openlibrary.org/works/{olid}.json").json()
            time.sleep(1)
            subjects = clean_subjects(doc.get("subject", []))
            want, reading, read = (doc.get("want_to_read_count", 0), doc.get("currently_reading_count", 0),
                                   doc.get("already_read_count", 0))
            langs = [lang for lang in ("eng", "por", "spa", "fre") if lang in doc.get("language", [])]
            desc = description_of(work)
            isbn13 = next((i for i in doc.get("isbn", []) if len(i) == 13), None)
            books.append({
                "id": olid, "work_key": doc["key"],
                # A loose search can return the original-script title; show the search title instead.
                "title": doc["title"] if by_author else title, "title_pt": title_pt,
                "_query": title,
                "authors": [{"id": doc["author_key"][0], "name": author}], "author_names": [author],
                "description": desc, "description_source": "work" if desc else None,
                "subjects": subjects, "category": category,
                "cover_id": doc["cover_i"], "first_publish_year": doc.get("first_publish_year"),
                "languages": langs, "primary_language": "por" if "portuguese_language" in segments else "eng",
                "segments": segments,
                "edition": {"isbn_13": isbn13, "language": "por" if "portuguese_language" in segments else "eng"},
                "price_cents": fictional_price_cents(doc["key"]), "price_is_fictional": True,
                "rating": ({"average": round(doc["ratings_average"], 2), "count": doc["ratings_count"]}
                           if doc.get("ratings_count") else None),
                "popularity": {"score": round(math.log10(1 + want + 2 * reading + 3 * read), 4), "rank": 1,
                               "want_to_read": want, "currently_reading": reading, "already_read": read},
                "book_url": f"https://openlibrary.org{doc['key']}",
                "dataset_version": DATASET_VERSION,
                "source": {"dump_date": "fixture", "revision": "r1", "license": "CC0"},
            })
            print(f"ok: {doc['title']} ({olid})", file=sys.stderr)
    if "--raw" in sys.argv:  # keep the lookup key so a later --merge run can skip finished titles
        json.dump({"books": books}, sys.stdout, ensure_ascii=False)
        return
    books.sort(key=lambda b: -b["popularity"]["score"])
    for rank, book in enumerate(books, start=1):
        book["popularity"]["rank"] = rank
    validated = [CatalogBook.model_validate({k: v for k, v in b.items() if k != "_query"}).model_dump(mode="json")
                 for b in books]
    validated.sort(key=lambda b: b["id"])
    json.dump({"dataset_version": DATASET_VERSION, "count": len(validated), "license": "CC0-1.0",
               "books": validated}, sys.stdout, ensure_ascii=False, indent=1, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
