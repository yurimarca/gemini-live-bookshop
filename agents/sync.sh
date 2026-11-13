#!/usr/bin/env bash
# Copy the specialists into the scaffolded agents-cli project. Local files only: no cloud calls.
# Run after `agents-cli scaffold create bookshop-specialists ...` and again whenever
# backend/app/specialists/core changes.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$HERE/bookshop-specialists"
CORE="$HERE/../backend/app/specialists/core"

[[ -d "$PROJECT/app" ]] || { echo "Scaffold the project first: $PROJECT/app not found." >&2; exit 1; }

rm -rf "$PROJECT/app/core"
cp -R "$CORE" "$PROJECT/app/core"
find "$PROJECT/app/core" -name "__pycache__" -type d -prune -exec rm -rf {} +
cp "$HERE/overlay/app/agent.py" "$PROJECT/app/agent.py"
mkdir -p "$PROJECT/tests/eval"
cp "$HERE/overlay/tests/eval/"* "$PROJECT/tests/eval/"
echo "Synced specialists into $PROJECT. Review 'git status' before deploying."
