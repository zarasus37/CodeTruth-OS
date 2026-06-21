import type { AnalysisStage, IncrementalComputeMetrics, PipelineArtifacts, PipelineStreamEvent } from "@codetruth/core";
import type { SnapshotRecord } from "@codetruth/core";
import { evaluateProject } from "@codetruth/evaluation";
import { diffSnapshots } from "@codetruth/ingestion";
import { countSourceFiles, parseSnapshot, parseSnapshotPaths } from "@codetruth/parsing";
import { buildRoadmap } from "@codetruth/planning";
import { reconstructArchitecture } from "@codetruth/reconstruction";
import { applySpatialDiffOverlay, buildSpatialGraph } from "@codetruth/spatial";
import { ANALYZER_VERSION } from "@codetruth/reports";
import { runTruthCouncil } from "@codetruth/truth-council";
import { emitStream, type StreamCallback } from "./streaming.js";
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
  /** Cached artifacts from prior completed analysis (enables scoped re-parse). */
  incrementalBaseArtifacts?: PipelineArtifacts;
  useLlmCouncil?: boolean;
}

export async function runPipeline(
  snapshot: Parameters<typeof parseSnapshot>[0],
  onProgress: ProgressCallback = () => undefined,
  options: RunPipelineOptions = {},
): Promise<PipelineArtifacts> {
  const analysisId = options.analysisId ?? "inline";
  const stream = options.onStream;

  const report = async (
    stage: AnalysisStage,
    progress: number,
    partial?: PipelineStreamEvent["partial"],
  ) => {
    const event: PipelineStreamEvent = {
      analysisId,
      stage,
      progress,
      timestamp: new Date().toISOString(),
      partial,
    };
    await emitStream(analysisId, stage, progress, partial, stream);
    await onProgress(stage, progress, event);
  };

  let incrementalMetrics: IncrementalComputeMetrics | undefined;
  let symbols;
  let dependencies;
  let parserStats;

  await report("parsing", 10);

  const sourceFileTotal = countSourceFiles(snapshot);
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
    symbols = merged.result.symbols;
    dependencies = merged.result.dependencies;
    parserStats = merged.result.parserStats;
    incrementalMetrics = merged.metrics;
  } else {
    const parsed = await parseSnapshot(snapshot);
    symbols = parsed.symbols;
    dependencies = parsed.dependencies;
    parserStats = parsed.parserStats;
    incrementalMetrics = options.incrementalBaseSnapshot
      ? undefined
      : fullAnalysisMetrics(sourceFileTotal);
  }

  await report("parsing", 20, {
    symbolCount: symbols.length,
    dependencyCount: dependencies.length,
    incrementalSavingsPercent: incrementalMetrics?.savingsPercent,
  });

  await report("reconstruction", 35);
  const architecture = reconstructArchitecture(snapshot, symbols, dependencies);
  await report("reconstruction", 45, {
    serviceCount: architecture.services.length,
    moduleCount: architecture.modules.length,
    dependencyCount: dependencies.length,
  });

  await report("evaluation", 50);
  const { scorecard, findings } = evaluateProject(snapshot, architecture);
  let spatialGraph = buildSpatialGraph({
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
    spatialGraph = applySpatialDiffOverlay(spatialGraph, diff);
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

  await report("evaluation", 52, {
    serviceCount: architecture.services.length,
    moduleCount: architecture.modules.length,
    symbolCount: symbols.length,
  });

  await report("evaluation", 65, {
    overallScore: scorecard.overall,
    findingCount: findings.length,
  });

  await report("truth_council", 75);
  const council = await runTruthCouncil(scorecard, findings, architecture, {
    useLlm: options.useLlmCouncil,
  });
  await report("truth_council", 85, {
    consensusSummary: council.consensus.summary.slice(0, 240),
    findingCount: findings.length,
    llmPowered: council.llmPowered,
  });

  await report("planning", 90);
  const roadmap = buildRoadmap(findings);
  const taskCount = Object.values(roadmap.tracks).flat().length;
  await report("planning", 95, { taskCount, findingCount: findings.length });

  await report("completed", 100, {
    overallScore: scorecard.overall,
    findingCount: findings.length,
    taskCount,
    consensusSummary: council.consensus.summary.slice(0, 240),
    incrementalSavingsPercent: incrementalMetrics?.savingsPercent,
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
  };
}