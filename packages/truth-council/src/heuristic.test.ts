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
});