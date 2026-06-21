import { describe, expect, it } from "vitest";
import { buildCouncilEvidenceBundle } from "@codetruth/core";
import {
  buildCrossModelChallenge,
  buildOverconfidenceContradiction,
  buildScorecardFindingContradiction,
  finalizeContradiction,
  isHighSeverity,
  isWeakEvidence,
} from "./contradictions.js";

describe("finalizeContradiction", () => {
  it("populates modelA/modelB and evidence fields from positions", () => {
    const record = finalizeContradiction({
      id: "c1",
      claim: "A says X",
      challenge: "B disputes X",
      models: ["Model A", "Model B"],
      severity: "unresolved",
      impactSeverity: "high",
      positions: [
        {
          model: "Model A",
          stance: "supports",
          claim: "X is true",
          confidence: "Confirmed",
          evidenceRefs: ["src/a.ts:10"],
        },
        {
          model: "Model B",
          stance: "challenges",
          claim: "X is overstated",
          confidence: "Weakly Inferred",
          evidenceRefs: ["src/a.ts:10"],
        },
      ],
      claimEvidence: [{ snapshotHash: "h", filePath: "src/a.ts", lineStart: 10, extractionMethod: "AST" }],
      challengeEvidence: [{ snapshotHash: "h", filePath: "src/a.ts", lineStart: 10, extractionMethod: "inference" }],
    });

    expect(record.modelA).toBe("Model A");
    expect(record.modelB).toBe("Model B");
    expect(record.positionA?.stance).toBe("supports");
    expect(record.positionB?.stance).toBe("challenges");
    expect(record.evidenceCitedA).toHaveLength(1);
    expect(record.evidenceCitedB).toHaveLength(1);
    expect(record.suggestedResolution).toBeTruthy();
  });
});

describe("contradiction builders", () => {
  const chain = [
    {
      snapshotHash: "h",
      filePath: "repository",
      extractionMethod: "inference" as const,
    },
  ];

  const bundle = buildCouncilEvidenceBundle(
    {
      overall: 80,
      maturityStage: "production_candidate",
      domains: [],
    },
    [
      {
        id: "f1",
        domain: "security posture",
        severity: "High-risk flaw",
        confidence: "Confirmed",
        title: "Missing auth middleware",
        description: "Routes exposed without auth.",
        evidence: chain,
        evidenceChain: chain,
      },
    ],
    { services: [], modules: [], edges: [] },
  );

  it("builds rich scorecard contradictions", () => {
    const record = buildScorecardFindingContradiction(bundle);
    expect(record?.modelA).toBe("Planning Model");
    expect(record?.modelB).toBe("Security Model");
    expect(record?.impactSeverity).toBe("high");
    expect(record?.suggestedResolution).toBeTruthy();
  });

  it("builds overconfidence contradictions with evidence citations", () => {
    const record = buildOverconfidenceContradiction(bundle.findings[0]!, "Security Model");
    expect(record?.modelA).toBe("Evaluation Layer");
    expect(record?.modelB).toBe("Security Model");
    expect(record?.evidenceCitedA?.length).toBeGreaterThan(0);
    expect(record?.resolution).toBe("claim_downgraded");
  });

  it("builds cross-model challenges between council roles", () => {
    const record = buildCrossModelChallenge(
      "Architecture Model",
      "Security Model",
      bundle.findings[0]!,
    );
    expect(record?.modelA).toBe("Security Model");
    expect(record?.modelB).toBe("Architecture Model");
    expect(record?.positions).toHaveLength(2);
  });

  it("skips scorecard contradiction when readiness score is below threshold", () => {
    const lowScoreBundle = buildCouncilEvidenceBundle(
      { overall: 60, maturityStage: "developing", domains: [] },
      [
        {
          id: "f1",
          domain: "security posture",
          severity: "High-risk flaw",
          confidence: "Confirmed",
          title: "Missing auth middleware",
          description: "Routes exposed without auth.",
          evidence: chain,
          evidenceChain: chain,
        },
      ],
      { services: [], modules: [], edges: [] },
    );
    expect(buildScorecardFindingContradiction(lowScoreBundle)).toBeNull();
  });

  it("skips overconfidence when evidence is line-anchored AST", () => {
    const strong = {
      ...bundle.findings[0]!,
      evidenceChain: [
        {
          snapshotHash: "h",
          filePath: "src/auth.ts",
          lineStart: 10,
          extractionMethod: "AST" as const,
        },
      ],
    };
    expect(buildOverconfidenceContradiction(strong, "Security Model")).toBeNull();
  });

  it("skips cross-model challenge for same model", () => {
    expect(buildCrossModelChallenge("Security Model", "Security Model", bundle.findings[0]!)).toBeNull();
  });
});

describe("contradiction generation rules", () => {
  const sampleFinding = {
    id: "f1",
    title: "Sample",
    severity: "High-risk flaw" as const,
    domain: "security posture" as const,
    confidence: "Confirmed" as const,
    description: "desc",
    evidenceChain: [] as { snapshotHash: string; filePath: string; extractionMethod: "inference" }[],
  };

  it("detects weak inference-only evidence", () => {
    expect(isWeakEvidence([{ snapshotHash: "h", filePath: "repo", extractionMethod: "inference" }])).toBe(
      true,
    );
    expect(
      isWeakEvidence([
        {
          snapshotHash: "h",
          filePath: "src/a.ts",
          lineStart: 1,
          extractionMethod: "AST",
        },
      ]),
    ).toBe(false);
  });

  it("classifies high-severity findings", () => {
    expect(isHighSeverity({ ...sampleFinding, severity: "Critical blocker" })).toBe(true);
    expect(isHighSeverity({ ...sampleFinding, severity: "Low-priority debt" })).toBe(false);
  });
});