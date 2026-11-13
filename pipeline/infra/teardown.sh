#!/usr/bin/env bash
# Removes pipeline resources. DESTRUCTIVE. Run one block at a time.
#     pipeline/infra/teardown.sh raw        # raw + staging BigQuery data and the lake bucket contents
#     pipeline/infra/teardown.sh job        # the Cloud Run job and the workflow
#     pipeline/infra/teardown.sh datasets   # all four BigQuery datasets
# The catalog bucket and Firestore are left alone: the gateway serves from them.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
set -a; source "$(dirname "$HERE")/.env"; set +a
: "${PROJECT_ID:?}" "${REGION:?}" "${LAKE_BUCKET:?}"

read -r -p "This deletes '${1:-}' resources in project $PROJECT_ID. Type the project ID to continue: " CONFIRM
[[ "$CONFIRM" == "$PROJECT_ID" ]] || { echo "aborted"; exit 1; }

case "${1:-}" in
  raw)
    bq rm -r -f --dataset "$PROJECT_ID:ol_raw"
    bq --location="$REGION" mk --dataset --default_table_expiration=604800 "$PROJECT_ID:ol_raw"
    gcloud storage rm --recursive "gs://$LAKE_BUCKET/raw/**" "gs://$LAKE_BUCKET/bronze/**" || true
    ;;
  job)
    gcloud run jobs delete catalog-pipeline --region="$REGION" --project="$PROJECT_ID" --quiet
    gcloud workflows delete catalog-pipeline --location="$REGION" --project="$PROJECT_ID" --quiet || true
    ;;
  datasets)
    for DS in ol_raw ol_staging ol_marts ol_ops; do bq rm -r -f --dataset "$PROJECT_ID:$DS"; done
    ;;
  *)
    echo "usage: $0 {raw|job|datasets}" >&2
    exit 2
    ;;
esac
