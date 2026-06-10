#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

PROJECT_ID="${GCP_PROJECT_ID:-dashboard-plasyect}"
BILLING_ACCOUNT="${GCP_BILLING_ACCOUNT:-0161CF-D9430E-EA40FB}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-plasyect-api}"
SERVICE_ACCOUNT="plasyect-api-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 || gcloud projects create "$PROJECT_ID" --name="Plasyect Intelligence"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
BUILD_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || echo "False")"
if [[ "$BILLING_ENABLED" != "True" ]]; then
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
fi

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  logging.googleapis.com \
  documentai.googleapis.com \
  storage.googleapis.com \
  --project="$PROJECT_ID"

gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1 || \
  gcloud iam service-accounts create plasyect-api-sa --display-name="Plasyect API" --project="$PROJECT_ID"

for ROLE in roles/secretmanager.secretAccessor roles/documentai.apiUser roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="$ROLE" \
    --condition=None >/dev/null
done

if [[ -n "$PROJECT_NUMBER" ]]; then
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${BUILD_SERVICE_ACCOUNT}" \
    --role="roles/run.builder" \
    --condition=None >/dev/null
fi

require_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "Missing env: $name" >&2
    exit 1
  fi
  gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1 || \
    gcloud secrets create "$name" --replication-policy=automatic --project="$PROJECT_ID"
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" >/dev/null
}

# JWT_SECRET: si viene en el entorno se rota; si no, se reutiliza el existente.
if [[ -n "${JWT_SECRET:-}" ]]; then
  require_secret JWT_SECRET
elif ! gcloud secrets describe JWT_SECRET --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Missing env: JWT_SECRET (no existe el secreto y no se proporciono valor)" >&2
  exit 1
fi

SET_ENV_VARS="^@^NODE_ENV=production@GCP_PROJECT_ID=${PROJECT_ID}@CORS_ORIGINS=${CORS_ORIGINS:-*}"
SET_ENV_VARS="${SET_ENV_VARS}@DEFAULT_TENANT_ID=${DEFAULT_TENANT_ID:-plasyect_matriz}@BIGZAP_BATCH_LIMIT=${BIGZAP_BATCH_LIMIT:-800}@BIGZAP_ACTIVE_DAYS=${BIGZAP_ACTIVE_DAYS:-30}@PGSSL=${PGSSL:-true}"
SET_SECRETS="JWT_SECRET=JWT_SECRET:latest"

# DATABASE_URL: via preferida (Postgres directo a Supabase, mismo credential que el sync).
if [[ -n "${DATABASE_URL:-}" ]]; then
  require_secret DATABASE_URL
  SET_SECRETS="${SET_SECRETS},DATABASE_URL=DATABASE_URL:latest"
fi

if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  require_secret SUPABASE_URL
  require_secret SUPABASE_SERVICE_ROLE_KEY
  SET_SECRETS="${SET_SECRETS},SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"
fi

gcloud run deploy "$SERVICE" \
  --source=. \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --service-account="$SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --set-env-vars="$SET_ENV_VARS" \
  --set-secrets="$SET_SECRETS"
