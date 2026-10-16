#!/bin/bash
# Retired. This script used `gcloud run deploy --set-env-vars` with the local
# .env, which REPLACES every variable set in the Cloud Run console (HCAPTCHA,
# TOTP key, mail and alert settings...) with whatever is in that file.
#
# Rebuild and deploy the backend from the repository root instead; variables set
# in the console are kept:
#
#   gcloud builds submit --config cloudbuild.yaml
#
# Change a single variable without touching the others:
#
#   gcloud run services update sales-intelligence --region asia-south1 \
#     --update-env-vars KEY=value
echo "deploy.sh is retired: run 'gcloud builds submit --config cloudbuild.yaml' from the repository root." >&2
exit 1
