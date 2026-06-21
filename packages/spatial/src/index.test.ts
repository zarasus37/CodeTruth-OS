import { describe, expect, it } from "vitest";
import type { ArchitectureGraph, BuildStateScorecard, Finding } from "@codetruth/core";
import { buildSpatialGraph } from "./index.js";

describe("buildSpatialGraph", () => {
  it("creates layered 3D nodes and edges", () => {
    const architecture: ArchitectureGraph = {
      services: [{ id: "svc1", name: "api", confidence: "Confirmed", evidence: [] }],
      modules: [{ id: "mod1", name: "src/core", serviceId: "svc1", confidence: "Strongly Inferred" }],
      edges: [],
    };
    const scorecard: BuildStateScorecard = {
      overall: 70,
      maturityStage: "developing",
      domains: [{ domain: "code structure", score: 70, confidence: "Confirmed", rationale: "ok" }],
    };
    const findings: Finding[] = [];

    const graph = buildSpatialGraph({
      architecture,
      symbols: [
        {
          id: "sym1",
          name: "main",
          kind: "function",
          filePath: "src/index.ts",
          line: 1,
          confidence: "Confirmed",
          evidence: [{ snapshotHash: "h", filePath: "src/index.ts", lineStart: 1, extractionMethod: "AST" }],
          evidenceChain: [{ snapshotHash: "h", filePath: "src/index.ts", lineStart: 1, extractionMethod: "AST" }],
        },
      ],
      dependencies: [
        {
          from: "src/index.ts",
          to: "./lib",
          kind: "imports",
          confidence: "Confirmed",
          evidence: [{ snapshotHash: "h", filePath: "src/index.ts", extractionMethod: "AST" }],
          evidenceChain: [{ snapshotHash: "h", filePath: "src/index.ts", extractionMethod: "AST" }],
        },
      ],
      findings,
      scorecard,
    });

    expect(graph.nodes.length).toBeGreaterThan(2);
    expect(graph.layers.length).toBeGreaterThan(0);
    expect(graph.bounds.max.z).toBeGreaterThanOrEqual(graph.bounds.min.z);
  });
});