# Local targets only. Cloud commands live in infra/setup.sh and are run by the owner.
.PHONY: test fixture compile local-publish

test:
	uv run pytest -q

# Rebuild the committed 30-book fixture from the public Open Library API (60 polite requests).
fixture:
	uv run python scripts/build_fixture.py > ../fixtures/catalog-fixture.json

# Compile the Dataform project without touching BigQuery.
compile:
	npx --yes @dataform/cli@3.0.26 compile dataform

# Publish the fixture into ./out (local document store and local "buckets"). No cloud.
local-publish:
	rm -rf out && mkdir -p out/lake/gold/ol-fixture-r1
	uv run python -c "import json; [print(json.dumps(b, ensure_ascii=False)) for b in json.load(open('../fixtures/catalog-fixture.json'))['books']]" > out/lake/gold/ol-fixture-r1/catalog-000000000000.json
	uv run olpipe --lake-bucket ./out/lake --catalog-bucket ./out/catalog publish \
		--dataset-version ol-fixture-r1 --store local:out/firestore --min-books 10 --seeds-dir seeds
