import { describe, expect, it } from "vitest";
import type { Finding } from "@codetruth/core";
import {
  buildConfidenceSummary,
  createDiagnostics,
  formatConfidenceDistribution,
  recordEvidenceCorrections,
  recordIsolatedTarget,
} from "./diagnostics.js";
import { beginStage, completeStage } from "./diagnostics.js";

describe("diagnostics observability", () => {
  it("tracks per-stage evidence corrections", () => {
    const diagnostics = createDiagnostics();
    beginStage(diagnostics, "evaluation");
    recordEvidenceCorrections(diagnostics, "evaluation", 3);
    completeStage(diagnostics, "evaluation", "completed");

    expect(diagnostics.evidenceViolationsCorrected).toBe(3);
    expect(diagnostics.evidenceCorrectionsByStage?.evaluation).toBe(3);
    expect(diagnostics.stages[0]?.evidenceCorrections).toBe(3);
    expect(diagnostics.stages[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("builds confidence distribution summaries", () => {
    const findings: Finding[] = [
      {
        id: "f1",
        domain: "security posture",
        severity: "High-risk flaw",
        confidence: "Confirmed",
        title: "A",
        description: "d",
        evidence: [],
        evidenceChain: [],
      },
      {
        id: "f2",
        domain: "security posture",
        severity: "Low-priority debt",
        confidence: "Weakly Inferred",
        title: "B",
        description: "d",
        evidence: [],
        evidenceChain: [],
      },
    ];
    const summary = buildConfidenceSummary(findings);
    expect(summary.Confirmed).toBe(1);
    expect(summary["Weakly Inferred"]).toBe(1);
    expect(formatConfidenceDistribution(summary)).toContain("Confirmed: 1");
  });

  it("dedupes isolated targets", () => {
    const diagnostics = createDiagnostics();
    recordIsolatedTarget(diagnostics, "src/bad.ts");
    recordIsolatedTarget(diagnostics, "src/bad.ts");
    recordIsolatedTarget(diagnostics, "solidity-audit");
    expect(diagnostics.isolatedTargets).toEqual(["src/bad.ts", "solidity-audit"]);
  });
});