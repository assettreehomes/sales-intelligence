# ANTIGRAVITY — Sales Audio Intelligence (TicketIntel)

AI-powered sales call analytics platform for a real estate company. Sales agents record client interactions (site visits and phone calls); Google Vertex AI analyzes the audio and produces scored reports with coaching notes, lead qualification, and cross-visit comparisons. Site visits use Gemini 2.5 Pro; presales calls use Gemini 2.5 Flash (separate env var).

## Project Structure

```
sales-intelligence/
├── backend/               # Node.js/Express API (ESM, v2.1)
│   ├── src/
│   │   ├── index.js           # Express app entry point (port 3001)
│   │   ├── config/
│   │   │   ├── supabase.js    # Supabase admin + public clients
│   │   │   └── gcs.js         # GCS bucket config + signed URLs
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT auth via Supabase
│   │   │   └── rbac.js        # Role-based access control
│   │   │   ├── routes/            # Express routers (one file per domain)
│   │   ├── services/          # Business logic
│   │   └── prompts/           # Vertex AI prompt builders
│   └── Dockerfile
├── client/                # Next.js frontend (TypeScript) — early stage
├── docs/                  # API guides (Kotlin mobile app)
├── cloudbuild.yaml        # GCP Cloud Build → Cloud Run deployment
└── CLAUDE.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js (ESM), Express 4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase JWT + TOTP (admin), hCaptcha |
| AI Analysis | Google Vertex AI — Gemini 2.5 Pro (site visits) / Gemini 2.5 Flash (presales) |
| Audio Storage | Google Cloud Storage (3 buckets) |
| Phone Calls | TeleCMI (CDR webhook + REST sync) |
| Notifications | WhatsApp Cloud API (Meta) |
| Frontend | Next.js (TypeScript), Tailwind CSS |
| Deploy | GCP Cloud Run (`asia-south1`) via Cloud Build |

## Key Concepts

### Two Analysis Flows

**1. Site Visit Flow** (field sales agents)
- Agent records in-person client visit on mobile app
- Audio uploaded to GCS `uploads` bucket via signed URL
- `triggerAnalysis()` in `tickets.js` → `analyzeAudio()` in `vertexai.js`
- Phase 1: Audio analysis (scores, key moments, objections, outcome)
- Phase 2 (if visit > 1): Text-only comparison with previous visit via `runComparisonAnalysis()`
- `visitSequencing.js` auto-determines visit number and links previous ticket by `client_id`

**2. Presales (TeleCMI) Flow** (phone pre-sales agents)
- TeleCMI sends webhook on call end → `POST /telecmi/webhook`
- CDR processed by `processCdr()`: deduplication, agent mapping, ticket creation
- Recording downloaded from TeleCMI → uploaded to GCS → deleted after analysis
- `triggerPresalesAnalysis()` in `presalesAnalysis.js` uses presales-specific prompt
- Adds `lead_qualification` (budget, timeline, purpose, appointment, lead quality)
- Adds `call_authenticity` (real/fake detection)
- Adds `mobile_number_alert` (detects if agent asked lead for mobile number — lead theft risk); sets `asked_mobile_number` boolean on ticket for fast filtering
- Re-analyze (`POST /tickets/:id/analyze`) responds 202 immediately; analysis fires async to avoid request timeout; **Phase 2 cross-visit comparison is skipped** during re-analysis (site visits only)
- No cross-visit comparison (each call is independent)
- Sell.Do CRM data reconciled via `selldo_pending_calls` table
- Two webhooks handle Sell.Do integration (see Sell.Do Integration section below)

### Database Tables (Supabase)

| Table | Purpose |
|---|---|
| `tickets` | Core entity: every sales interaction (visit or call) |
| `analysisresults` | AI output: scores, keymoments, objections, summary, etc. |
| `users` | Platform users (employee/admin/intern/superadmin) |
| `presales_employees` | Pre-sales phone agents (separate from `users`) |
| `presales_teams` | Pre-sales team org structure |
| `selldo_pending_calls` | Unmatched Sell.Do CRM events waiting for TeleCMI CDR |

Key ticket fields: `id`, `source` (manual|telecmi), `client_id`, `visitnumber`, `status`, `rating`, `createdby`, `istrainingcall`, `call_outcome`, `call_authenticity`, `asked_mobile_number`, `telecmi_*`, `selldo_*`, `presales_agent_id`, `presales_team_id`

Ticket statuses: `draft` → `uploading` → `pending` → `processing` → `analyzed` | `analysis_failed`

### RBAC Roles

| Role | Access |
|---|---|
| `superadmin` | All access, bypasses all checks |
| `admin` | Full platform access |
| `employee` | Upload audio, view own tickets only (blind mode — no scores shown) |
| `intern` | Training library read-only |

### GCS Buckets

- `sales-audio-uploads-2025` — temporary upload target; presales recordings deleted after analysis
- `sales-audio-training-library-2025` — promoted high-scoring calls (rating ≥ 8.0)
- `sales-audio-temp-2025` — scratch space

## API Routes

```
POST /auth/login              Employee/admin login (+ TOTP for admin)
GET  /tickets                 List tickets (role-filtered)
POST /tickets/upload          Multipart audio upload
GET  /analytics/employees     Per-employee performance stats (admin)
GET  /analytics/leaderboard   Ranked employee leaderboard (admin)
GET  /analytics/presales-performance  Presales team/agent analytics (admin)
GET  /presales/directory      Presales org snapshot
POST /telecmi/webhook              TeleCMI CDR webhook (no auth)
POST /telecmi/sync                 Manual CDR back-fill (admin)
POST /reports/whatsapp/send        Trigger WhatsApp daily report
GET  /training                     Training library
POST /drafts                       Create draft assignment (admin)
GET  /drafts                       List drafts (employee sees own only)
POST /excuses                      Employee submits visit delay excuse
GET  /employee/heartbeat           Online status heartbeat (30s interval)
POST /webhooks/selldo/lead         Sell.Do lead assignment → creates/reassigns draft ticket (no auth, secret header)
POST /webhooks/selldo/call         Sell.Do call enrichment → writes lead_id onto TeleCMI ticket (no auth, secret header)
GET  /admin/queue/status           Queue stats for both proQueue + flashQueue, ticket counts by status, stuck tickets
POST /admin/queue/reset            Drain/clear waiting jobs in both queues; reset stuck processing tickets → analysis_failed
PATCH /admin/queue/ticket/:id/reset  Reset a single stuck/failed ticket back to pending
```

## Analysis Schema (Vertex AI Output)

**Site visit scores (1-10):** `rapport_building`, `needs_discovery`, `objection_handling`, `closing_techniques`, `product_knowledge`, `professionalism`
**Additional scores:** `politeness` (0-100), `confidence` (0-100), `interest` (low|medium|high), `speakers` (count)

**Presales extras:** `lead_qualification` object (budget, timeline, purpose, appointment details, lead_quality: hot|warm|cold|unknown), `call_authenticity` (real|fake), `language_detected`, `mobile_number_alert` ({ detected: boolean, moment: string excerpt })

**Call outcomes:** `interested` | `not_interested` | `follow_up_required`

## Environment Variables (backend/.env)

```
SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
GCS_PROJECT_ID, GCS_BUCKET_UPLOADS, GCS_BUCKET_TRAINING, GCS_BUCKET_TEMP, GCS_SERVICE_ACCOUNT_EMAIL
VERTEX_PROJECT, VERTEX_LOCATION (us-central1), VERTEX_MODEL (gemini-2.5-pro), VERTEX_MODEL_PRESALES (gemini-2.5-flash)
VERTEX_MAX_CONCURRENT_PRO (default 1), VERTEX_MAX_RPM_PRO (default 2)
VERTEX_MAX_CONCURRENT_FLASH (default 3), VERTEX_MAX_RPM_FLASH (default 5)
VERTEX_BACKOFF_BASE_MS_PRO / VERTEX_BACKOFF_BASE_MS_FLASH (default 60000), VERTEX_MAX_RETRIES_PRO / VERTEX_MAX_RETRIES_FLASH (default 6)
TELECMI_APP_ID, TELECMI_SECRET
WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_RECIPIENT_NUMBER, WHATSAPP_TEMPLATE_NAME
SCHEDULER_SECRET
CORS_ORIGIN
PORT (default 3001)
```

## Deployment

- **Production backend:** `https://sales-intelligence-123251903795.asia-south1.run.app`
- Cloud Build (`cloudbuild.yaml`): builds Docker image → pushes to Artifact Registry → deploys to Cloud Run `asia-south1`
- Cloud Run is behind a load balancer; `trust proxy` is set on Express
- Cloud Run set to `min-instances=1` (prevents scale-to-zero killing in-flight analysis jobs) and `max-instances=1` (single instance keeps the in-memory Vertex queue coherent)
- Sensitive env vars (TOTP key, hCaptcha) are pre-set in Cloud Run — do NOT pass via cloudbuild.yaml (shell escaping issues)

## Sell.Do Integration

### Two Separate Webhooks
Do NOT confuse these — they serve different flows:

| Webhook | Purpose | Trigger |
|---|---|---|
| `POST /webhooks/selldo/lead` | Site visit lead assignment — creates/reassigns a draft ticket for a field sales employee | Lead assigned in Sell.Do CRM |
| `POST /webhooks/selldo/call` | Pre-sales call enrichment — writes `lead_id` onto a TeleCMI ticket | Call completed in Sell.Do CRM |

Both require header: `x-webhook-secret: <SELLDO_WEBHOOK_SECRET>`

### Call Enrichment — Pending Calls Race Condition

Sell.Do fires its call webhook before or after TeleCMI's CDR arrives. Two cases:

**Case 1 — TeleCMI arrives first (normal):**
```
TeleCMI CDR → ticket created → Sell.Do webhook arrives
                                → match on tickets.telecmi_call_id = call_id
                                → write lead_id + agent info directly onto ticket
                                → response: { action: "enriched" }
```

**Case 2 — Sell.Do arrives first (pending):**
```
Sell.Do webhook arrives → no ticket found yet
                        → store row in selldo_pending_calls { matched: false }
                        → response: { action: "pending_created" }

TeleCMI CDR arrives later → processCdr() creates ticket
                           → looks up selldo_pending_calls WHERE call_id = ? AND matched = false
                           → copies lead_id + agent info onto new ticket
                           → marks row: { matched: true, matched_ticket: ticket_id }
```

The reconciliation block in `processCdr()` (`telecmi.js:135–207`) is wrapped in try/catch — if it fails, ticket creation still succeeds (just without lead_id).

### Key Payload Field Rules
- `call_id` must be TeleCMI's `call_id` (= Sell.Do's `$remote_id`). **Never the CMIUID.**
- `agent_email` is the primary agent matching field — more reliable than `agent_name`
- Only send for answered/completed calls — missed/cancelled calls should not be pushed

### Current Status (as of 2026-05-23)
- `/webhooks/selldo/lead` — receiving real events from Sell.Do ✅
- `/webhooks/selldo/call` — **never received a real Sell.Do event** ❌ (Sell.Do not yet configured)
- All rows in `selldo_pending_calls` are test data; `matched: false` across the board
- TeleCMI CDRs all have `custom: "false"` — no lead_id coming from TeleCMI's Click-to-Call side either

## Development Notes

- Backend uses **ES Modules** (`import`/`export`) — all files are `.js` with ESM syntax
- Two-phase AI analysis: Phase 1 (audio → JSON) retries once with a "mandatory field repair" prompt if validation fails
- `istrainingcall` threshold differs by flow: site visits use `overall_score >= 4.0`; presales calls use `overall_score >= 8.0`
- TeleCMI webhook responds 200 immediately; all processing is async to prevent retries
- Presales recordings are **deleted from GCS** after analysis — playback goes through TeleCMI proxy using `telecmi_filename`
- WhatsApp reports support both template mode (no 24h window limit) and free-form text mode
- **`vertexQueue.js`** — factory (`createVertexQueue()`) for in-memory job queues with sliding RPM limiter and configurable concurrency
- **`queues.js`** — creates two independent queue instances: `proQueue` (Pro model, site visits, `maxConcurrent=1`, `maxRpm=2`) and `flashQueue` (Flash model, presales, `maxConcurrent=3`, `maxRpm=5`); Pro and Flash have separate Vertex AI quota pools so a slow site-visit analysis never blocks presales calls; single Cloud Run instance keeps both queues coherent
- **`autoRetry.js`** — background service (20min interval) retries `analysis_failed` tickets; blacklist approach (skips `permanent_failed`); re-downloads audio from TeleCMI before retrying (fixes GCS-deleted-on-failure bug); 1 ticket/cycle (RETRY_BATCH_SIZE=1), 20s stagger, 10 attempt cap per session; also resets tickets stuck at `processing` for >10 min back to `analysis_failed`
- **TeleCMI CDR filtering** — `MIN_DURATION_SECONDS = 20` in `telecmi.js`; calls under 20s are skipped at CDR stage (`reason: too_short`) — no ticket created, no GCS download, no Vertex quota spent; covers hangups, wrong numbers, and instant rejections
- The client (`/client`) is a Next.js app — frontend pages in `client/app/admin/` (tickets, queue, performance, presales-performance, employees, live, etc.)
