import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisJob, PipelineStreamEvent, SnapshotRecord } from "@codetruth/core";
import { createEmptyUsage, currentUsagePeriod, incrementUsage } from "@codetruth/billing";
import { activityFromAnalysis, createActivityEvent } from "@codetruth/cognition";
import { runPipeline } from "@codetruth/pipeline";
import type { DataStore } from "@codetruth/storage";
import { publishStreamEvent } from "./streaming.js";

export interface ProcessorOptions {
  store: DataStore;
  snapshotRoot: string;
}

async function appendStreamEvent(analysis: AnalysisJob, event: PipelineStreamEvent): Promise<void> {
  analysis.streamEvents = [...(analysis.streamEvents ?? []), event].slice(-200);
  await publishStreamEvent(event);
}

export async function processAnalysisJob(
  analysisId: string,
  options: ProcessorOptions,
): Promise<AnalysisJob> {
  const analysis = await options.store.getAnalysis(analysisId);
  if (!analysis) {
    throw new Error(`Analysis not found: ${analysisId}`);
  }

  try {
    const snapshotPath = path.join(options.snapshotRoot, analysis.snapshotId);
    const manifestPath = path.join(snapshotPath, "snapshot.json");
    const snapshotRaw = await readFile(manifestPath, "utf8");
    const snapshot = JSON.parse(snapshotRaw) as SnapshotRecord;
    snapshot.rootPath = snapshotPath;

    let incrementalBaseSnapshot: SnapshotRecord | undefined;
    if (analysis.incrementalBaseSnapshotId) {
      const basePath = path.join(options.snapshotRoot, analysis.incrementalBaseSnapshotId);
      try {
        const baseRaw = await readFile(path.join(basePath, "snapshot.json"), "utf8");
        incrementalBaseSnapshot = JSON.parse(baseRaw) as SnapshotRecord;
        incrementalBaseSnapshot.rootPath = basePath;
      } catch {
        incrementalBaseSnapshot = undefined;
      }
    }

    const artifacts = await runPipeline(
      snapshot,
      async (stage, progress, event) => {
        analysis.status = stage;
        analysis.progress = progress;
        if (event) await appendStreamEvent(analysis, event);
        await options.store.saveAnalysis(analysis);
      },
      {
        analysisId,
        onStream: (event) => appendStreamEvent(analysis, event),
        incrementalBaseSnapshot,
      },
    );

    analysis.status = "completed";
    analysis.progress = 100;
    analysis.completedAt = new Date().toISOString();
    analysis.artifacts = artifacts;
    await options.store.saveAnalysis(analysis);
    await recordAnalysisActivity(analysis, options.store, "analysis_completed");
    await recordLlmCouncilUsageIfNeeded(analysis, options.store);
    return analysis;
  } catch (error) {
    analysis.status = "failed";
    analysis.error = error instanceof Error ? error.message : "Unknown analysis failure";
    await options.store.saveAnalysis(analysis);
    await recordAnalysisActivity(analysis, options.store, "analysis_failed");
    throw error;
  }
}

async function recordLlmCouncilUsageIfNeeded(
  analysis: AnalysisJob,
  store: ProcessorOptions["store"],
): Promise<void> {
  if (!analysis.artifacts?.llmPowered) return;
  const project = await store.getProject(analysis.projectId);
  if (!project) return;

  const period = currentUsagePeriod();
  const usage =
    (await store.getWorkspaceUsage(project.workspaceId, period)) ??
    createEmptyUsage(project.workspaceId, period);
  await store.saveWorkspaceUsage(incrementUsage(usage, "llmCouncilRuns"));
}

async function recordAnalysisActivity(
  analysis: AnalysisJob,
  store: DataStore,
  fallbackType: "analysis_completed" | "analysis_failed",
): Promise<void> {
  const project = await store.getProject(analysis.projectId);
  if (!project) return;

  const event =
    activityFromAnalysis(project.workspaceId, analysis, project.name) ??
    createActivityEvent({
      workspaceId: project.workspaceId,
      projectId: analysis.projectId,
      analysisId: analysis.id,
      type: fallbackType,
      summary: `${project.name} analysis ${fallbackType === "analysis_completed" ? "completed" : "failed"}`,
      metadata: { triggeredBy: analysis.triggeredBy },
    });

  await store.appendCognitionActivity(event);

  const driftScore = analysis.artifacts?.spatialGraph?.diffOverlay?.driftScore;
  if (driftScore != null && driftScore >= 0.25) {
    await store.appendCognitionActivity(
      createActivityEvent({
        workspaceId: project.workspaceId,
        projectId: project.id,
        analysisId: analysis.id,
        type: "drift_alert",
        summary: `${project.name} drift alert · ${Math.round(driftScore * 100)}% change detected`,
        metadata: { driftScore },
      }),
    );
  }
}