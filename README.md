# CodeTruth OS — V3 Cognition OS

Institutional-grade project cognition platform. **V3** adds live re-analysis schedules, Cognition OS activity feeds, institutional portfolio and compliance dashboards (SOC2 / ISO27001 / NIST CSF + custom policies), auditor exports, and workspace-level SSE — on top of V2.1 Tree-sitter parsing, spatial diff overlays, and portfolio navigator.

**Upload or push → pipeline (L1–L6) → scorecard + findings + roadmap → collaborate → sign & export**

## Quick start

### JSON storage (zero dependencies)

```bash
npm install
npm run build
npm test
npm run dev
```

Open **http://localhost:4310/** for the web console.

```bash
npm run demo        # V2 demo script
node scripts/v3-demo.mjs   # V3 institutional portfolio + compliance demo
```

### PostgreSQL storage (recommended)

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:push
npm run build
npm run dev
```

### Async analysis (Redis queue)

```bash
# Add REDIS_URL=redis://localhost:6379 to .env (requires Docker Desktop running)
npm run infra:up
npm run build
npm run dev:async          # terminal 1 — API
npm run dev:worker         # terminal 2 — worker
```

Without Redis, analyses run **inline** (API falls back automatically if Redis is unreachable).

### Enable all integrations (one command)

```bash
npm run setup:env          # writes .env + github-app.pem + secrets
# Edit .env: set LLM_API_KEY and GITHUB_APP_ID (from GitHub App settings)
npm run verify:integrations
npm run dev:full           # Docker Redis + API + worker + live SSE
```

| Integration | `.env` keys | What it enables |
|-------------|-------------|-----------------|
| **Redis queue + SSE** | `REDIS_URL=redis://localhost:6379` | Async worker, BullMQ jobs, Redis pub/sub streaming |
| **Multi-LLM council** | `LLM_API_KEY` (+ optional per-model overrides) | Adversarial 3-phase Truth Council via OpenAI-compatible API |
| **GitHub App** | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_APP_WEBHOOK_SECRET` | Installation tokens, app webhooks, auto-link on `installation` events |
| **PostgreSQL** | `DATABASE_URL=postgresql://...` | Durable storage for workspaces, compliance, cognition activity |

Without `LLM_API_KEY`, the council falls back to heuristic mode (with `llmFallbackReason` surfaced in the UI when LLM was configured but failed). Without Redis running, analyses run inline and SSE polls the store.

### Multi-LLM Truth Council models

```bash
LLM_API_KEY=sk-...
# OpenAI
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# Kimi Code API (sk-kimi-* keys)
LLM_BASE_URL=https://api.kimi.com/coding/v1
LLM_MODEL=kimi-for-coding

# Kimi Open Platform
LLM_BASE_URL=https://api.moonshot.ai/v1
LLM_MODEL=kimi-k2.5

# Per-model overrides (adversarial multi-LLM council):
LLM_MODEL_ARCHITECTURE_MODEL=gpt-4o-mini
LLM_MODEL_RUNTIME_MODEL=gpt-4o
LLM_MODEL_DEVOPS_MODEL=gpt-4o-mini
LLM_MODEL_SECURITY_MODEL=gpt-4o-mini
LLM_MODEL_PLANNING_MODEL=gpt-4o-mini
LLM_MODEL_CONSENSUS=gpt-4o
```

### GitHub App registration

1. Create a GitHub App at https://github.com/settings/apps/new
2. Generate a private key and save as `github-app.pem` (or set `GITHUB_APP_PRIVATE_KEY_PATH`)
3. Set webhook URL to `{PUBLIC_API_URL}/webhooks/github` with secret from `.env`
4. Subscribe to **Push** and **Installation** events
5. Set `GITHUB_APP_ID` in `.env` and connect repos in the web UI (App mode + installation ID)

For local dev, expose the API with ngrok or similar and set `PUBLIC_API_URL` to the tunnel URL.

## V3 capabilities (new)

| Area | Delivered |
|------|-----------|
| **Cognition OS** | Live re-analysis schedules (6h–30d), manual re-analyze, activity feed |
| **Institutional portfolio** | Workspace rollup with compliance scores, drift alerts, trend series |
| **Institutional compliance** | SOC2, ISO27001, NIST CSF scorecards + violation mapping |
| **Custom policies** | Workspace-defined controls evaluated as a `custom` framework |
| **Auditor exports** | Compliance CSV + auditor JSON report |
| **Workspace SSE** | `GET /workspaces/:id/cognition/stream` — live activity events |
| **Spatial timeline** | Scrub prior analyses for a project in the 3D navigator |
| **Tree-sitter C#/Ruby** | Native AST parsing with heuristic fallback |

## V2.1 capabilities

| Area | Delivered |
|------|-----------|
| **Tree-sitter AST** | Native AST parsing for Go, Rust, Java, C#, Ruby |
| **Spatial diff overlays** | Changed nodes highlighted in 3D on incremental runs |
| **Portfolio navigator** | Workspace portfolio grid + merged 3D view |

## V2 / V1.1 / V1 (retained)

Spatial Navigator, snapshot diff, expanded language parsers, multi-LLM Truth Council, SSE pipeline streaming, GitHub App auth, collaboration workflow, report signing, task exports, RBAC workspaces.

## Web console

1. Sign in with email
2. Create workspace + project
3. Upload zip **or** connect GitHub (PAT or GitHub App + installation ID)
4. Watch live SSE progress, AST/LLM badges, and snapshot diff (incremental runs)
5. Review **Institutional Portfolio**, **Compliance**, and **Cognition OS** panels
6. Export compliance CSV/JSON, add custom policies, attest frameworks
7. Scrub the spatial timeline across prior analyses
8. Submit report for approval → owner/admin signs
9. Export tasks to backlog formats

## API (V3 additions)

| Endpoint | Auth | Description |
|---|---|---|
| `GET /workspaces/:id/portfolio` | Bearer | Institutional portfolio rollup |
| `GET /workspaces/:id/portfolio/spatial` | Bearer | Merged 3D portfolio graph |
| `GET /workspaces/:id/compliance` | Bearer | Compliance posture + drift |
| `GET /workspaces/:id/compliance/export?format=csv\|json` | Bearer | Auditor CSV or JSON report |
| `GET /workspaces/:id/compliance/policies` | Bearer | List custom policies |
| `POST /workspaces/:id/compliance/policies` | Bearer (`report:approve`) | Create custom policy |
| `PUT /workspaces/:id/compliance/policies/:policyId` | Bearer | Update custom policy |
| `DELETE /workspaces/:id/compliance/policies/:policyId` | Bearer | Delete custom policy |
| `POST /workspaces/:id/compliance/attest` | Bearer | Record framework attestation |
| `GET /workspaces/:id/cognition/portfolio` | Bearer | Full institutional view |
| `GET /workspaces/:id/cognition/activity` | Bearer | Cognition activity history |
| `GET /workspaces/:id/cognition/stream` | Bearer / `?access_token=` | SSE activity stream |
| `GET /workspaces/:id/cognition/schedules` | Bearer | Re-analysis schedules |
| `PUT /workspaces/:id/cognition/schedules/:projectId` | Bearer | Enable/configure schedule |
| `POST /workspaces/:id/cognition/reanalyze/:projectId` | Bearer | Trigger live re-analysis |
| `GET /workspaces/:id/projects/:projectId/timeline` | Bearer | Analysis history for spatial scrubber |

See prior V1/V2 endpoints in git history; core analysis, collaboration, and export routes are unchanged.

## Planning docs

The `CodeTruth/` folder contains the original work model, architecture synthesis, and product thesis documents that informed V3.

## Architecture

```
apps/api              REST API + web UI + webhooks + SSE + V3 cognition/compliance routes
apps/worker           BullMQ analysis worker + periodic re-analysis scheduler
packages/cognition    Institutional portfolio builder, schedules, activity events
packages/compliance   Framework controls, evaluation, CSV/auditor exports
packages/parsing      Babel + Tree-sitter (Go/Rust/Java/C#/Ruby) + Python heuristic
packages/pipeline     L1–L6 orchestrator (analyzer v3.0.0)
packages/truth-council  LLM or heuristic 3-phase deliberation + fallback reason
packages/storage      Postgres or JSON + V3 entities (schedules, attestations, policies)
```

## Testing

```bash
npm test
```

Covers: parsers, snapshot diff, compliance evaluation + exports, cognition scheduler + institutional view, GitHub App JWT, LLM client, heuristic council.

## Repository

```bash
git clone https://github.com/criscolon37/CodeTruth-OS.git
cd CodeTruth-OS
npm install && npm run build && npm test
```

## Security notes

- Never commit `.env`, `github-app.pem`, or `.data/` (all gitignored)
- Rotate API keys if they were exposed in chat or logs
- Change `REPORT_SIGNING_SECRET` in production