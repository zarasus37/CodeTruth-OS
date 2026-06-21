import type { AnalysisStage, PipelineArtifacts, PipelineStreamEvent } from "@codetruth/core";
import type { SnapshotRecord } from "@codetruth/core";
import { evaluateProject } from "@codetruth/evaluation";
import { diffSnapshots } from "@codetruth/ingestion";
import { parseSnapshot } from "@codetruth/parsing";
import { buildRoadmap } from "@codetruth/planning";
import { reconstructArchitecture } from "@codetruth/reconstruction";
import { applySpatialDiffOverlay, buildSpatialGraph } from "@codetruth/spatial";
import { ANALYZER_VERSION } from "@codetruth/reports";
import { runTruthCouncil } from "@codetruth/truth-council";
import { emitStream, type StreamCallback } from "./streaming.js";

export type ProgressCallback = (
  stage: AnalysisStage,
  progress: number,
  event?: PipelineStreamEvent,
) => void | Promise<void>;

export interface RunPipelineOptions {
  analysisId?: string;
  onStream?: StreamCallback;
  incrementalBaseSnapshot?: SnapshotRecord;
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

  await report("parsing", 10);
  const { symbols, dependencies, parserStats } = await parseSnapshot(snapshot);
  await report("parsing", 20, {
    symbolCount: symbols.length,
    dependencyCount: dependencies.length,
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
    const baseParsed = await parseSnapshot(options.incrementalBaseSnapshot);
    const diff = diffSnapshots(options.incrementalBaseSnapshot, snapshot, {
      baseSymbols: baseParsed.symbols,
      targetSymbols: symbols,
    });
    spatialGraph = applySpatialDiffOverlay(spatialGraph, diff);
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
  const council = await runTruthCouncil(scorecard, findings, architecture);
  await report("truth_council", 85, {
    consensusSummary: council.consensus.summary.slice(0, 240),
    findingCount: findings.length,
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
    modelNotes: council.modelNotes,
    analyzerVersion: ANALYZER_VERSION,
    parserStats,
    spatialGraph,
    llmPowered: council.llmPowered,
    llmFallbackReason: council.llmFallbackReason,
  };
}