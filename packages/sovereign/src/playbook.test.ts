import { describe, expect, it } from "vitest";
import type { DueDiligenceEngagement, PipelineArtifacts } from "@codetruth/core";
import { generateDueDiligencePlaybook } from "./index.js";

const baseArtifacts = {
  scorecard: {
    overall: 62,
    maturityStage: "developing" as const,
    domains: [],
  },
  consensus: {
    summary: "System shows developing maturity with security gaps.",
    confirmedClaims: [],
    inferredClaims: [],
    contradictions: [],
    unknowns: [],
  },
  findings: [
    {
      id: "f1",
      domain: "security posture" as const,
      severity: "Critical blocker" as const,
      confidence: "Confirmed" as const,
      title: "Missing auth on admin route",
      description: "Admin endpoints lack authentication.",
      evidence: [{ snapshotHash: "h", filePath: "src/admin.ts", extractionMethod: "AST" as const }],
      evidenceChain: [{ snapshotHash: "h", filePath: "src/admin.ts", extractionMethod: "AST" as const }],
    },
  ],
} as unknown as PipelineArtifacts;

describe("sovereign playbook", () => {
  it("generates markdown due diligence export", () => {
    const engagement: DueDiligenceEngagement = {
      id: "dd_1",
      workspaceId: "ws_1",
      projectId: "proj_1",
      title: "Series B technical diligence",
      clientName: "Acme Capital",
      stage: "risk_assessment",
      createdAt: new Date().toISOString(),
      createdBy: "user_1",
      updatedAt: new Date().toISOString(),
    };

    const md = generateDueDiligencePlaybook(engagement, baseArtifacts, {
      workspaceName: "Acme DD",
      dataResidency: "eu",
    });

    expect(md).toContain("Sovereign Services");
    expect(md).toContain("Series B technical diligence");
    expect(md).toContain("Missing auth on admin route");
    expect(md).toContain("Data residency:** eu");
    expect(md).toContain("risk_assessment");
  });
});