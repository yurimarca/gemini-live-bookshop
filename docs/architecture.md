# Architecture

One voice agent talks to the shopper. Three specialists work in the background and never make the voice wait. The gateway owns every check and every write; the models only propose.

```
                       Firebase Hosting (static React build, /api/** rewrite)
                                   |
Browser --- REST /api ------------>|
   |                               v
   '-- WSS /ws/live -----> Cloud Run "bookshop-gateway" (FastAPI)
       (ID token in the     |- policy plugin: allowlist + argument validators before every tool
        first frame)        |- voice agent: ADK run_live --> Gemini Live (gemini-3.8-live)
                            |- fast tools (BLOCKING): in-memory catalog index, Firestore cart
                            |- specialist tools (NON_BLOCKING) --+--> local: in-process ADK agents
                            |                                    '--> agent_runtime: :streamQuery to
                            |                                         Agent Runtime "bookshop-specialists"
                            |                                         (router -> recommender | profiler | researcher)
                            |                                         falls back to local on any failure
                            '- /internal/tasks/cart-expiry <--OIDC-- Cloud Tasks (10-minute cart hold)

Firestore: books/{OLID}, meta/catalog, carts/{uid}, profiles/{uid} (30-day TTL), quota.
           Rules are deny-all; only the gateway (Admin SDK) reads or writes.
Cloud Storage: catalog-index.json.gz, loaded by the gateway at start.
Pipeline (separate): Open Library dump -> Cloud Run job -> BigQuery + Dataform -> Firestore and the index.
```

## Agents

| Agent | Model | Runs on | Called by | Behavior | What it returns |
|---|---|---|---|---|---|
| Voice assistant | `gemini-3.8-live` | Gateway (ADK `run_live`) | The shopper, by voice | 11 BLOCKING tools (search, details, cart, page control) and 3 NON_BLOCKING ones | Speech; tool calls the gateway validates |
| Recommender | `gemini-3.5-flash` on the `global` endpoint | Gateway or Agent Runtime | `recommend_books`, and the researcher | NON_BLOCKING, answer `WHEN_IDLE` | Up to 4 picks, only from the candidates the gateway sent |
| Taste profiler | same | same | `note_taste` | NON_BLOCKING, `SILENT` | A short summary; the gateway merges the tags |
| Researcher | same | same | `research_for_taste`, or the gateway itself after 3 new taste notes | NON_BLOCKING, `WHEN_IDLE` | Search angles; the recommender ranks what they find |

`SPECIALISTS_BACKEND` picks where the specialists run (`local` or `agent_runtime`). Their code has one home, `backend/app/specialists/core`, which `agents/sync.sh` copies into the Agent Runtime project, so both hosts run the same prompts and schemas. Every path ends in a deterministic heuristic, so a specialist failure never fails the voice turn. Each specialist row on the timeline says whether the answer came from the model or the heuristic, and from Agent Runtime or the gateway.

## Rules the design keeps

- Cards are built by the gateway (`backend/app/a2ui/builders.py`) from validated specialist output, never by the voice model. The page renders a fixed set of A2UI components.
- Each session has its own event bus; tools find their session through the tool context, never through module state.
- Logs and timeline summaries carry counts, IDs and enum values, never what the shopper said.
- Limits: 5-minute sessions, a per-user and a global daily session cap, 10 concurrent sessions per instance, Cloud Run max 2 instances.
