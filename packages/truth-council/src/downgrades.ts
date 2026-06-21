import { downgradeConfidence } from "@codetruth/core";
import type {
  ContradictionRecord,
  CrossReviewDowngradeAudit,
  ModelAssessment,
} from "@codetruth/core";
import { COUNCIL_MODELS, type CouncilModel } from "./models.js";

function contradictionsForModel(
  model: CouncilModel,
  contradictions: ContradictionRecord[],
): ContradictionRecord[] {
  return contradictions.filter(
    (c) =>
      c.severity === "unresolved" &&
      (c.models.includes(model) || c.modelA === model || c.modelB === model),
  );
}

/**
 * Apply auditable confidence downgrades after cross-review.
 *
 * Rules (per model, capped at 3 steps):
 * 1. Any unresolved contradiction touching the model → downgrade 1 tier.
 * 2. High/critical impact where the model is modelA (claim supporter) → downgrade 2 tiers total.
 * 3. claim_downgraded resolution where the model is modelA → downgrade 2 tiers total.
 * 4. Three or more unresolved contradictions → +1 additional tier.
 */
export function applyCrossReviewDowngrades(
  assessments: Record<CouncilModel, ModelAssessment>,
  contradictions: ContradictionRecord[],
): {
  assessments: Record<CouncilModel, ModelAssessment>;
  audit: CrossReviewDowngradeAudit[];
} {
  const audit: CrossReviewDowngradeAudit[] = [];
  const updated = {} as Record<CouncilModel, ModelAssessment>;

  for (const model of COUNCIL_MODELS) {
    const base = assessments[model];
    const related = contradictionsForModel(model, contradictions);

    if (related.length === 0) {
      updated[model] = base;
      continue;
    }

    let steps = 1;
    const reasons: string[] = [
      `${related.length} unresolved contradiction(s) reference ${model}`,
    ];

    for (const contradiction of related) {
      if (
        contradiction.modelA === model &&
        (contradiction.impactSeverity === "critical" || contradiction.impactSeverity === "high")
      ) {
        steps = Math.max(steps, 2);
        reasons.push(
          `High-impact dispute on finding ${contradiction.subjectFindingId ?? "n/a"} (${contradiction.impactSeverity})`,
        );
      }

      if (contradiction.modelA === model && contradiction.resolution === "claim_downgraded") {
        steps = Math.max(steps, 2);
        reasons.push(`Claim by ${model} marked claim_downgraded (${contradiction.id})`);
      }
    }

    if (related.length >= 3) {
      steps += 1;
      reasons.push(`Three or more unresolved contradictions (${related.length}) — cumulative penalty`);
    }

    const cappedSteps = Math.min(steps, 3);
    const newConfidence = downgradeConfidence(base.confidence, cappedSteps);

    updated[model] = {
      ...base,
      confidence: newConfidence,
    };

    if (newConfidence !== base.confidence) {
      audit.push({
        model,
        previousConfidence: base.confidence,
        newConfidence,
        reasons,
      });
    }
  }

  return { assessments: updated, audit };
}