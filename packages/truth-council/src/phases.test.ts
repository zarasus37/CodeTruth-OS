import { describe, expect, it } from "vitest";
import { buildCouncilEvidenceBundle } from "@codetruth/core";
import { runCrossReviewPhase, runHeuristicDeliberation, runIndependentPhase } from "./phases.js";

const bundle = buildCouncilEvidenceBundle(
  {
    overall: 78,
    maturityStage: "production_candidate",
    domains: [{ domain: "security posture", score: 55, confidence: "Weakly Inferred", rationale: "gaps" }],
  },
  [
    {
      id: "f1",
      domain: "security posture",
      severity: "High-risk flaw",
      confidence: "Confirmed",
      title: "Missing auth middleware",
      description: "Routes exposed without auth.",
      evidence: [
        {
          snapshotHash: "h",
          filePath: "repository",
          extractionMethod: "inference",
        },
      ],
      evidenceChain: [
        {
          snapshotHash: "h",
          filePath: "repository",
          extractionMethod: "inference",
        },
      ],
    },
  ],
  {
    services: [{ id: "s1", name: "api", confidence: "Strongly Inferred", evidence: [] }],
    modules: [],
    edges: [],
  },
);

describe("runHeuristicDeliberation", () => {
  it("runs three distinct phases with structured assessments", () => {
    const result = runHeuristicDeliberation(bundle);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0]?.phase).toBe("independent");
    expect(result.phases[1]?.phase).toBe("cross_review");
    expect(result.phases[2]?.phase).toBe("consensus");
    expect(result.phases[0]?.structuredAssessments).toHaveLength(5);
    expect(result.phases[1]?.contradictions.length).toBeGreaterThan(0);
  });

  it("produces confidence-weighted consensus", () => {
    const result = runHeuristicDeliberation(bundle);
    expect(result.consensus.weightedClaims?.length).toBeGreaterThan(0);
    expect(result.consensus.synthesisConfidence).toBeDefined();
  });
});

describe("runIndependentPhase", () => {
  it("scopes findings per model role", () => {
    const phase1 = runIndependentPhase(bundle);
    expect(phase1["Security Model"].findingsReviewed).toBe(1);
    expect(phase1["Architecture Model"].findingsReviewed).toBe(0);
  });

  it("injects rich per-model context", () => {
    const phase1 = runIndependentPhase(bundle);
    const ctx = phase1["Security Model"].injectedContext;
    expect(ctx?.model).toBe("Security Model");
    expect(ctx?.relatedFindings).toHaveLength(1);
    expect(ctx?.sourceSnippets.length).toBeGreaterThan(0);
  });
});

describe("full 3-phase deliberation flow", () => {
  it("preserves contradictions from cross-review through consensus", () => {
    const result = runHeuristicDeliberation(bundle);
    const cross = result.phases.find((p) => p.phase === "cross_review");
    const consensus = result.phases.find((p) => p.phase === "consensus");

    expect(cross?.contradictions.length).toBeGreaterThan(0);
    expect(consensus?.contradictions.length).toBeGreaterThan(0);
    expect(consensus?.contradictions.every((c) => c.severity === "unresolved")).toBe(true);

    const registerIds = new Set(result.contradictionRegister.map((c) => c.id));
    for (const contradiction of consensus?.contradictions ?? []) {
      expect(registerIds.has(contradiction.id)).toBe(true);
    }
  });

  it("applies confidence downgrades after cross-review", () => {
    const independent = runIndependentPhase(bundle);
    const cross = runCrossReviewPhase(bundle, independent);
    const securityBefore = independent["Security Model"].confidence;
    const securityAfter = cross.assessments["Security Model"].confidence;
    if (cross.contradictions.some((c) => c.models.includes("Security Model"))) {
      expect(cross.downgradeAudit.length).toBeGreaterThan(0);
      expect(securityAfter).not.toBe(securityBefore);
    }
  });

  it("threads structured assessments through all phases", () => {
    const result = runHeuristicDeliberation(bundle);
    for (const phase of result.phases) {
      expect(phase.structuredAssessments?.length).toBe(5);
    }
    expect(result.consensus.contradictions.length).toBeGreaterThan(0);
  });
});