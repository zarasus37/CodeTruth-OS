import type {
  AnalysisStage,
  ArchitectureGraph,
  BuildStateScorecard,
  IncrementalComputeMetrics,
  MarketplaceAnalyzerRun,
  PipelineArtifacts,
  PipelineStreamEvent,
  SnapshotRecord,
  SpatialGraph,
} from "@codetruth/core";
import { evaluateProject } from "@codetruth/evaluation";
import { diffSnapshots } from "@codetruth/ingestion";
import {
  buildEvidenceFromParseResult,
  countSourceFiles,
  parseSnapshot,
  parseSnapshotPaths,
} from "@codetruth/parsing";
import { buildRoadmap } from "@codetruth/planning";
import { reconstructArchitecture } from "@codetruth/reconstruction";
import { applySpatialDiffOverlay, buildSpatialGraph } from "@codetruth/spatial";
import { ANALYZER_VERSION } from "@codetruth/reports";
import {
  degradedMarketplaceRun,
  mergeMarketplaceFindings,
  runMarketplaceAnalyzer,
} from "@codetruth/marketplace";
import { runHeuristicTruthCouncil, runTruthCouncil } from "@codetruth/truth-council";
import {
  buildConfidenceSummary,
  createDiagnostics,
  recordEvidenceCorrections,
  recordFailure,
  stageSnapshot,
} from "./diagnostics.js";
import { degradedUnknownFinding, normalizeFindingsForCouncil } from "./evidence.js";
import { emitStream, type StreamCallback } from "./streaming.js";
import { runIsolatedOperation, runIsolatedStage } from "./stage-runner.js";

const EMPTY_SPATIAL_GRAPH: SpatialGraph = {
  nodes: [],
  edges: [],
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  layers: [],
};

async function runMarketplaceWithIsolation(
  snapshot: SnapshotRecord,
  enabledAnalyzerIds: string[],
  diagnostics: ReturnType<typeof createDiagnostics>,
): Promise<MarketplaceAnalyzerRun[]> {
  const unique = [...new Set(enabledAnalyzerIds)];
  const runs: MarketplaceAnalyzerRun[] = [];

  for (const analyzerId of unique) {
    const run = await runIsolatedOperation(
      diagnostics,
      { stage: "evaluation", scope: "analyzer", target: analyzerId },
      () => runMarketplaceAnalyzer(snapshot, analyzerId),
      (error) => {
        const message = error instanceof Error ? error.message : "analyzer failed";
        return degradedMarketplaceRun(analyzerId, message);
      },
    );
    runs.push(run);
  }

  return runs;
}
import {
  changedFilePaths,
  fullAnalysisMetrics,
  mergeIncrementalParse,
} from "./incremental.js";

export type ProgressCallback = (
  stage: AnalysisStage,
  progress: number,
  event?: PipelineStreamEvent,
) => void | Promise<void>;

export interface RunPipelineOptions {
  analysisId?: string;
  onStream?: StreamCallback;
  incrementalBaseSnapshot?: SnapshotRecord;
  incrementalBaseArtifacts?: PipelineArtifacts;
  useLlmCouncil?: boolean;
  enabledMarketplaceAnalyzers?: string[];
}

export { PipelineError } from "./errors.js";
export {
  createEvidenceFromFinding,
  createEvidenceFromSymbol,
  enforceFindingEvidence,
  normalizeFindingsForCouncil,
} from "./evidence.js";

export async function runPipeline(
  snapshot: SnapshotRecord,
  onProgress: ProgressCallback = () => undefined,
  options: RunPipelineOptions = {},
): Promise<PipelineArtifacts> {
  const analysisId = options.analysisId ?? "inline";
  const stream = options.onStream;
  const diagnostics = createDiagnostics();

  const report = async (
    stage: AnalysisStage,
    progress: number,
    partial?: PipelineStreamEvent["partial"],
  ) => {
    const snap = stageSnapshot(diagnostics);
    const event: PipelineStreamEvent = {
      analysisId,
      stage,
      progress,
      timestamp: new Date().toISOString(),
      partial: {
        ...partial,
        stageState: snap.lastStageState,
        stageFailures: snap.stageFailures,
        evidenceCorrected: diagnostics.evidenceViolationsCorrected,
      },
    };
    await emitStream(analysisId, stage, progress, event.partial, stream);
    await onProgress(stage, progress, event);
  };

  const sourceFileTotal = countSourceFiles(snapshot);

  await report("parsing", 10);

  const parseOutcome = await runIsolatedStage(
    diagnostics,
    "parsing",
    async () => {
      const canIncremental =
        options.incrementalBaseSnapshot &&
        options.incrementalBaseArtifacts?.symbols?.length &&
        options.incrementalBaseArtifacts.dependencies;

      if (canIncremental) {
        const manifestDiff = diffSnapshots(options.incrementalBaseSnapshot!, snapshot);
        const changed = changedFilePaths(manifestDiff);
        const delta = await parseSnapshotPaths(snapshot, changed);
        const merged = mergeIncrementalParse({
          base: {
            symbols: options.incrementalBaseArtifacts!.symbols,
            dependencies: options.incrementalBaseArtifacts!.dependencies,
            parserStats: options.incrementalBaseArtifacts!.parserStats ?? {
              total: 0,
              skipped: 0,
              treesitter: 0,
              babel: 0,
              python: 0,
              go: 0,
              rust: 0,
              java: 0,
              csharp: 0,
              ruby: 0,
            },
          },
          delta,
          diff: diffSnapshots(options.incrementalBaseSnapshot!, snapshot, {
            baseSymbols: options.incrementalBaseArtifacts!.symbols,
            targetSymbols: delta.symbols,
          }),
          filesTotal: sourceFileTotal,
        });

        for (const failure of delta.failedFiles ?? []) {
          recordFailure(diagnostics, {
            stage: "parsing",
            scope: "file",
            target: failure.path,
            message: failure.error,
            degraded: true,
          });
        }

        return {
          symbols: merged.result.symbols,
          dependencies: merged.result.dependencies,
          parserStats: merged.result.parserStats,
          incrementalMetrics: merged.metrics,
        };
      }

      const parsed = await parseSnapshot(snapshot);
      for (const failure of parsed.failedFiles ?? []) {
        recordFailure(diagnostics, {
          stage: "parsing",
          scope: "file",
          target: failure.path,
          message: failure.error,
          degraded: true,
        });
      }

      return {
        symbols: parsed.symbols,
        dependencies: parsed.dependencies,
        parserStats: parsed.parserStats,
        incrementalMetrics: options.incrementalBaseSnapshot
          ? undefined
          : fullAnalysisMetrics(sourceFileTotal),
      };
    },
    () => ({
      symbols: [],
      dependencies: [],
      parserStats: {
        total: 0,
        skipped: sourceFileTotal,
        treesitter: 0,
        babel: 0,
        python: 0,
        go: 0,
        rust: 0,
        java: 0,
        csharp: 0,
        ruby: 0,
      },
      incrementalMetrics: undefined,
    }),
  );

  let { symbols, dependencies, parserStats, incrementalMetrics } = parseOutcome;

  await report("parsing", 20, {
    symbolCount: symbols.length,
    dependencyCount: dependencies.length,
    incrementalSavingsPercent: incrementalMetrics?.savingsPercent,
    failedFiles: diagnostics.failures.filter((f) => f.stage === "parsing").length,
  });

  const architecture = await runIsolatedStage(
    diagnostics,
    "reconstruction",
    async () => reconstructArchitecture(snapshot, symbols, dependencies),
    () => ({ services: [], modules: [], edges: [] } satisfies ArchitectureGraph),
  );

  await report("reconstruction", 45, {
    serviceCount: architecture.services.length,
    moduleCount: architecture.modules.length,
    dependencyCount: dependencies.length,
  });

  const evaluationOutcome = await runIsolatedStage(
    diagnostics,
    "evaluation",
    async () => {
      const parseEvidenceLedger = buildEvidenceFromParseResult({
        snapshotHash: snapshot.hash,
        symbols,
        dependencies,
      });
      const result = evaluateProject(snapshot, architecture, {
        symbols,
        dependencies,
        parseEvidence: parseEvidenceLedger.records,
      });
      let mergedFindings = result.findings;
      let marketplaceResults: MarketplaceAnalyzerRun[] | undefined;

      if (options.enabledMarketplaceAnalyzers?.length) {
        marketplaceResults = await runMarketplaceWithIsolation(
          snapshot,
          options.enabledMarketplaceAnalyzers,
          diagnostics,
        );
        mergedFindings = mergeMarketplaceFindings(mergedFindings, marketplaceResults);
      }

      return {
        scorecard: result.scorecard,
        findings: mergedFindings,
        marketplaceResults,
      };
    },
    () => ({
      scorecard: {
        overall: 0,
        maturityStage: "prototype" as const,
        domains: [],
      },
      findings: [
        degradedUnknownFinding(
          snapshot,
          "Evaluation degraded",
          "Heuristic evaluation failed; findings marked Unknown.",
        ),
      ],
      marketplaceResults: undefined,
    }),
  );

  let { scorecard, findings, marketplaceResults } = evaluationOutcome;

  const normalized = normalizeFindingsForCouncil(findings, snapshot, symbols);
  findings = normalized.findings;
  recordEvidenceCorrections(diagnostics, "evaluation", normalized.corrected);
  diagnostics.weakEvidenceFlags = normalized.flagged;
  diagnostics.confidenceBeforeCouncil = buildConfidenceSummary(findings);
  diagnostics.confidenceSummary = diagnostics.confidenceBeforeCouncil;

  const spatialGraph = await runIsolatedOperation(
    diagnostics,
    { stage: "evaluation", scope: "stage", target: "spatial_graph" },
    async () => {
      let graph = buildSpatialGraph({
        architecture,
        symbols,
        dependencies,
        findings,
        scorecard,
      });

      if (options.incrementalBaseSnapshot) {
        const baseParsed = options.incrementalBaseArtifacts
          ? { symbols: options.incrementalBaseArtifacts.symbols }
          : await parseSnapshot(options.incrementalBaseSnapshot);
        const diff = diffSnapshots(options.incrementalBaseSnapshot, snapshot, {
          baseSymbols: baseParsed.symbols,
          targetSymbols: symbols,
        });
        graph = applySpatialDiffOverlay(graph, diff);
        if (!incrementalMetrics) {
          incrementalMetrics = {
            mode: "incremental",
            filesTotal: sourceFileTotal,
            filesParsed: sourceFileTotal,
            filesSkipped: 0,
            computeUnitsFull: sourceFileTotal,
            computeUnitsActual: sourceFileTotal,
            savingsPercent: 0,
            changeRatio: diff.changeRatio,
          };
        }
      }

      return graph;
    },
    () => EMPTY_SPATIAL_GRAPH,
  );

  await report("evaluation", 65, {
    overallScore: scorecard.overall,
    findingCount: findings.length,
    confidenceSummary: diagnostics.confidenceSummary,
    evidenceCorrected: diagnostics.evidenceViolationsCorrected,
    weakEvidenceFlags: diagnostics.weakEvidenceFlags,
  });

  const council = await runIsolatedStage(
    diagnostics,
    "truth_council",
    async () =>
      runTruthCouncil(scorecard, findings, architecture, {
        useLlm: options.useLlmCouncil,
      }),
    () => runHeuristicTruthCouncil(scorecard, findings, architecture),
  );

  diagnostics.confidenceAfterCouncil = buildConfidenceSummary(
    council.adjustedFindings?.length ? council.adjustedFindings : findings,
  );
  if (council.adjustedFindings?.length) {
    findings = council.adjustedFindings;
  }
  diagnostics.confidenceSummary = diagnostics.confidenceAfterCouncil;

  await report("truth_council", 85, {
    consensusSummary: council.consensus.summary.slice(0, 240),
    findingCount: findings.length,
    llmPowered: council.llmPowered,
    llmFallbackReason: council.llmFallbackReason,
  });

  const roadmap = await runIsolatedStage(
    diagnostics,
    "planning",
    async () => buildRoadmap(findings),
    () => ({ tracks: { stabilize: [], complete: [], harden: [], optimize: [], scale: [] } }),
  );

  const taskCount = Object.values(roadmap.tracks).flat().length;
  await report("planning", 95, { taskCount, findingCount: findings.length });

  await report("completed", 100, {
    overallScore: scorecard.overall,
    findingCount: findings.length,
    taskCount,
    consensusSummary: council.consensus.summary.slice(0, 240),
    incrementalSavingsPercent: incrementalMetrics?.savingsPercent,
    confidenceSummary: diagnostics.confidenceSummary,
    stageFailures: diagnostics.failures.length,
  });

  return {
    snapshot,
    symbols,
    dependencies,
    architecture,
    scorecard,
    findings,
    consensus: council.consensus,
    roadmap,
    councilPhases: council.phases,
    contradictionRegister: council.contradictionRegister,
    modelNotes: council.modelNotes,
    analyzerVersion: ANALYZER_VERSION,
    parserStats,
    spatialGraph,
    llmPowered: council.llmPowered,
    llmFallbackReason: council.llmFallbackReason,
    llmCouncilMeta: council.llmPowered
      ? {
          provider: council.llmProvider,
          model: council.llmModel,
          estimatedCostUsd: council.llmEstimatedCostUsd,
          quotaDegraded: council.llmQuotaDegraded,
        }
      : council.llmQuotaDegraded
        ? { quotaDegraded: true }
        : undefined,
    incrementalMetrics,
    marketplaceResults,
    stageFailures: diagnostics.failures,
    diagnostics,
  };
}