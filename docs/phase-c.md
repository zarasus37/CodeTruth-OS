# Phase C — Trust & Margin (weeks 5–8)

Blueprint guardrails: **never hide disagreement**, **evidence chains sacred**.

## Deliverables

| # | Item | Implementation |
|---|------|----------------|
| 10 | LLM council production path | Provider failover (`LLM_FALLBACK_*`, `LLM_PROVIDER_CHAIN`), 429 retry with backoff, tier run caps + **USD cost caps** enforced before council runs |
| 11 | Evidence Ledger UI | Finding → file → symbol breadcrumb in ≤3 clicks; spatial navigator `focusNode` wiring |
| 12 | Contradiction Register | Always visible in UI + markdown/HTML exports (before consensus summary) |
| 13 | Incremental cost control | Scoped re-parse of changed files only; `incrementalMetrics` on artifacts; `incremental.savings` telemetry |

## Tier LLM limits

| Plan | Council runs/mo | Cost cap/mo |
|------|-----------------|-------------|
| Builder (free) | 0 | $0 |
| Pro | 15 | $5 |
| Team | 75 | $25 |
| Enterprise | 999 | $999 |

When quota or cost cap is exceeded, analysis continues with **heuristic council** (never silent failure). UI shows `Heuristic council (LLM degraded)` badge.

## Incremental savings gate

Target: **≥85% compute savings** when `changeRatio ≤ 10%`.

Validated via `packages/pipeline/src/incremental.test.ts`. Admin metrics at `GET /admin/beta/metrics` include `phaseC` block.

## Telemetry events

- `evidence.ledger_opened` — Evidence Ledger panel opened from a finding
- `incremental.savings` — incremental analysis completed with savings metadata
- `contradiction.viewed` — contradiction register card clicked

## Env vars

See `.env.example` for `LLM_FALLBACK_*` and `LLM_PROVIDER_CHAIN`.