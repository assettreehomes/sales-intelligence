---
description: How to deploy sales-intelligence (backend to Cloud Run, frontend to Vercel)
---

# Deployment Workflow for Sales-Intelligence

## Critical Rules (DO NOT VIOLATE)

1. **NEVER use `--set-env-vars`** in cloudbuild.yaml or gcloud commands — it **WIPES ALL existing env vars**. Always use `--update-env-vars` instead.
2. **NEVER hardcode secrets** in cloudbuild.yaml or any committed file — GitHub Push Protection will block it.
3. **NEVER pass env vars with special characters (`!`, `$`, `#`) via `--update-env-vars` in cloudbuild.yaml** — the shell strips/mangles them. Set these directly in Cloud Run console or via `--env-vars-file` with a YAML file.
4. **HCAPTCHA_SECRET_KEY and TOTP_ENCRYPTION_KEY are set directly in Cloud Run** — they are NOT passed through cloudbuild.yaml because the `!` in the TOTP key gets shell-escaped. Do NOT add them back to cloudbuild.yaml.
5. **New frontend env vars** (e.g. `NEXT_PUBLIC_*`) must be added to **Vercel project settings** manually — they are NOT auto-deployed from `.env.local`.
6. **Always verify** the new revision is healthy before moving on. Check Cloud Run console or use `gcloud run revisions describe`.

## Backend Deployment (Cloud Run via Cloud Build)

### Adding New Backend Environment Variables

**If the value contains NO special characters (`!`, `$`, `#`, etc.):**
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

**If the value DOES contain special characters:**
1. Add to `backend/.env` for local development
2. Set it directly in Cloud Run via gcloud with a YAML file:
   ```bash
   # Create a temp YAML file (avoids all shell escaping issues)
   cat > /tmp/env-fix.yaml << 'EOF'
   MY_VAR: "value_with_special!chars"
   EOF
   # Apply — ⚠️ --env-vars-file REPLACES all vars, so include ALL vars
   # OR use --update-env-vars with delimiter trick:
   gcloud run services update sales-intelligence --region=asia-south1 \
     --project=mystical-melody-486113-p0 \
     --update-env-vars='^##^MY_VAR=value_with_special!chars'
   ```
3. Do NOT add it to cloudbuild.yaml

### Checking Current Cloud Run Env Vars

```bash
gcloud run services describe sales-intelligence --region=asia-south1 \
  --project=mystical-melody-486113-p0 \
  --format='value(spec.template.spec.containers[0].env)' | tr ';' '\n'
```

### Emergency: Restoring Cloud Run Env Vars

If env vars get wiped or corrupted, restore from a working revision:

```bash
# 1. List revisions to find a working one
gcloud run revisions list --service=sales-intelligence --region=asia-south1 \
  --project=mystical-melody-486113-p0 --limit=5

# 2. Get env vars from working revision
gcloud run revisions describe <REVISION_NAME> --region=asia-south1 \
  --project=mystical-melody-486113-p0 --format='yaml(spec.containers[0].env)'

# 3. Create a YAML file with all env vars (avoids shell escaping issues)
# Format: KEY: "value"

# 4. Apply using env-vars-file
gcloud run services update sales-intelligence --region=asia-south1 \
  --project=mystical-melody-486113-p0 --env-vars-file=env.yaml
```

### Current Cloud Run Env Vars (12 total)

| Variable | Purpose | Set via |
|----------|---------|---------|
| SUPABASE_URL | Supabase project URL | Cloud Run console |
| SUPABASE_ANON_KEY | Supabase public key | Cloud Run console |
| SUPABASE_SERVICE_KEY | Supabase admin key | Cloud Run console |
| GCS_PROJECT_ID | Google Cloud project | Cloud Run console |
| GCS_BUCKET_UPLOADS | Audio uploads bucket | Cloud Run console |
| GCS_BUCKET_TRAINING | Training library bucket | Cloud Run console |
| GCS_BUCKET_TEMP | Temp files bucket | Cloud Run console |
| VERTEX_PROJECT | Vertex AI project | Cloud Run console |
| VERTEX_LOCATION | Vertex AI region (us-central1) | Cloud Run console |
| VERTEX_MODEL | AI model (gemini-2.5-pro) | Cloud Run console |
| HCAPTCHA_SECRET_KEY | hCaptcha server verification | **Direct gcloud** (not cloudbuild) |
| TOTP_ENCRYPTION_KEY | AES-256-GCM key for TOTP secrets | **Direct gcloud** (has `!` — shell-unsafe) |

## Frontend Deployment (Vercel)

Frontend auto-deploys from GitHub push. No manual action needed unless adding new env vars.

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
