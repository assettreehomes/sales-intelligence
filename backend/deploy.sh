#!/bin/bash

# Exit on error
set -e

# Configuration
SERVICE_NAME="ticketintel-backend"
REGION="us-central1"

# Check for required tools
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed."
    exit 1
fi

echo "🚀 Deploying $SERVICE_NAME to Google Cloud Run..."

# Set project context if provided
if [ -n "$GCP_PROJECT_ID" ]; then
    echo "Setting project to $GCP_PROJECT_ID..."
    gcloud config set project "$GCP_PROJECT_ID"
fi

# Parse .env file and format for gcloud (key=value,key=value)
# Ignores comments and empty lines
if [ -f .env ]; then
    echo "📦 Reading configuration from .env..."
    # Filter out PORT and NODE_ENV as they are handled by Cloud Run or build args
    ENV_VARS=$(grep -v '^#' .env | grep -v '^$' | grep -v '^PORT=' | grep -v '^NODE_ENV=' | tr '\n' ',' | sed 's/,$//')
else
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Deploy command
echo "🚀 Deploying $SERVICE_NAME to region $REGION..."
gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "$ENV_VARS"

echo "✅ Deployment successful!"
echo "Your service URL is available in the output above."
