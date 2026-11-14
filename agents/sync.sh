#!/usr/bin/env bash
# Copy the specialists into the scaffolded agents-cli project. Local files only: no cloud calls.
# Run after `agents-cli scaffold create bookshop-specialists ...` and again whenever
# backend/app/specialists/core or the overlay changes.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$HERE/bookshop-specialists"
CORE="$HERE/../backend/app/specialists/core"

[[ -d "$PROJECT/app" ]] || { echo "Scaffold the project first: $PROJECT/app not found." >&2; exit 1; }

rm -rf "$PROJECT/app/core"
cp -R "$CORE" "$PROJECT/app/core"
find "$PROJECT/app/core" -name "__pycache__" -type d -prune -exec rm -rf {} +
cp "$HERE/overlay/app/agent.py" "$PROJECT/app/agent.py"

# Eval: the overlay's dataset, config and metrics. Old-format files from earlier syncs go.
mkdir -p "$PROJECT/tests/eval"
rm -f "$PROJECT/tests/eval/recommender.evalset.json" "$PROJECT/tests/eval/eval_config.json"
cp -R "$HERE/overlay/tests/eval/." "$PROJECT/tests/eval/"

# The deploy applies the project .env (git-ignored). Make sure the specialists' keys are set.
ENV_FILE="$PROJECT/.env"
touch "$ENV_FILE"
set_key() {
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
set_key GOOGLE_GENAI_USE_VERTEXAI TRUE
set_key SPECIALIST_MODEL gemini-3.5-flash
set_key SPECIALIST_LOCATION global
echo "Synced specialists into $PROJECT. Review 'git status' before deploying."
