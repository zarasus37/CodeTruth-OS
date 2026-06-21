import { describe, expect, it } from "vitest";
import type { Finding } from "@codetruth/core";
import {
  buildPortfolioComplianceView,
  evaluateFrameworkCompliance,
  evaluateProjectCompliance,
} from "./evaluate.js";

const authEvidence = [
  { snapshotHash: "h", filePath: "src/api.ts", extractionMethod: "AST" as const },
];

const authFinding: Finding = {
  id: "finding_auth",
  domain: "security posture",
  severity: "High-risk flaw",
  confidence: "Confirmed",
  title: "Missing authentication middleware",
  description: "Routes are exposed without auth checks.",
  evidence: authEvidence,
  evidenceChain: authEvidence,
  gapCategory: "authentication system",
};

describe("evaluateFrameworkCompliance", () => {
  it("flags SOC2 access control violations from auth findings", () => {
    const card = evaluateFrameworkCompliance("soc2", [authFinding]);
    expect(card.controlsFailing).toBeGreaterThan(0);
    expect(card.violations.some((v) => v.controlId === "soc2-cc6-access")).toBe(true);
    expect(card.overallScore).toBeLessThan(100);
  });

  it("passes when no qualifying findings exist", () => {
    const card = evaluateFrameworkCompliance("soc2", []);
    expect(card.controlsFailing).toBe(0);
    expect(card.overallScore).toBe(100);
  });
});

describe("evaluateProjectCompliance", () => {
  it("rolls up all institutional frameworks", () => {
    const posture = evaluateProjectCompliance({
      projectId: "project_1",
      projectName: "Payments API",
      analysisId: "analysis_1",
      findings: [authFinding],
    });

    expect(posture.scorecards).toHaveLength(3);
    expect(posture.overallComplianceScore).toBeLessThan(100);
  });

  it("adds custom framework when workspace policies exist", () => {
    const posture = evaluateProjectCompliance({
      projectId: "project_1",
      projectName: "Payments API",
      findings: [authFinding],
      customPolicies: [
        {
          id: "policy_1",
          workspaceId: "ws_1",
          title: "Auth required",
          description: "Routes must authenticate",
          domains: ["security posture"],
          gapCategories: ["authentication system"],
          severityThreshold: "High-risk flaw",
          createdAt: "2026-06-21T00:00:00.000Z",
          createdBy: "user_1",
        },
      ],
    });

    expect(posture.scorecards).toHaveLength(4);
    expect(posture.scorecards.some((card) => card.framework === "custom")).toBe(true);
  });
});

describe("buildPortfolioComplianceView", () => {
  it("aggregates portfolio compliance posture", () => {
    const posture = evaluateProjectCompliance({
      projectId: "project_1",
      projectName: "Payments API",
      findings: [authFinding],
    });

    const view = buildPortfolioComplianceView("ws_1", [posture]);
    expect(view.aggregateComplianceScore).toBeLessThan(100);
    expect(view.openViolations).toBeGreaterThan(0);
    expect(view.frameworkBreakdown.soc2.failing).toBeGreaterThan(0);
  });
});