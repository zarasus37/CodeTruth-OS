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
    expect(result.consensus.summary).toContain("Heuristic Truth Council");
    expect(result.phases).toHaveLength(3);
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
    expect(result.contradictionRegister.some((c) => c.claim.includes("Admin route exposed"))).toBe(
      true,
    );
  });
});