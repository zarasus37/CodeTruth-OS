import { describe, expect, it } from "vitest";
import { buildCouncilEvidenceBundle } from "@codetruth/core";
import { runHeuristicDeliberation, runIndependentPhase } from "./phases.js";

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
});