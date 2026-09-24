#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/gcp.deploy.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${GCP_PROJECT_ID:-}" || "$GCP_PROJECT_ID" == "your-gcp-project-id" ]]; then
  echo "Set GCP_PROJECT_ID in gcp.deploy.env before deploying."
  exit 1
fi

REGION="${GCP_REGION:-us-central1}"
SERVICE="${GCP_SERVICE:-cellar-pulse}"
REPOSITORY="${GCP_REPOSITORY:-cellar-pulse}"
IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPOSITORY}/app:latest"

echo "Project:  $GCP_PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE"
echo "Image:    $IMAGE"
echo

gcloud config set project "$GCP_PROJECT_ID"

gcloud builds submit --tag "$IMAGE" "$ROOT"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080
