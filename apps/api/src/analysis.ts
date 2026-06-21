import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@codetruth/core";
import type { AnalysisJob, AnalysisTriggerSource, Project, SnapshotRecord } from "@codetruth/core";
import {
  enqueueAnalysisJob,
  isQueueEnabled,
  processAnalysisJob,
  type AnalysisJobData,
} from "@codetruth/queue";
import { snapshotRoot, store } from "./context.js";
import { pingRedis } from "./integrations.js";

export interface StartAnalysisOptions {
  workspaceId: string;
  triggeredBy?: AnalysisTriggerSource;
  incrementalBaseSnapshotId?: string;
}

export async function startAnalysis(
  project: Project,
  snapshotId: string,
  options: StartAnalysisOptions,
): Promise<AnalysisJob> {
  const triggeredBy = options.triggeredBy ?? "manual";
  const analysis: AnalysisJob = {
    id: createId("analysis"),
    projectId: project.id,
    snapshotId,
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
    streamEvents: [],
    incrementalBaseSnapshotId: options.incrementalBaseSnapshotId,
    triggeredBy,
  };
  await store.saveAnalysis(analysis);

  const redisReachable = isQueueEnabled() ? await pingRedis() : false;

  if (redisReachable) {
    await enqueueAnalysisJob({
      analysisId: analysis.id,
      projectId: project.id,
      snapshotId,
      workspaceId: options.workspaceId,
      triggeredBy,
    });
    return analysis;
  }

  void processAnalysisJob(analysis.id, { store, snapshotRoot }).catch((error) => {
    console.error(`Inline analysis failed (${analysis.id}):`, error);
  });
  return analysis;
}

export async function persistSnapshot(snapshot: SnapshotRecord): Promise<void> {
  await writeFile(
    path.join(snapshot.rootPath, "snapshot.json"),
    JSON.stringify({ ...snapshot, rootPath: undefined }, null, 2),
    "utf8",
  );
}