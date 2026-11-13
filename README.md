# Gemini Live Bookshop

A voice-only bookshop demo. You talk to a shopping assistant to search for books, compare titles, manage a cart and check out. The app shows what the agents are doing as they work.

It is an open-source demo for developers, built around three technologies:

- **Gemini Live API** with `gemini-3.8-live`, for real-time voice.
- **Google Agent Development Kit (ADK) 2.x**, for the voice agent and background specialists.
- **A2UI v1.0**, for agent-driven UI cards such as recommendations and a checkout confirmation.

## Status

Work in progress. The project does not run yet:

- The backend imports a catalog module that is not in this repository.
- The frontend loads catalog files that are not in this repository.

Both are replaced by the catalog ingestion pipeline and the Firestore data layer, which are still to be built.

## What the demo will do

- Search and browse a curated catalog of famous titles, including Brazilian and Portuguese-language books.
- Hold a conversation about a book, with the voice agent answering immediately.
- Run background agents on your searches and cart changes, and surface recommendations at a natural pause.
- Show a live timeline of each tool call: its behavior, scheduling and latency.
- Keep the cart and orders in Firestore, so changes appear in real time.

## Data

- The catalog comes from the [Open Library](https://openlibrary.org) data dumps. The Open Library data is dedicated to the public domain (CC0). Credit and thanks to the Open Library project.
- Cover images are linked from `covers.openlibrary.org`, not bundled, as its terms ask.
- **Prices and stock are fake.** Open Library has no prices or stock, so the demo generates them deterministically. They are for demonstration only.

## Repository layout

```
backend/    Python: FastAPI, ADK agents, tools, WebSocket endpoint
frontend/   React, Vite, TypeScript, Tailwind
docs/       Architecture notes
```

## Setup

You need Python 3.11+ with [uv](https://docs.astral.sh/uv/), Node.js 20+, and a Google Cloud project with the Vertex AI API enabled.

Install the dependencies:

```bash
cd backend && uv sync
cd ../frontend && npm install
```

Backend settings are read from environment variables. The main ones are:

- `GOOGLE_CLOUD_PROJECT`: your project ID.
- `GOOGLE_GENAI_USE_VERTEXAI`: set to `TRUE` to call Gemini through Vertex AI.
- `GOOGLE_CLOUD_LOCATION`: the region, `us-central1` by default.

Put them in a local `.env` file, which git ignores. Do not commit it, and do not commit credentials, raw data dumps or build output.

The backend entry point and the frontend data files are not in the repository yet, so the app does not start. This section will be updated once the catalog pipeline is in place.

## Running on Google Cloud

The backend is designed for Cloud Run. Deploy with a dedicated runtime service account that has only the roles it needs. Set a billing budget with alerts before you expose the service publicly, because anyone who can reach a voice demo can run up its cost.

## License

Apache License 2.0. See [LICENSE](LICENSE).
