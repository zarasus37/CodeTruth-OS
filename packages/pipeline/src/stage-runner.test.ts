import { describe, expect, it } from "vitest";
import { createDiagnostics } from "./diagnostics.js";
import { runIsolatedOperation, runIsolatedStage } from "./stage-runner.js";

describe("runIsolatedStage", () => {
  it("records timing and returns result on success", async () => {
    const diagnostics = createDiagnostics();
    const value = await runIsolatedStage(
      diagnostics,
      "parsing",
      async () => "ok",
      () => "fallback",
    );
    expect(value).toBe("ok");
    expect(diagnostics.stages).toHaveLength(1);
    expect(diagnostics.stages[0]?.state).toBe("completed");
    expect(diagnostics.stages[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("falls back without aborting the pipeline on stage failure", async () => {
    const diagnostics = createDiagnostics();
    const value = await runIsolatedStage(
      diagnostics,
      "evaluation",
      async () => {
        throw new Error("eval blew up");
      },
      () => ({ score: 0 }),
    );
    expect(value).toEqual({ score: 0 });
    expect(diagnostics.failures).toHaveLength(1);
    expect(diagnostics.failures[0]?.stage).toBe("evaluation");
    expect(diagnostics.stages[0]?.state).toBe("degraded");
    expect(diagnostics.isolatedTargets ?? []).toHaveLength(0);
  });
});

describe("runIsolatedOperation", () => {
  it("isolates marketplace-style analyzer failures", async () => {
    const diagnostics = createDiagnostics();
    const result = await runIsolatedOperation(
      diagnostics,
      { stage: "evaluation", scope: "analyzer", target: "solidity-audit" },
      () => {
        throw new Error("analyzer timeout");
      },
      () => "degraded",
    );
    expect(result).toBe("degraded");
    expect(diagnostics.failures[0]?.target).toBe("solidity-audit");
    expect(diagnostics.isolatedTargets).toContain("solidity-audit");
  });

  it("isolates spatial graph build failures", async () => {
    const diagnostics = createDiagnostics();
    const graph = await runIsolatedOperation(
      diagnostics,
      { stage: "evaluation", scope: "stage", target: "spatial_graph" },
      () => {
        throw new Error("spatial layout failed");
      },
      () => ({ nodes: [] }),
    );
    expect(graph).toEqual({ nodes: [] });
    expect(diagnostics.isolatedTargets).toContain("spatial_graph");
  });
});