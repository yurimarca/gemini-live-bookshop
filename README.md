# Gemini Live Bookshop

A voice bookshop demo. You talk to a shopping assistant to find books, hear about them and fill a cart, while background agents profile your taste and pick recommendations without making the voice wait. The page shows what every agent is doing as it works.

It is an open-source demo for developers, built around three technologies:

- **Gemini Live API** with `gemini-3.8-live`, for real-time voice.
- **Google Agent Development Kit (ADK) 2.x**, for the voice agent and its non-blocking tools.
- **A2UI v1.0**, for the cards the background agents put on screen.

**Nothing is for sale.** Every price is fictional and there is no checkout. The site does not ask for a name, an email or an address.

## Status

Finished demo (November 2026). The page runs on Firebase Hosting and the gateway on Cloud Run, with a catalog of 1,407 Open Library books (209 by Brazilian authors) published by the pipeline (`ol-2026-10-31-r2`). The voice agent, the three specialists and the cart-expiry timer on Cloud Tasks all run against the real models. The specialists run on Agent Runtime as their own deployment, with the in-process path as the fallback. See [Known limits](#known-limits).

| Part | What it is | Local checks |
|---|---|---|
| [`backend/`](backend/) | FastAPI gateway: catalog and cart REST, the live voice WebSocket, the cart-timer callback | `uv run pytest` |
| [`frontend/`](frontend/) | React page: catalog, conversation dock, agent canvas, "agents at work" timeline, English and Portuguese | `npm test`, `npm run build` |
| [`pipeline/`](pipeline/README.md) | Open Library dumps to the published catalog: Cloud Run job, BigQuery, Dataform, Cloud Workflows | `uv run pytest`, `make compile` |
| [`agents/`](agents/README.md) | The specialists packaged for Agent Runtime (optional) | covered by the backend tests |
| [`spikes/`](spikes/README.md) | Small scripts that answer one open question each | need a cloud project |

## How it works

```
                     Firebase Hosting (static React build)
                        |  /api/** rewrite
Browser ----------------+---------------------------> Cloud Run "bookshop-gateway" (FastAPI)
   |                                                    |- REST: catalog, book detail, cart
   '-- WSS direct to run.app (ID token in 1st frame) -->|- /ws/live: ADK run_live --> Gemini Live
                                                        |- fast tools (BLOCKING): in-memory index, Firestore cart
                                                        |- specialist tools (NON_BLOCKING): recommender, taste profiler,
                                                        |  researcher (in-process, or on Agent Runtime)
                                                        '- /internal/tasks/cart-expiry <--OIDC-- Cloud Tasks

Open Library dump --> Cloud Run job --> Cloud Storage --> BigQuery + Dataform --> Cloud Run job
   (pinned date)      fetch, chunk                        parse, rank, select      publish
                                                                                     |
                                        Firestore books/{OLID} and meta/catalog  <---+
                                        Cloud Storage catalog-index.json.gz      <---'
```

- **The voice never waits.** Recommendation and taste tools are declared `NON_BLOCKING`. The recommender's answer is scheduled `WHEN_IDLE`, so the model speaks about it at a natural pause; taste notes are `SILENT`.
- **Tool calls are gated on the server.** An allowlist and per-argument validators run before any tool body. The voice model can be steered by what a visitor says, so its arguments are never trusted.
- **Cards come from the specialists, never from the voice model.** The gateway builds every A2UI envelope from validated output, and the page renders only a fixed catalog of components.
- **Each session has its own event bus.** One visitor's tool events can never reach another visitor's socket.
- **Cost controls.** A session lasts five minutes at most; there is a per-user daily quota and a global daily cap; nothing connects until the microphone is clicked.

More detail, with the agents table: [`docs/architecture.md`](docs/architecture.md).

## Run it locally

You need Python 3.12 with [uv](https://docs.astral.sh/uv/) and Node.js 20+. No cloud project is needed to browse the catalog and use the cart.

```bash
# Terminal 1: the gateway on the committed fixture, in-memory state, dev sign-in
cd backend
cp .env.example .env
uv sync
uv run uvicorn main:app --port 8000

# Terminal 2: the page
cd frontend
npm install
npm run dev          # http://localhost:5173
```

To talk to the assistant, the gateway also needs Gemini Live: set `GOOGLE_CLOUD_PROJECT` in `backend/.env` and sign in with `gcloud auth application-default login`. Live audio is billed by the minute.

Tests:

```bash
cd backend && uv run pytest
cd pipeline && uv run pytest && make compile
cd frontend && npm test && npm run build
cd tests/firestore-rules && npm install && npm test   # deny-all rules on the emulator (needs Java)
```

## Configuration

Every environment value comes from an environment variable or a git-ignored `.env` file. The committed `.env.example` files hold placeholders only. Never commit project IDs, service-account emails, Firebase web config, credentials or raw data dumps.

On Cloud Run the gateway refuses to start with development settings (dev sign-in, in-memory state, a localhost origin).

## Data

- The catalog comes from the [Open Library](https://openlibrary.org) data dumps, which are dedicated to the public domain (CC0). Credit and thanks to the Open Library project.
- Cover images are linked from `covers.openlibrary.org` by cover ID, not bundled, as its terms ask.
- **Prices are fake.** Open Library has no prices, so each one is derived from a hash of the book's identifier. They are for demonstration only.

## Run it yourself on Google Cloud

Use a project of your own and set a billing budget with alerts first. A budget alert does not cap spend: the session limit and the daily caps are the real controls. Keep project IDs, URLs and service-account emails in shell variables or git-ignored `.env` files, never in a commit.

```bash
export PROJECT_ID=<project> REGION=us-central1
export RUNTIME_SA=bookshop-runtime@$PROJECT_ID.iam.gserviceaccount.com
export BUILD_SA=bookshop-build@$PROJECT_ID.iam.gserviceaccount.com
```

The order matters: the gateway will not start until a catalog is published.

1. **Firestore.** Create a native database in `$REGION`, deploy `firestore.rules` (deny-all: only the gateway, through the Admin SDK, reads or writes), and add a TTL on `profiles.expires_at`.
2. **Catalog.** Follow [`pipeline/README.md`](pipeline/README.md): `pipeline/infra/setup.sh` creates the APIs, the pipeline service account, buckets, datasets, IAM and the Cloud Run job; then run fetch, chunk, seeds, the BigQuery loads, the Dataform transform, the export and publish. Publish writes `books/*`, the search index, and flips `meta/catalog` last.
3. **Gateway.** Create `bookshop-runtime` with `roles/aiplatform.user`, `roles/datastore.user` and `roles/cloudtasks.enqueuer`, and `bookshop-build` with `roles/run.builder`. Create the `cart-expiry` Cloud Tasks queue. Then, from the repository root:

   ```bash
   gcloud run deploy bookshop-gateway --source backend --region $REGION --project $PROJECT_ID \
     --service-account $RUNTIME_SA --build-service-account projects/$PROJECT_ID/serviceAccounts/$BUILD_SA \
     --allow-unauthenticated --min-instances 0 --max-instances 2 --concurrency 10 --cpu 1 --memory 1Gi \
     --timeout 600 --session-affinity \
     --set-env-vars "^|^GOOGLE_GENAI_USE_VERTEXAI=TRUE|GOOGLE_CLOUD_PROJECT=$PROJECT_ID|GOOGLE_CLOUD_LOCATION=$REGION|ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=false|CATALOG_SOURCE=cloud|STATE_BACKEND=firestore|AUTH_MODE=firebase|TASKS_BACKEND=cloud_tasks|TASKS_QUEUE=cart-expiry|TASKS_SERVICE_ACCOUNT=$RUNTIME_SA|SPECIALISTS_BACKEND=local|SPECIALISTS_LLM=on|ALLOWED_ORIGINS=https://$PROJECT_ID.web.app,https://$PROJECT_ID.firebaseapp.com|PUBLIC_BASE_URL=https://placeholder.invalid"
   ```

   Then set `PUBLIC_BASE_URL` to the service URL (`gcloud run services update ... --update-env-vars PUBLIC_BASE_URL=<gateway-url>`) and check `<gateway-url>/api/health`. `^|^` makes `|` the separator, because `ALLOWED_ORIGINS` has a comma. **Every later change uses `--update-env-vars`:** `--set-env-vars` replaces all variables and silently resets `ALLOWED_ORIGINS` and `PUBLIC_BASE_URL`.
4. **Page.** Add Firebase to the project, create a web app, turn on the Anonymous sign-in provider, and restrict the browser API key to your Hosting origins (keep the Identity Toolkit and Token Service APIs allowed). Put the web config and `VITE_GATEWAY_WS_URL=wss://<gateway host>/ws/live` in `frontend/.env.production.local` (see `frontend/.env.example`), then `npm ci && npm run build` and `firebase deploy --only hosting --project $PROJECT_ID`. Try a preview channel first if you like; add its origin to `ALLOWED_ORIGINS` while you test, and remove it after. Never run `firebase use`: it writes the project ID to `.firebaserc`.
5. **Optional: the specialists on Agent Runtime.** See [`agents/README.md`](agents/README.md): scaffold with `agents-cli`, run `agents/sync.sh`, evaluate locally, deploy with `--no-agent-identity --min-instances 0 --max-instances 1` as a `bookshop-specialists` service account with `roles/aiplatform.user`, then point the gateway at it with `--update-env-vars SPECIALISTS_BACKEND=agent_runtime,SPECIALISTS_AGENT_RESOURCE=<resource name>,SPECIALIST_TIMEOUT_SECONDS=20`. Flip `SPECIALISTS_BACKEND` back to `local` to undo.

On Cloud Run the gateway refuses to start with development settings (dev sign-in, in-memory state, a localhost origin).

## Known limits

- **Agent Runtime cold start.** With min-instances 0 the first specialist call after idle took about 13 s (warm calls 4 to 7 s), which is why the timeout is 20 s. Any failure falls back to the in-process specialists, and the timeline row says so.
- **App Check is off.** It is coded (`APP_CHECK_REQUIRED`, `VITE_RECAPTCHA_SITE_KEY`) but not enabled: it loads Google's reCAPTCHA script for every visitor and would need a privacy note. Abuse is bounded instead by anonymous sign-in, the `Origin` allowlist, five-minute sessions, the per-user and global daily caps, and max 2 Cloud Run instances.
- **No editions or Wikidata yet (pipeline r3 not done).** Books have no language data (the language filter is hidden), only 34% have a first-publication year, and a few titles are in their original language rather than English.
- **Genre quality.** Comics (13) and Religion (9) have fewer than 15 books; Fiction outside the Brazilian collection is 12.1%, against a 12% target. Five descriptions still carry a URL or Markdown headings.
- **The Dataform transform runs from a workstation**, not inside the pipeline's Cloud Run job, where the Dataform CLI fails right after compiling. The one-command workflow therefore stops at the transform.
- **Prices are fictional** and there is no checkout.
- **No reconnect.** If the socket drops, the voice session ends and the visitor starts a new one.
- **The root `.gitignore` is not in the repository.** Copy the rules you need (at least `.env`, `.env.*`, `node_modules/`, `.firebaserc`, `deployment_metadata.json`) before you add credentials to a clone.

## License

Apache License 2.0. See [LICENSE](LICENSE).
