#!/usr/bin/env bash
# Cloud foundation for the catalog pipeline. Every block changes cloud resources.
# Run ONE block at a time and read it first:
#     pipeline/infra/setup.sh apis
#     pipeline/infra/setup.sh service-account
#     pipeline/infra/setup.sh buckets
#     pipeline/infra/setup.sh datasets
#     pipeline/infra/setup.sh iam
#     pipeline/infra/setup.sh job
#     pipeline/infra/setup.sh workflow
# Values come from pipeline/.env (git-ignored). Nothing here is run by Claude.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$HERE")"
# shellcheck disable=SC1091
set -a; source "$PIPELINE_DIR/.env"; set +a
: "${PROJECT_ID:?}" "${REGION:?}" "${LAKE_BUCKET:?}" "${CATALOG_BUCKET:?}"

SA="bookshop-pipeline@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="bookshop-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

case "${1:-}" in
  apis)
    gcloud services enable bigquery.googleapis.com workflows.googleapis.com \
      artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com \
      --project="$PROJECT_ID"
    ;;
  service-account)
    gcloud iam service-accounts create bookshop-pipeline \
      --display-name="Bookshop catalog pipeline" --project="$PROJECT_ID"
    ;;
  buckets)
    gcloud storage buckets create "gs://$LAKE_BUCKET" "gs://$CATALOG_BUCKET" --project="$PROJECT_ID" \
      --location="$REGION" --uniform-bucket-level-access --public-access-prevention
    gcloud storage buckets update "gs://$LAKE_BUCKET" --lifecycle-file="$HERE/lake-lifecycle.json"
    ;;
  datasets)
    # ol_raw expires after 7 days so about 100 GiB of raw JSON does not sit in storage.
    bq --location="$REGION" mk --dataset --default_table_expiration=604800 "$PROJECT_ID:ol_raw"
    bq --location="$REGION" mk --dataset "$PROJECT_ID:ol_staging"
    bq --location="$REGION" mk --dataset "$PROJECT_ID:ol_marts"
    bq --location="$REGION" mk --dataset "$PROJECT_ID:ol_ops"
    ;;
  iam)
    for ROLE in bigquery.jobUser bigquery.dataEditor datastore.user run.developer \
                run.jobsExecutorWithOverrides logging.logWriter workflows.invoker; do
      gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA" --role="roles/$ROLE" --condition=None
    done
    # The workflow runs the job as this same account.
    gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT_ID" \
      --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser
    gcloud storage buckets add-iam-policy-binding "gs://$LAKE_BUCKET" \
      --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
    gcloud storage buckets add-iam-policy-binding "gs://$CATALOG_BUCKET" \
      --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
    # The gateway only reads the published index.
    gcloud storage buckets add-iam-policy-binding "gs://$CATALOG_BUCKET" \
      --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectViewer
    ;;
  job)
    gcloud run jobs deploy catalog-pipeline --source="$PIPELINE_DIR" --region="$REGION" --project="$PROJECT_ID" \
      --service-account="$SA" --cpu=2 --memory=2Gi --task-timeout=7200 --max-retries=1 \
      --set-env-vars="LAKE_BUCKET=$LAKE_BUCKET,CATALOG_BUCKET=$CATALOG_BUCKET,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,REGION=$REGION"
    ;;
  workflow)
    gcloud workflows deploy catalog-pipeline --source="$PIPELINE_DIR/workflows/catalog.yaml" \
      --location="$REGION" --service-account="$SA" --project="$PROJECT_ID" \
      --set-env-vars="LAKE_BUCKET=$LAKE_BUCKET,JOB_NAME=catalog-pipeline"
    ;;
  *)
    echo "usage: $0 {apis|service-account|buckets|datasets|iam|job|workflow}" >&2
    exit 2
    ;;
esac
