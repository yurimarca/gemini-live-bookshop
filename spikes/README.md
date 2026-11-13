# Spikes

Small scripts that each answer one open question about a preview or lightly documented behavior. They are not part of the product. Record every result in the project's research notes before relying on it.

Run the Python spikes from `backend/`, so its virtualenv is used. They call Gemini Live on your own project with Application Default Credentials and cost a few cents each.

```bash
cd backend
uv run python ../spikes/spike1_async_tools.py --help
```

| Spike | Question | Gates |
|---|---|---|
| `spike1_async_tools.py` | Do NON_BLOCKING tools with WHEN_IDLE, INTERRUPT and SILENT behave as documented on `gemini-3.8-live` through ADK? Are transcripts fragments or cumulative? | Everything |
| `spike2_injection.py` | Can the gateway inject a background result: unsolicited content, a delayed tool response, an unsolicited FunctionResponse? | Spoken cart-expiry notice (`ANNOUNCE_CART_EXPIRY`) |
| `spike3_reconnect.py` | Is a pending tool response delivered after a drop and a resume? | Whether a reconnect can keep a session |
| `spike4_agent_runtime.py` | Cold and warm latency of the specialists on Agent Runtime, and idle billing | Moving the specialists off the gateway |
| `cloud_tasks/` | Does a Cloud Tasks job with OIDC reach Cloud Run after scale to zero? | The cart-hold timer |

Two spikes from the plan are already answered by tests that run with no cloud access:

- **A2UI v1.0 in React** with the pinned renderer, one custom catalog and one action: `frontend/src/a2ui/a2ui.test.tsx`.
- **ADK 2.14 live flow with NON_BLOCKING tools**, against a fake model: `backend/tests/test_adk_integration.py`. It proves the wiring, not the model's behavior, which is what spike 1 is for.
