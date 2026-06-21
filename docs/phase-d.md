# Phase D — Team Tier Unlocks (weeks 8–12)

## Deliverables

| # | Item | Implementation |
|---|------|----------------|
| 14 | CI/CD quality gate | `GET /workspaces/:id/quality-gate` (422 on fail) + composite GitHub Action |
| 15 | Seat management | Team checkout bills 5 seats; `POST /billing/seats` updates Stripe quantity |
| 16 | GitHub App production | `GET /integrations/github-app` readiness + install URL; `PUBLIC_API_URL` required |

## 14 — Quality gate (Team+)

**Endpoints** (Bearer API token):

- `GET /workspaces/:workspaceId/quality-gate?projectId=...`
- `GET /workspaces/:workspaceId/quality-gate?owner=...&repo=...`
- `GET /workspaces/:workspaceId/projects/:projectId/quality-gate`
- `PUT /workspaces/:workspaceId/projects/:projectId/quality-gate/policy`

**Responses:**

- `200` — gate passed
- `422` — blocking findings (CI should fail)
- `404` — no completed analysis

**GitHub Action** (monorepo or copy `action.yml`):

```yaml
- uses: ./.github/actions/quality-gate
  with:
    api-url: ${{ secrets.CODETRUTH_API_URL }}
    api-token: ${{ secrets.CODETRUTH_API_TOKEN }}
    workspace-id: ${{ secrets.CODETRUTH_WORKSPACE_ID }}
    owner: ${{ github.repository_owner }}
    repo: ${{ github.event.repository.name }}
```

Default blocking severities: `Critical blocker`, `High-risk flaw`. Accepted/deferred findings are excluded.

## 15 — Seat billing

| Plan | Included | Additional |
|------|----------|------------|
| Team | 5 seats | $49/seat/mo via Stripe quantity |

- Team Stripe checkout quantity = 5 (included seats)
- `GET /workspaces/:id/seats` — usage summary
- `POST /workspaces/:id/billing/seats` — `{ "targetSeatCount": 8 }` updates Stripe + local `seatCount`
- Invites blocked at seat limit with HTTP 402 → upgrade/add seats

## 16 — GitHub App production

**Required env (API service):**

```env
GITHUB_APP_ID=<numeric app id>
GITHUB_APP_PRIVATE_KEY_PATH=./github-app.pem
GITHUB_APP_WEBHOOK_SECRET=<secret>
GITHUB_APP_SLUG=<app-slug>
PUBLIC_API_URL=https://api.yourdomain.com
```

**Webhook URL:** `{PUBLIC_API_URL}/webhooks/github`

**Verify:** `GET /integrations/github-app` → `productionReady: true`

**Install:** `GET /integrations/github-app/install-url` (authenticated) or GitHub → Install App.

Run `npm run verify:integrations` after configuring `.env`.