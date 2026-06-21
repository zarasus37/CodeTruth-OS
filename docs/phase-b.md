# Phase B — Closed Beta Infrastructure (Weeks 5–12)

Maps to Monetization Blueprint **Phase 1: Closed Beta** and **Days 15–45** of the 90-day plan.

## Goals

1. Instrument activation, habit, and trust metrics
2. Onboarding flow that surfaces the activation moment
3. Closed beta invite system with Pro trial grants
4. Weekly metrics review endpoint for beta operators

## Enable closed beta

```bash
BETA_MODE=true
BETA_ADMIN_TOKEN=your-admin-token
BETA_DEFAULT_INVITE_CODE=MONAD-2026
BETA_DEFAULT_GRANTS_PLAN=pro
BETA_DEFAULT_TRIAL_DAYS=45
```

## Beta operator commands

Create invite:

```bash
curl -X POST http://localhost:4310/admin/beta/invites \
  -H "Authorization: Bearer $BETA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"AGENCY-01","maxRedemptions":12,"grantsPlan":"pro","trialDays":60}'
```

View metrics:

```bash
curl http://localhost:4310/admin/beta/metrics \
  -H "Authorization: Bearer $BETA_ADMIN_TOKEN"
```

## Gate targets (from blueprint)

| Metric | Target |
|--------|--------|
| Activation moment rate | ≥70% report ≥3 unknown findings |
| Habit formation | ≥60% projects re-analyze within 7 days |
| Time to first insight | <12 minutes median (500-file project) |

## Pricing note

Pro is currently modeled at **$79/mo** (upper-middle of blueprint's $49–99 range). Phase B beta is the validation window — adjust price based on conversion and feedback before public launch (Phase C).