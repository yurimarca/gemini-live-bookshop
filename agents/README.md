# Specialists on Agent Runtime (optional)

The taste profiler and the recommender run inside the gateway by default (`SPECIALISTS_BACKEND=local`). This folder packages the same code for Agent Runtime, so the move is a configuration change and can be undone by flipping the variable back.

Do this only after spike 4 shows acceptable cold starts and no idle billing.

| Path | What it is |
|---|---|
| `overlay/app/agent.py` | The deployment's root agent: a deterministic router in front of the two specialists |
| `overlay/tests/eval/recommender.evalset.json` | Six recommender cases on the fixture catalog, in ADK's eval-set format |
| `overlay/tests/eval/eval_config.json` | Rubrics: only real candidates, dislikes respected, right language, injection ignored |
| `sync.sh` | Copies `backend/app/specialists/core` and the overlay into the scaffolded project |

The specialist code has one home, `backend/app/specialists/core`. It imports nothing from the gateway, and `sync.sh` copies it, so both hosts run the same prompts, schemas and fallbacks.

The scaffolded project (`agents/bookshop-specialists/`) is created by `agents-cli` on the owner's machine. Its `deployment_metadata.json` holds a project ID and is git-ignored.
