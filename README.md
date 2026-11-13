# Gemini Live Bookshop

A voice bookshop demo. You talk to a shopping assistant to find books, hear about them and fill a cart, while background agents profile your taste and pick recommendations without making the voice wait. The page shows what every agent is doing as it works.

It is an open-source demo for developers, built around three technologies:

- **Gemini Live API** with `gemini-3.8-live`, for real-time voice.
- **Google Agent Development Kit (ADK) 2.x**, for the voice agent and its non-blocking tools.
- **A2UI v1.0**, for the cards the background agents put on screen.

**Nothing is for sale.** Every price is fictional and there is no checkout. The site does not ask for a name, an email or an address.

## Status

The code is complete and tested locally against a 30-book fixture. It has not been deployed, and it has not yet talked to the real Live model: that needs a Google Cloud project and the spikes in [`spikes/`](spikes/README.md).

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
                                                        |- specialist tools (NON_BLOCKING): taste profiler, recommender
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
cd pipeline && uv run pytest
cd frontend && npm test
```

## Configuration

Every environment value comes from an environment variable or a git-ignored `.env` file. The committed `.env.example` files hold placeholders only. Never commit project IDs, service-account emails, Firebase web config, credentials or raw data dumps.

On Cloud Run the gateway refuses to start with development settings (dev sign-in, in-memory state, a localhost origin).

## Data

- The catalog comes from the [Open Library](https://openlibrary.org) data dumps, which are dedicated to the public domain (CC0). Credit and thanks to the Open Library project.
- Cover images are linked from `covers.openlibrary.org` by cover ID, not bundled, as its terms ask.
- **Prices are fake.** Open Library has no prices, so each one is derived from a hash of the book's identifier. They are for demonstration only.

## Running on Google Cloud

The gateway is designed for Cloud Run with a dedicated runtime service account, the page for Firebase Hosting. Set a billing budget with alerts before exposing anything publicly: a budget alert does not cap spend, so the session limit and the daily caps are the real controls.

## Notes

`docs/AI_VOICE_AGENT_ARCHITECTURE.md` describes the earlier prototype and is out of date.

## License

Apache License 2.0. See [LICENSE](LICENSE).
