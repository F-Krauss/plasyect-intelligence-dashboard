#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-dashboard-plasyect}"
SERVICE_NAME="${SERVICE_NAME:-plasyect-ocr-service}"
REGION="${GCP_REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

DEFAULT_CORS_ORIGINS="https://plasyect.com,https://www.plasyect.com,https://t-efficiency.com"
CORS_ORIGINS="${CORS_ORIGINS:-$DEFAULT_CORS_ORIGINS}"

echo "Desplegando ${SERVICE_NAME} en ${REGION} proyecto ${PROJECT_ID}..."

echo "Habilitando APIs necesarias..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com \
  documentai.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT_ID"

echo "Construyendo imagen via Cloud Build..."
gcloud builds submit --tag "${IMAGE_NAME}" --project="${PROJECT_ID}" .

DOC_AI_PROJECT_ID="${DOCUMENT_AI_PROJECT_ID:-$PROJECT_ID}"
DOC_AI_LOCATION="${DOCUMENT_AI_LOCATION:-us}"
DOC_AI_PROCESSOR_ID="${DOCUMENT_AI_PROCESSOR_ID:-}"
DOC_AI_MIN_CONFIDENCE="${DOCUMENT_AI_MIN_CONFIDENCE:-0.75}"
VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"
OCR_TEMPLATE_MODEL="${OCR_TEMPLATE_MODEL:-gemini-2.5-flash}"
OCR_EXTRACTION_MODEL="${OCR_EXTRACTION_MODEL:-gemini-2.5-flash}"

require_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "Falta variable de entorno: $name" >&2
    exit 1
  fi
  gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1 || \
    gcloud secrets create "$name" --replication-policy=automatic --project="$PROJECT_ID"
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" >/dev/null
}

# Ensure DATABASE_URL secret exists (create/update if local env var is set)
if [[ -n "${DATABASE_URL:-}" ]]; then
  require_secret DATABASE_URL
fi

# Verify the secret exists in Secret Manager before mounting
if ! gcloud secrets describe DATABASE_URL --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Error: Secret DATABASE_URL no existe en Secret Manager. Configura DATABASE_URL y vuelve a ejecutar." >&2
  exit 1
fi

echo "Desplegando en Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --platform managed \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --ingress all \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --set-env-vars "^##^CORS_ORIGINS=${CORS_ORIGINS}##VERTEX_PROJECT_ID=${PROJECT_ID}##VERTEX_LOCATION=${VERTEX_LOCATION}##OCR_TEMPLATE_MODEL=${OCR_TEMPLATE_MODEL}##OCR_EXTRACTION_MODEL=${OCR_EXTRACTION_MODEL}##DOCUMENT_AI_PROJECT_ID=${DOC_AI_PROJECT_ID}##DOCUMENT_AI_LOCATION=${DOC_AI_LOCATION}##DOCUMENT_AI_PROCESSOR_ID=${DOC_AI_PROCESSOR_ID}##DOCUMENT_AI_MIN_CONFIDENCE=${DOC_AI_MIN_CONFIDENCE}##NODE_ENV=production" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest"

echo "Despliegue completado!"
