# CodeTruth OS Pricing Model

Researched and locked for Phase A SaaS launch (June 2026).

## Market positioning

CodeTruth OS sits between lightweight static scanners and expensive manual technical due diligence:

| Comparable | Price signal |
|------------|--------------|
| Semgrep Teams | ~$30/contributor/month |
| Manual tech DD | $5,000–$50,000 per engagement |
| Sourcegraph Enterprise | from ~$16,000/year |

**Modeled price point (pre-validation):** Pro at **$79/month** sits in the upper-middle of the blueprint's $49–99 range. It was chosen to cover LLM council COGS and signal institutional quality — not because we have validated willingness-to-pay data yet. **Phase B closed beta** is when we test whether $79, $59, or $49 converts better. Team at **$449/month** targets agencies and small platform teams. Annual plans use a **17% discount** (two months free).

## Plans

### Builder (Free) — $0

For evaluation and solo builders.

| Limit | Value |
|-------|-------|
| Workspaces | 1 |
| Projects | 2 |
| Files per project | 500 |
| Manual analyses / month | 3 |
| LLM Truth Council | Heuristic only |
| Seats | 1 |

**Included:** Full analysis pipeline (heuristic council), in-app report viewing.

**Not included:** Webhooks, live re-analysis, spatial navigator, exports, snapshot diff history, portfolio, compliance audit exports.

### Pro — $79/mo or $790/yr

For engineers who need continuous cognition.

| Limit | Value |
|-------|-------|
| Workspaces | 3 |
| Projects | 15 |
| Files per project | 5,000 |
| Analyses / month | 30 |
| LLM council runs / month | 15 |
| Seats | 1–3 |

**Adds:** Continuous analysis, GitHub webhooks, live re-analysis schedules, spatial navigator, exports, snapshot history, portfolio view, LLM Truth Council.

### Team — $449/mo or $4,490/yr

For agencies and institutional review workflows.

| Limit | Value |
|-------|-------|
| Base seats | 5 included |
| Additional seats | $49/seat/mo |
| Projects | 50 |
| Analyses / month | 150 |
| LLM council runs / month | 75 |

**Adds:** Pooled usage, advanced RBAC, compliance audit exports (CSV/JSON), team seat management.

### Enterprise — from $1,200/mo

Custom contracts from **$14,400/year** minimum. SSO, SLA, portfolio governance, dedicated support.

## Stripe products (configure in Dashboard)

| Product | Env variable |
|---------|--------------|
| Pro monthly | `STRIPE_PRICE_PRO_MONTHLY` |
| Pro yearly | `STRIPE_PRICE_PRO_YEARLY` |
| Team monthly | `STRIPE_PRICE_TEAM_MONTHLY` |

## Source of truth

Plan definitions, limits, and feature gates live in `packages/billing/src/plans.ts`.