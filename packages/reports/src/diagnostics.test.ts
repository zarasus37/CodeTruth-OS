import { describe, expect, it } from "vitest";
import type { PipelineArtifacts } from "@codetruth/core";
import { buildTruthReport, renderMarkdownReport } from "./index.js";

describe("report diagnostics surfacing", () => {
  it("renders stage failures and confidence shifts in markdown", () => {
    const artifacts = {
      snapshot: { id: "snap_1" },
      symbols: [],
      dependencies: [],
      architecture: { services: [], modules: [], edges: [] },
      scorecard: { overall: 70, maturityStage: "developing", domains: [] },
      findings: [],
      consensus: {
        summary: "Council complete",
        confirmedClaims: [],
        inferredClaims: [],
        contradictions: [],
        unknowns: [],
      },
      roadmap: { tracks: { stabilize: [], complete: [], harden: [], optimize: [], scale: [] } },
      stageFailures: [
        {
          stage: "parsing",
          scope: "file",
          target: "src/broken.ts",
          message: "parse error",
          degraded: true,
        },
      ],
      diagnostics: {
        stages: [
          {
            stage: "parsing",
            state: "completed",
            startedAt: new Date(Date.now() - 50).toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 50,
            evidenceCorrections: 2,
          },
        ],
        failures: [
          {
            stage: "parsing",
            scope: "file",
            target: "src/broken.ts",
            message: "parse error",
            degraded: true,
          },
        ],
        confidenceSummary: {},
        evidenceViolationsCorrected: 2,
        evidenceCorrectionsByStage: { evaluation: 2 },
        confidenceBeforeCouncil: { Confirmed: 1 },
        confidenceAfterCouncil: { "Strongly Inferred": 1 },
        isolatedTargets: ["src/broken.ts"],
      },
    } as unknown as PipelineArtifacts;

    const report = buildTruthReport("analysis_1", "project_1", artifacts);
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("Pipeline Diagnostics");
    expect(markdown).toContain("src/broken.ts");
    expect(markdown).toContain("Before council");
    expect(markdown).toContain("After council");
    expect(markdown).toContain("parsing");
  });
});