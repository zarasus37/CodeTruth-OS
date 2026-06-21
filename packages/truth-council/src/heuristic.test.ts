import { describe, expect, it } from "vitest";
import { runHeuristicTruthCouncil } from "./heuristic.js";

describe("runHeuristicTruthCouncil", () => {
  it("returns consensus for empty findings", () => {
    const result = runHeuristicTruthCouncil(
      {
        overall: 70,
        maturityStage: "developing",
        domains: [],
      },
      [],
      { services: [], modules: [], edges: [] },
    );
    expect(result.consensus.summary).toContain("3-phase deliberation");
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0]?.structuredAssessments).toHaveLength(5);
    expect(result.llmPowered).toBe(false);
  });

  it("flags overconfident high-severity findings with weak evidence", () => {
    const chain = [
      {
        snapshotHash: "h",
        filePath: "repository",
        extractionMethod: "inference" as const,
      },
    ];
    const result = runHeuristicTruthCouncil(
      {
        overall: 60,
        maturityStage: "developing",
        domains: [],
      },
      [
        {
          id: "f1",
          domain: "security posture",
          severity: "Critical blocker",
          confidence: "Confirmed",
          title: "Admin route exposed",
          description: "No auth on admin endpoints.",
          evidence: chain,
          evidenceChain: chain,
        },
      ],
      { services: [], modules: [], edges: [] },
    );
    expect(result.contradictionRegister.length).toBeGreaterThan(0);
    const match = result.contradictionRegister.find((c) => c.subjectFindingId === "f1");
    expect(match?.positions?.length).toBeGreaterThan(0);
    expect(match?.impactSeverity).toBeDefined();
    expect(match?.modelA).toBeDefined();
    expect(match?.modelB).toBeDefined();
    expect(match?.suggestedResolution).toBeTruthy();
  });
});