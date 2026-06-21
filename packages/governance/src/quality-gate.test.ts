import { describe, expect, it } from "vitest";
import { evaluateQualityGate, parseBlockSeverities } from "./quality-gate.js";

const testEvidence = [
  { snapshotHash: "h", filePath: "src/api.ts", extractionMethod: "AST" as const },
];

const finding = (id: string, severity: "Critical blocker" | "High-risk flaw" | "Low-priority debt") => ({
  id,
  title: `Finding ${id}`,
  severity,
  confidence: "Confirmed" as const,
  domain: "security posture" as const,
  description: "test",
  evidence: testEvidence,
  evidenceChain: testEvidence,
});

describe("evaluateQualityGate", () => {
  it("passes when no blocking severities", () => {
    const result = evaluateQualityGate({
      findings: [finding("f1", "Low-priority debt")],
      overallScore: 80,
      analysisId: "analysis_1",
      snapshotId: "snap_1",
    });
    expect(result.passed).toBe(true);
    expect(result.blockedFindings).toHaveLength(0);
  });

  it("fails on critical findings", () => {
    const result = evaluateQualityGate({
      findings: [finding("f1", "Critical blocker")],
      overallScore: 80,
      analysisId: "analysis_1",
    });
    expect(result.passed).toBe(false);
    expect(result.blockedFindings).toHaveLength(1);
  });

  it("ignores accepted findings", () => {
    const result = evaluateQualityGate({
      findings: [finding("f1", "Critical blocker")],
      reviews: [
        {
          id: "r1",
          analysisId: "analysis_1",
          findingId: "f1",
          workspaceId: "ws_1",
          status: "accepted",
          reviewedBy: "user_1",
          reviewedAt: new Date().toISOString(),
        },
      ],
      analysisId: "analysis_1",
    });
    expect(result.passed).toBe(true);
  });
});

describe("parseBlockSeverities", () => {
  it("parses comma-separated severities", () => {
    expect(parseBlockSeverities("Critical blocker,High-risk flaw")).toEqual([
      "Critical blocker",
      "High-risk flaw",
    ]);
  });
});