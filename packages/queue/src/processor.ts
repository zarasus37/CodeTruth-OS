import { readFile } from "node:fs/promises";
import path from "node:path";
import { createId, type AnalysisJob, type PipelineStreamEvent, type SnapshotRecord } from "@codetruth/core";
import {
  addLlmCost,
  canUseLlmCouncil,
  createEmptyUsage,
  currentUsagePeriod,
  hasFeature,
  incrementUsage,
} from "@codetruth/billing";
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

function findBaseArtifacts(
  analyses: AnalysisJob[],
  baseSnapshotId: string,
): AnalysisJob["artifacts"] | undefined {
  return analyses
    .filter(
      (a) =>
        a.status === "completed" &&
        a.snapshotId === baseSnapshotId &&
        a.artifacts?.symbols?.length,
    )
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0]?.artifacts;
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
    let incrementalBaseArtifacts: AnalysisJob["artifacts"];
    if (analysis.incrementalBaseSnapshotId) {
      const basePath = path.join(options.snapshotRoot, analysis.incrementalBaseSnapshotId);
      try {
        const baseRaw = await readFile(path.join(basePath, "snapshot.json"), "utf8");
        incrementalBaseSnapshot = JSON.parse(baseRaw) as SnapshotRecord;
        incrementalBaseSnapshot.rootPath = basePath;
      } catch {
        incrementalBaseSnapshot = undefined;
      }

      const projectAnalyses = await options.store.listAnalyses(analysis.projectId);
      incrementalBaseArtifacts = findBaseArtifacts(
        projectAnalyses,
        analysis.incrementalBaseSnapshotId,
      );
    }

    const project = await options.store.getProject(analysis.projectId);
    let useLlmCouncil = false;
    let enabledMarketplaceAnalyzers: string[] | undefined;
    if (project) {
      const period = currentUsagePeriod();
      const subscription =
        (await options.store.getWorkspaceSubscription(project.workspaceId)) ?? {
          workspaceId: project.workspaceId,
          plan: "free" as const,
          status: "active" as const,
          updatedAt: new Date().toISOString(),
        };
      const usage =
        (await options.store.getWorkspaceUsage(project.workspaceId, period)) ??
        createEmptyUsage(project.workspaceId, period);
      useLlmCouncil = canUseLlmCouncil({ subscription, usage });

      const workspace = await options.store.getWorkspace(project.workspaceId);
      const enabled = workspace?.settings?.enabledMarketplaceAnalyzers ?? [];
      if (enabled.length && hasFeature(subscription, "marketplace_analyzers")) {
        enabledMarketplaceAnalyzers = enabled;
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
        incrementalBaseArtifacts,
        useLlmCouncil,
        enabledMarketplaceAnalyzers,
      },
    );

    analysis.status = "completed";
    analysis.progress = 100;
    analysis.completedAt = new Date().toISOString();
    analysis.artifacts = artifacts;
    await options.store.saveAnalysis(analysis);
    await recordMarketplaceRuns(analysis, options.store);
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

async function recordMarketplaceRuns(
  analysis: AnalysisJob,
  store: ProcessorOptions["store"],
): Promise<void> {
  const runs = analysis.artifacts?.marketplaceResults;
  if (!runs?.length) return;

  const project = await store.getProject(analysis.projectId);
  if (!project) return;

  for (const run of runs) {
    await store.appendProductEvent({
      id: createId("evt"),
      event: "marketplace.analyzer_run",
      workspaceId: project.workspaceId,
      projectId: project.id,
      analysisId: analysis.id,
      properties: {
        analyzerId: run.analyzerId,
        category: run.category,
        findingCount: run.findings.length,
        durationMs: run.durationMs,
      },
      timestamp: new Date().toISOString(),
    });
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

  let next = incrementUsage(usage, "llmCouncilRuns");
  const cost = analysis.artifacts.llmCouncilMeta?.estimatedCostUsd;
  if (cost && cost > 0) {
    next = addLlmCost(next, cost);
  }
  await store.saveWorkspaceUsage(next);
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

  const savings = analysis.artifacts?.incrementalMetrics;
  if (savings?.mode === "incremental") {
    await store.appendCognitionActivity(
      createActivityEvent({
        workspaceId: project.workspaceId,
        projectId: project.id,
        analysisId: analysis.id,
        type: "analysis_completed",
        summary: `${project.name} incremental analysis saved ${savings.savingsPercent}% compute`,
        metadata: {
          savingsPercent: savings.savingsPercent,
          changeRatio: savings.changeRatio,
          meetsSavingsTarget: savings.meetsSavingsTarget,
        },
      }),
    );
  }
}