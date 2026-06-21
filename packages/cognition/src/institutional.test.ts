import { describe, expect, it } from "vitest";
import type { AnalysisJob, CustomCompliancePolicy, Finding, Project } from "@codetruth/core";
import { buildInstitutionalPortfolioView } from "./institutional.js";

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

function completedAnalysis(id: string, completedAt: string, score: number): AnalysisJob {
  return {
    id,
    projectId: "project_1",
    snapshotId: `snap_${id}`,
    status: "completed",
    progress: 100,
    createdAt: completedAt,
    completedAt,
    artifacts: {
      findings: [authFinding],
      scorecard: {
        overall: score,
        maturityStage: "production_candidate",
        domains: [],
      },
      consensus: {
        summary: "test",
        confirmedClaims: [],
        inferredClaims: [],
        contradictions: [],
        unknowns: [],
      },
      roadmap: {
        tracks: {
          stabilize: [],
          complete: [],
          harden: [],
          optimize: [],
          scale: [],
        },
      },
      snapshot: {
        id: `snap_${id}`,
        projectId: "project_1",
        hash: `hash_${id}`,
        createdAt: completedAt,
        fileCount: 1,
        manifest: [],
        stackProfile: {
          languages: ["typescript"],
          frameworks: [],
          packageManagers: [],
          containerization: [],
          infrastructureAsCode: [],
          cicd: [],
          testFrameworks: [],
        },
        rootPath: "/",
      },
      symbols: [],
      dependencies: [],
      architecture: { services: [], modules: [], edges: [] },
    },
  };
}

describe("buildInstitutionalPortfolioView", () => {
  it("builds portfolio compliance and trend series", () => {
    const project: Project = {
      id: "project_1",
      workspaceId: "ws_1",
      name: "Payments API",
      createdAt: "2026-06-01T00:00:00.000Z",
    };

    const analyses = [
      completedAnalysis("analysis_1", "2026-06-20T10:00:00.000Z", 70),
      completedAnalysis("analysis_2", "2026-06-21T10:00:00.000Z", 75),
    ];

    const view = buildInstitutionalPortfolioView({
      workspaceId: "ws_1",
      projects: [project],
      analysesByProject: new Map([[project.id, analyses]]),
    });

    expect(view.projectCount).toBe(1);
    expect(view.compliance.openViolations).toBeGreaterThan(0);
    expect(view.trendSeries).toHaveLength(2);
    expect(view.projects[0]?.complianceScore).toBeLessThan(100);
  });

  it("includes custom compliance policies when provided", () => {
    const project: Project = {
      id: "project_1",
      workspaceId: "ws_1",
      name: "Payments API",
      createdAt: "2026-06-01T00:00:00.000Z",
    };

    const customPolicies: CustomCompliancePolicy[] = [
      {
        id: "policy_1",
        workspaceId: "ws_1",
        title: "Auth required",
        description: "All routes must authenticate users",
        domains: ["security posture"],
        gapCategories: ["authentication system"],
        severityThreshold: "High-risk flaw",
        createdAt: "2026-06-21T00:00:00.000Z",
        createdBy: "user_1",
      },
    ];

    const view = buildInstitutionalPortfolioView({
      workspaceId: "ws_1",
      projects: [project],
      analysesByProject: new Map([
        [project.id, [completedAnalysis("analysis_1", "2026-06-21T10:00:00.000Z", 70)]],
      ]),
      customPolicies,
    });

    const customCard = view.compliance.projects[0]?.scorecards.find((c) => c.framework === "custom");
    expect(customCard?.controlsTotal).toBe(1);
    expect(customCard?.controlsFailing).toBeGreaterThan(0);
  });
});