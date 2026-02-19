---
description: How to deploy sales-intelligence (backend to Cloud Run, frontend to Vercel)
---

# Deployment Workflow for Sales-Intelligence

## Critical Rules (DO NOT VIOLATE)

1. **NEVER use `--set-env-vars`** in cloudbuild.yaml or gcloud commands — it **WIPES ALL existing env vars**. Always use `--update-env-vars` instead.
2. **NEVER hardcode secrets** in cloudbuild.yaml or any committed file — GitHub Push Protection will block it. Use Cloud Build substitution variables (prefixed with `_`) instead.
3. **Shell escaping**: When using gcloud CLI with values containing `!`, `$`, or other special chars, use a YAML env vars file (`--env-vars-file`) instead of inline values.
4. **New frontend env vars** (e.g. `NEXT_PUBLIC_*`) must be added to **Vercel project settings** manually — they are NOT auto-deployed from `.env.local`.
5. **Always verify** the new revision is healthy before moving on. Check Cloud Run console or use `gcloud run revisions describe`.

## Backend Deployment (Cloud Run via Cloud Build)

### Adding New Backend Environment Variables

1. Add the variable to `backend/.env` for local development
2. Add it to Cloud Build trigger as a **substitution variable** (must start with `_`):
   - Go to: Cloud Build → Triggers → Edit trigger
   - Add: `_MY_NEW_VAR` = `actual_value`
3. Reference it in `cloudbuild.yaml` deploy step:
   ```yaml
   - '--update-env-vars=MY_NEW_VAR=${_MY_NEW_VAR}'
   ```
   **⚠️ Use `--update-env-vars` NOT `--set-env-vars`**
4. Commit and push to trigger deployment

### Emergency: Restoring Cloud Run Env Vars

If env vars get wiped, restore from a working revision:

```bash
# 1. Get env vars from working revision
gcloud run revisions describe <REVISION_NAME> --region=asia-south1 \
  --project=mystical-melody-486113-p0 --format='yaml(spec.containers[0].env)'

# 2. Create a YAML file with all env vars (avoids shell escaping issues)
# Format: KEY: "value"

# 3. Apply using env-vars-file (avoids shell special char issues)
gcloud run services update sales-intelligence --region=asia-south1 \
  --project=mystical-melody-486113-p0 --env-vars-file=env.yaml
```

### Current Cloud Run Env Vars (12 total)

| Variable | Purpose |
|----------|---------|
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | Supabase public key |
| SUPABASE_SERVICE_KEY | Supabase admin key |
| GCS_PROJECT_ID | Google Cloud project |
| GCS_BUCKET_UPLOADS | Audio uploads bucket |
| GCS_BUCKET_TRAINING | Training library bucket |
| GCS_BUCKET_TEMP | Temp files bucket |
| VERTEX_PROJECT | Vertex AI project |
| VERTEX_LOCATION | Vertex AI region (us-central1) |
| VERTEX_MODEL | AI model (gemini-2.5-pro) |
| HCAPTCHA_SECRET_KEY | hCaptcha server verification |
| TOTP_ENCRYPTION_KEY | AES-256-GCM key for TOTP secrets |

## Frontend Deployment (Vercel)

### Adding New Frontend Environment Variables

1. Add to `client/.env.local` for local development
2. Go to Vercel → Project Settings → Environment Variables
3. Add the variable for Production/Preview/Development
4. **Redeploy** the frontend (env vars don't apply until next deploy)

### Current Vercel Env Vars

| Variable | Purpose |
|----------|---------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase public key |
| NEXT_PUBLIC_API_URL | Backend API URL (Cloud Run) |
| NEXT_PUBLIC_HCAPTCHA_SITE_KEY | hCaptcha widget site key |

## Commit & Push Checklist

// turbo-all
1. Run `cd /Users/john/Desktop/projects/AI\ analytics\ for\ real\ Estate/sales-intelligence && git add -A && git status`
2. Review staged changes, then commit: `git commit -m "descriptive message"`
3. `git pull --rebase origin main` (repo is configured for rebase)
4. `git push origin main`
5. Monitor Cloud Build: https://console.cloud.google.com/cloud-build/builds?project=mystical-melody-486113-p0
6. Verify Cloud Run revision is healthy in console
