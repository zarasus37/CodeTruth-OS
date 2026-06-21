# Phase E — Enterprise & Services (month 4+)

## Deliverables

| # | Item | Implementation |
|---|------|----------------|
| 17 | SSO (Entra/Okta) + data residency | OIDC routes, workspace `settings`, Enterprise billing gates |
| 18 | Sovereign Services playbook | Due diligence engagements + `playbook.md` export from Truth Reports |
| 19 | Marketplace analyzers | DeFi, Solidity, agents registry — Phase 4 revenue, pipeline integration |

## 17 — Enterprise SSO & data residency

**Env (deployment-level IdP):**

```env
ENTRA_TENANT_ID=<tenant-guid>
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=

OKTA_ISSUER=https://your-org.okta.com/oauth2/default
OKTA_CLIENT_ID=
OKTA_CLIENT_SECRET=

DEFAULT_DATA_RESIDENCY=us
```

**Auth routes:**

- `GET /auth/entra` · `GET /auth/entra/callback`
- `GET /auth/okta` · `GET /auth/okta/callback`
- `GET /auth/providers` includes `entra` and `okta` readiness flags

**Workspace enterprise API** (Enterprise plan, `workspace:manage`):

- `GET /workspaces/:id/enterprise` — settings + residency options
- `PUT /workspaces/:id/enterprise` — `{ dataResidency, sso: { enabled, provider, allowedEmailDomains } }`
- `GET /workspaces/:id/sso/login-url` — workspace-scoped SSO redirect

**Data residency regions:** `us` · `eu` · `apac` · `sovereign`

## 18 — Sovereign Services (due diligence)

**Endpoints** (Enterprise `sovereign_services` feature):

- `GET /workspaces/:id/due-diligence` — list engagements + stage enum
- `POST /workspaces/:id/due-diligence` — create engagement
- `PATCH /workspaces/:id/due-diligence/:engagementId` — update stage/notes
- `GET /workspaces/:id/due-diligence/:engagementId/playbook.md` — markdown export

Playbook includes executive summary, risk register, contradiction register, marketplace outputs, and blueprint Phase 3 deliverables checklist.

**Stages:** `intake` → `technical_review` → `risk_assessment` → `report_draft` → `client_delivery` → `closed`

## 19 — Marketplace analyzers (Phase 4 revenue)

**Catalog** (`GET /marketplace/analyzers`):

| ID | Category | Description |
|----|----------|-------------|
| `solidity-audit` | solidity | Reentrancy, tx.origin, delegatecall patterns |
| `defi-risk` | defi | Oracle, admin keys, pause, upgradeable proxies |
| `agent-safety` | agents | Tool exec, eval, prompt boundary risks |

**Workspace enablement** (Enterprise `marketplace_analyzers`):

- `GET /workspaces/:id/marketplace`
- `PUT /workspaces/:id/marketplace` — `{ enabledAnalyzerIds: [...] }`

Enabled analyzers run during pipeline evaluation and merge supplemental findings into `artifacts.marketplaceResults`.

## Billing gates

Enterprise plan adds: `sso`, `data_residency`, `marketplace_analyzers`, `sovereign_services`.

## Packages

- `@codetruth/marketplace` — registry + analyzers
- `@codetruth/sovereign` — playbook generator + residency default