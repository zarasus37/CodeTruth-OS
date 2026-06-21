# Phase B — Prove the Activation Moment (Weeks 3–6)

Blueprint gates:

| Metric | Target |
|--------|--------|
| Activation rate (signup → first completed analysis) | **>55%** |
| Re-analysis habit (project re-analyzes within 7 days) | **>65%** |
| Activation moment (survey: ≥3 unknown findings) | **>70%** |

## Shipped capabilities

### 7. Product telemetry

Events tracked in `product_events`:

| Event | Source |
|-------|--------|
| `activation.survey_submitted` | Post-first-analysis survey |
| `activation.moment_viewed` | Top unknown findings panel |
| `evidence.drilldown_clicked` | Evidence file/line expand in findings |
| `contradiction.viewed` | Contradiction register click |
| `finding.override` | Accept / reject / defer on a finding |
| `billing.upgrade_blocked` | API 402 feature gate |
| `billing.upgrade_prompt_shown` | In-app upgrade modal |
| `billing.checkout_started` | Stripe checkout CTA |

Client helper: `POST /telemetry/track`

Metrics: `GET /admin/beta/metrics` (includes `gates.activationMet`, `gates.habitMet`)

### 8. Onboarding flow

Sequence: **welcome → workspace → project → connect GitHub → first analysis → activation moment → survey**

- GitHub connect step opens repo wiring in the project panel
- After first analysis, **Activation moment** panel highlights top 3 unknown findings
- Survey captures whether user felt the ≥3 unknown findings moment

### 9. In-app upgrade path

When Free tier hits a limit (HTTP **402**):

- Upgrade modal explains value (not a dead end)
- **Start Pro checkout** → Stripe Checkout session
- Dismiss returns to app

## Enable closed beta

```bash
BETA_MODE=true
BETA_ADMIN_TOKEN=your-admin-token
BETA_DEFAULT_INVITE_CODE=MONAD-2026
```

## Operator commands

```bash
# Metrics vs blueprint gates
curl http://localhost:4310/admin/beta/metrics -H "Authorization: Bearer $BETA_ADMIN_TOKEN"

# Create cohort invite
curl -X POST http://localhost:4310/admin/beta/invites \
  -H "Authorization: Bearer $BETA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"AGENCY-01","maxRedemptions":12,"grantsPlan":"pro","trialDays":60}'
```