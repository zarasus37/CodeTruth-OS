# Evidence and Confidence Model

This document describes how CodeTruth OS builds evidence chains and assigns confidence across pipeline layers. It reflects the Tier 1–4 implementation in `@codetruth/core`, `@codetruth/parsing`, `@codetruth/pipeline`, and `@codetruth/truth-council`.

## Evidence chains

Every finding, symbol, and council claim must cite at least one **evidence link**. An evidence link is an `EvidenceRecord` (see `packages/core/src/evidence.ts`):

| Field | Purpose |
|-------|---------|
| `id` | Stable evidence link id (`ev_*`) |
| `filePath` | Repository-relative path (or `repository` for absence signals) |
| `lineStart` / `lineEnd` | Optional line anchor |
| `symbolId` / `symbolName` | Optional symbol anchor from parsing |
| `extractionMethod` | `AST`, `pattern_match`, `config_parse`, `inference`, `absence`, `llm_analysis` |
| `snippet` / `rawSnippet` | Human-readable excerpt (≤500 / ≤1200 chars) |
| `confidenceAtExtraction` | Confidence tier when the link was created |
| `createdAt` | ISO timestamp when the link was materialized |
| `metadata` | Optional extensibility bag (parser engine, absence reason, etc.) |

### Layer responsibilities

1. **Parsing** — `buildEvidenceFromParseResult()` produces symbol- and dependency-level links with AST anchors where available.
2. **Evaluation** — `makeFinding()` attaches parse evidence, symbol matches, or absence signals. Findings start in lifecycle state `Created`.
3. **Pipeline** — `enforceFindingEvidence()` normalizes chains (fills missing hash/path, enriches snippets). `normalizeFindingsForCouncil()` advances findings to `EvidenceEnforced` and applies severity confidence gates.
4. **Truth Council** — Models receive per-model context (snippets, architecture nodes, scoped findings). Contradictions cite `evidenceCitedA` / `evidenceCitedB`. Cross-review may adjust finding confidence; findings move to `CouncilReviewed`, then `Finalized` at pipeline completion.

## Confidence taxonomy

Five tiers, ordered from strongest to weakest:

1. **Confirmed** — Line-anchored AST or config evidence
2. **Strongly Inferred** — Pattern match or multi-link structural inference
3. **Weakly Inferred** — Inference-only or thin evidence
4. **Unknown** — Insufficient evidence
5. **Contradicted** — Council or pipeline marked explicit disagreement

### Derivation rules

- `inferConfidenceFromEvidence()` in `@codetruth/core` maps extraction methods and anchors to a structural tier.
- `minimumConfidenceForSeverity()` requires **Strongly Inferred** for Critical/High findings; weaker tiers trigger `flaggedForWeakEvidence`.
- Pipeline downgrades overconfident claims when the chain cannot support **Confirmed**.
- Truth Council `applyCrossReviewDowngrades()` applies auditable tier reductions after cross-review.

### Before / after council

`PipelineDiagnostics` tracks:

- `confidenceBeforeCouncil` — distribution after evidence enforcement
- `confidenceAfterCouncil` — distribution after council adjustments and downgrade rules

## Finding lifecycle

Explicit state machine (`packages/core/src/state.ts`, guarded in `packages/pipeline/src/lifecycle.ts`):

```
Created → EvidenceEnforced → CouncilReviewed → Finalized
```

| State | When set |
|-------|----------|
| `Created` | Evaluation emits the finding |
| `EvidenceEnforced` | `normalizeFindingsForCouncil()` completes |
| `CouncilReviewed` | Truth Council phase completes |
| `Finalized` | Planning completes; artifacts returned |

Invalid skips (e.g. `Created` → `Finalized`) throw at transition time. The pipeline calls `assertFindingsAtLeast(findings, "EvidenceEnforced")` before Truth Council and `advanceFindingsGuarded()` for council/final transitions.

Unit tests: `packages/core/src/state.test.ts` (6 tests), `packages/pipeline/src/lifecycle.test.ts` (4 tests).

## Contradictions and confidence

Unresolved contradictions preserve disagreement in the contradiction register. Impact severity (`critical` / `high` / `medium` / `low`) drives downgrade rules. `suggestedResolution` guides planners and human reviewers without hiding conflict.

## Incremental analysis

When a base snapshot exists, parsing merges retained symbols for unchanged files with delta parse results. `PipelineDiagnostics.incrementalSavingsPercent` records compute savings. Tests in `packages/pipeline/src/incremental.test.ts` verify unchanged-file symbol equivalence between full and incremental paths.

## Related modules

- `packages/core/src/confidence.ts` — tier math and downgrade helpers
- `packages/core/src/evidence.ts` — evidence factories (`createAbsenceEvidence`, `enrichEvidenceRecord`)
- `packages/core/src/entity-evidence.ts` — dependency evidence + re-exports
- `packages/pipeline/src/lifecycle.ts` — guarded lifecycle transitions
- `packages/pipeline/src/evidence.ts` — council gate and normalization
- `packages/truth-council/src/downgrades.ts` — cross-review confidence rules