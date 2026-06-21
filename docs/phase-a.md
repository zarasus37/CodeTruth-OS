# Phase A — SaaS Foundation

## Deliverables

| # | Item | Implementation |
|---|------|----------------|
| 1 | OAuth sign-in | GitHub + Google (+ dev email in non-prod) |
| 2 | Stripe billing | Checkout, portal, webhooks, workspace subscriptions |
| 3 | Feature gates | Plan-based limits via `@codetruth/billing` |
| 4 | Usage metering | Monthly analyses, LLM council runs, project counts |
| 5 | Plans catalog | Builder (free), Pro, Team, Enterprise definitions |

## Plans

See [pricing.md](./pricing.md). Self-serve checkout: **Pro** and **Team** only. **Enterprise** is assigned via admin API.

## Key endpoints

- `GET /auth/providers`
- `POST /workspaces/:id/billing/checkout`
- `GET /workspaces/:id/billing`
- Stripe webhook: `POST /webhooks/stripe`

## Env

```env
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_TEAM_MONTHLY=
SESSION_SECRET=
APP_URL=
```