# Specialists on Agent Runtime (optional)

The recommender, taste profiler and researcher run inside the gateway by default (`SPECIALISTS_BACKEND=local`). This folder packages the same code as one Agent Runtime deployment, so the move is a configuration change and can be undone by flipping the variable back. Any failed or unusable remote answer falls back to the in-process path.

| Path | What it is |
|---|---|
| `overlay/app/agent.py` | The deployment's root agent (a deterministic router in front of the three specialists) and the ADK `App` the scaffold's server imports |
| `overlay/tests/eval/datasets/recommender.json` | Six recommender cases on the fixture catalog |
| `overlay/tests/eval/eval_config.yaml` | Two metrics: `only_candidates` (deterministic) and `recommender_rubrics` (LLM judge: real candidates, dislikes, language, relevance, injection) |
| `sync.sh` | Copies `backend/app/specialists/core`, the overlay and the eval set into the scaffolded project, and sets the specialists' keys in its `.env` |

The specialist code has one home, `backend/app/specialists/core`. It imports nothing from the gateway, so both hosts run the same prompts, schemas and fallbacks.

## Steps

The scaffolded project, `agents/bookshop-specialists/`, is generated and not committed: its `.env` and `deployment_metadata.json` hold project IDs. Tested with agents-cli 1.14.0.

```bash
export AGENTS_CLI_TELEMETRY=0
agents-cli scaffold create bookshop-specialists --agent adk --deployment-target agent_runtime --prototype \
  --region us-central1 --agent-guidance-filename CLAUDE.md --agent-runtime-identity-default service_account \
  --skip-checks -y -o agents
agents/sync.sh
cd agents/bookshop-specialists && agents-cli install
agents-cli eval run --dataset tests/eval/datasets/recommender.json --config tests/eval/eval_config.yaml
```

Then, with a `bookshop-specialists` service account that has `roles/aiplatform.user` (and `roles/logging.logWriter` for its logs):

```bash
agents-cli deploy --dry-run --project $PROJECT_ID --region us-central1 --no-agent-identity \
  --service-account bookshop-specialists@$PROJECT_ID.iam.gserviceaccount.com \
  --min-instances 0 --max-instances 1 --cpu 1 --memory 2Gi \
  --update-env-vars GOOGLE_GENAI_USE_VERTEXAI=TRUE,SPECIALIST_MODEL=gemini-3.5-flash,SPECIALIST_LOCATION=global
# the same without --dry-run deploys and writes the resource name to deployment_metadata.json
```

- `--no-agent-identity` matters: with Agent Identity on, agents-cli grants several project roles.
- `SPECIALIST_LOCATION=global`: `gemini-3.5-flash` returns 404 in us-central1.
- Do not run `agents-cli infra`, `publish gemini` or `scaffold enhance`.

Measure it from `backend/` with the gateway's own client (no fallback, so a failure shows):

```bash
GOOGLE_CLOUD_LOCATION=us-central1 SPECIALISTS_AGENT_RESOURCE=<resource name> uv run python ../spikes/spike4_agent_runtime.py --calls 5
```

Then point the gateway at it, with `--update-env-vars` only:

```bash
gcloud run services update bookshop-gateway --region us-central1 --project $PROJECT_ID \
  --update-env-vars SPECIALISTS_BACKEND=agent_runtime,SPECIALISTS_AGENT_RESOURCE=<resource name>,SPECIALIST_TIMEOUT_SECONDS=20
```

The gateway's runtime account needs `roles/aiplatform.user`, which it already has for Gemini Live. Each specialist row on the timeline ends in `agent_runtime` when the answer came from the deployment, and `gateway` when it fell back.

The request is the reasoning-engine contract, `POST https://us-central1-aiplatform.googleapis.com/v1/<resource name>:streamQuery?alt=sse` with `{"class_method": "async_stream_query", "input": {"user_id": "gateway", "message": "<JSON envelope>"}}`. The response is one JSON ADK event per line. A recorded response is in `backend/tests/fixtures/`.
