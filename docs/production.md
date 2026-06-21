# Production Runbook

Automated checks: `npm run verify:integrations` and `GET /admin/readiness` (Bearer `ADMIN_TOKEN`).

## Deploy sequence (operator)

```bash
cp .env.example .env          # then fill secrets (see Manual checklist below)
npm run db:push               # Postgres schema (Phase E: settings, engagements)
npm run build
npm run verify:integrations
docker compose -f docker-compose.prod.yml up -d   # or your cloud deploy
```

## Admin operations (no Stripe required for Enterprise)

Assign Enterprise to a workspace:

```bash
curl -X PUT "https://api.yourdomain.com/admin/workspaces/WORKSPACE_ID/subscription" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan":"enterprise","status":"active","seatCount":25}'
```

Readiness:

```bash
curl "https://api.yourdomain.com/admin/readiness" -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Data residency

| Env | Purpose |
|-----|---------|
| `DEPLOYMENT_REGION` | Region this deployment serves (`us`/`eu`/`apac`/`sovereign`) |
| `DEFAULT_DATA_RESIDENCY` | Default for new workspace settings |
| `ENFORCE_DATA_RESIDENCY=true` | Block analyses when workspace region ≠ deployment |

Sovereign workspaces always require `DEPLOYMENT_REGION=sovereign`.

## SSO domain policy

Workspace `settings.sso`:

- `allowedEmailDomains` — restrict Entra/Okta sign-in
- `enforceDomainSso` — block GitHub/Google/dev-email for matching domains

## Closed beta (Phase B)

```env
BETA_MODE=true
BETA_ADMIN_TOKEN=...
```

Metrics: `GET /admin/beta/metrics`

---

## Manual checklist (requires human / external accounts)

These cannot be completed by code alone:

1. **Domain & TLS** — Register app domain, provision HTTPS cert, set `APP_URL` and `PUBLIC_API_URL`
2. **Stripe** — Create products/prices in Stripe Dashboard; paste price IDs into `.env`
3. **GitHub App** — Create app, webhook URL, install on org repos, real `GITHUB_APP_ID` + PEM
4. **Entra / Okta** — Register OIDC apps, redirect URIs `{APP_URL}/auth/entra/callback` and `/auth/okta/callback`
5. **LLM provider** — Production API key with quota; configure failover keys if needed
6. **Postgres + Redis** — Provision managed instances (or use `docker-compose.prod.yml` for staging)
7. **Secrets** — Generate and store `SESSION_SECRET` (32+ chars), `ADMIN_TOKEN`, `REPORT_SIGNING_SECRET`
8. **Enterprise sales** — Assign `enterprise` plan via admin API or internal ops
9. **Multi-region** — Deploy separate stacks per `DEPLOYMENT_REGION` when EU/sovereign customers onboard
10. **Phase B validation** — Run closed beta until activation/habit/survey gates pass (see `docs/phase-b.md`)