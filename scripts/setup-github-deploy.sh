#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy the backend to Cloud Run without any stored key.
# Run in Cloud Shell:  bash scripts/setup-github-deploy.sh
# Creates a deploy-only service account and a Workload Identity Federation link that trusts
# only pushes to main of assettreehomes/sales-intelligence. Safe to run again.
set -euo pipefail
P=mystical-melody-486113-p0
N=123251903795
R=assettreehomes/sales-intelligence
SA=gha-deployer@$P.iam.gserviceaccount.com

gcloud config set project "$P" -q
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com

gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 \
  || gcloud iam service-accounts create gha-deployer --display-name="GitHub Actions backend deploy"

# Submit Cloud Build jobs (the build itself deploys to Cloud Run, as with a manual deploy)
for r in roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$SA" --role="$r" --condition=None -q >/dev/null
done
# Upload the source to the Cloud Build bucket only
gcloud storage buckets add-iam-policy-binding "gs://${P}_cloudbuild" --member="serviceAccount:$SA" --role=roles/storage.admin >/dev/null
# Run builds as the project's Cloud Build service account
BSA=$(gcloud builds get-default-service-account --format='value(serviceAccountEmail)' | sed 's#.*/##')
echo "Cloud Build runs as: $BSA"
gcloud iam service-accounts add-iam-policy-binding "$BSA" --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser -q >/dev/null

# Keyless trust: GitHub's token for this repository's main branch only
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
       --issuer-uri=https://token.actions.githubusercontent.com \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
       --attribute-condition="assertion.repository=='$R' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/attribute.repository/$R" -q >/dev/null

echo "ALL_DONE"
echo "workload_identity_provider: projects/$N/locations/global/workloadIdentityPools/github/providers/github"
echo "service_account: $SA"
