import { describe, expect, it } from "vitest";
import type { ContradictionRecord, ModelAssessment } from "@codetruth/core";
import { COUNCIL_MODELS } from "./models.js";
import { applyCrossReviewDowngrades } from "./downgrades.js";

function baseAssessments(confidence: ModelAssessment["confidence"] = "Confirmed"): Record<
  (typeof COUNCIL_MODELS)[number],
  ModelAssessment
> {
  const assessments = {} as Record<(typeof COUNCIL_MODELS)[number], ModelAssessment>;
  for (const model of COUNCIL_MODELS) {
    assessments[model] = {
      model,
      bullets: ["sample"],
      confidence,
      findingsReviewed: 1,
      evidenceCited: [],
    };
  }
  return assessments;
}

function contradiction(partial: Partial<ContradictionRecord> & Pick<ContradictionRecord, "modelA" | "modelB">): ContradictionRecord {
  return {
    id: "c1",
    claim: "claim",
    challenge: "challenge",
    models: [partial.modelA, partial.modelB],
    severity: "unresolved",
    ...partial,
  };
}

describe("applyCrossReviewDowngrades", () => {
  it("leaves confidence unchanged when no contradictions exist", () => {
    const { assessments, audit } = applyCrossReviewDowngrades(baseAssessments(), []);
    expect(assessments["Security Model"].confidence).toBe("Confirmed");
    expect(audit).toHaveLength(0);
  });

  it("downgrades one level for any unresolved contradiction touching a model", () => {
    const contradictions = [
      contradiction({
        modelA: "Security Model",
        modelB: "Architecture Model",
        impactSeverity: "medium",
      }),
    ];
    const { assessments, audit } = applyCrossReviewDowngrades(baseAssessments(), contradictions);
    expect(assessments["Security Model"].confidence).toBe("Strongly Inferred");
    expect(assessments["Architecture Model"].confidence).toBe("Strongly Inferred");
    expect(audit).toHaveLength(2);
  });

  it("applies extra downgrade for high-impact contradictions on supporting model", () => {
    const contradictions = [
      contradiction({
        modelA: "Security Model",
        modelB: "Planning Model",
        impactSeverity: "high",
        subjectFindingId: "f1",
      }),
    ];
    const { assessments } = applyCrossReviewDowngrades(baseAssessments(), contradictions);
    expect(assessments["Security Model"].confidence).toBe("Weakly Inferred");
  });

  it("applies claim_downgraded penalty to modelA", () => {
    const contradictions = [
      contradiction({
        modelA: "Security Model",
        modelB: "Architecture Model",
        impactSeverity: "high",
        resolution: "claim_downgraded",
        subjectFindingId: "f1",
      }),
    ];
    const { assessments: updated } = applyCrossReviewDowngrades(baseAssessments(), contradictions);
    expect(updated["Security Model"].confidence).toBe("Weakly Inferred");
  });

  it("caps cumulative downgrades at three steps", () => {
    const contradictions = [
      contradiction({ modelA: "Security Model", modelB: "Architecture Model", impactSeverity: "critical", resolution: "claim_downgraded", subjectFindingId: "f1" }),
      contradiction({ modelA: "Security Model", modelB: "Runtime Model", impactSeverity: "critical", resolution: "claim_downgraded", subjectFindingId: "f2" }),
      contradiction({ modelA: "Security Model", modelB: "DevOps Model", impactSeverity: "high", subjectFindingId: "f3" }),
    ];
    const { assessments } = applyCrossReviewDowngrades(baseAssessments(), contradictions);
    expect(assessments["Security Model"].confidence).toBe("Unknown");
  });
});