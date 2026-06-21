import { describe, expect, it } from "vitest";
import type { Finding, InstitutionalPortfolioView } from "@codetruth/core";
import { evaluateProjectCompliance } from "./evaluate.js";
import { renderAuditorReport, renderComplianceCsv } from "./export.js";

const authFinding: Finding = {
  id: "finding_auth",
  domain: "security posture",
  severity: "High-risk flaw",
  confidence: "Confirmed",
  title: "Missing authentication middleware",
  description: "Routes are exposed without auth checks.",
  evidence: [],
  gapCategory: "authentication system",
};

function sampleView(): InstitutionalPortfolioView {
  const posture = evaluateProjectCompliance({
    projectId: "project_1",
    projectName: "Payments API",
    findings: [authFinding],
  });

  return {
    workspaceId: "ws_1",
    projects: [
      {
        projectId: "project_1",
        projectName: "Payments API",
        languages: ["typescript"],
        overallScore: 72,
        findingCount: 1,
        complianceScore: posture.overallComplianceScore,
        openViolations: 1,
      },
    ],
    aggregateScore: 72,
    aggregateComplianceScore: posture.overallComplianceScore,
    projectCount: 1,
    maturityDistribution: {
      prototype: 0,
      developing: 0,
      production_candidate: 1,
      production_ready: 0,
    },
    driftAlerts: [],
    compliance: {
      workspaceId: "ws_1",
      projects: [posture],
      aggregateComplianceScore: posture.overallComplianceScore,
      openViolations: 1,
      frameworkBreakdown: {
        soc2: { passing: 0, failing: 1, score: 0 },
        iso27001: { passing: 1, failing: 0, score: 100 },
        nist_csf: { passing: 1, failing: 0, score: 100 },
        custom: { passing: 0, failing: 0, score: 100 },
      },
    },
    trendSeries: [],
    recentActivity: [],
    schedules: [],
  };
}

describe("renderComplianceCsv", () => {
  it("exports violations as CSV rows", () => {
    const csv = renderComplianceCsv(sampleView().compliance);
    expect(csv.split("\n")[0]).toContain("project,framework,control_id");
    expect(csv).toContain("Payments API");
    expect(csv).toContain("soc2");
    expect(csv).toContain("finding_auth");
  });
});

describe("renderAuditorReport", () => {
  it("includes institutional portfolio fields for auditors", () => {
    const report = renderAuditorReport(sampleView());
    expect(report.workspaceId).toBe("ws_1");
    expect(report.aggregateComplianceScore).toBeLessThan(100);
    expect(report.compliance).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
});