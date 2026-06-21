import { createId } from "@codetruth/core";
import type { AnalysisJob, Project, ReAnalysisSchedule } from "@codetruth/core";
import {
  advanceSchedule,
  createActivityEvent,
  scheduleIsDue,
} from "@codetruth/cognition";
import type { DataStore } from "@codetruth/storage";
import { processAnalysisJob, type ProcessorOptions } from "./processor.js";
import { enqueueAnalysisJob, isQueueEnabled } from "./queue-client.js";

export interface SchedulerOptions extends ProcessorOptions {
  pollIntervalMs?: number;
}

async function triggerScheduledReAnalysis(
  schedule: ReAnalysisSchedule,
  project: Project,
  options: SchedulerOptions,
): Promise<AnalysisJob | undefined> {
  if (!project.latestSnapshotId) return undefined;

  const analyses = await options.store.listAnalyses(project.id);
  const previous = analyses
    .filter((a) => a.status === "completed")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];

  const analysis: AnalysisJob = {
    id: createId("analysis"),
    projectId: project.id,
    snapshotId: project.latestSnapshotId,
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
    streamEvents: [],
    incrementalBaseSnapshotId: previous?.snapshotId,
    triggeredBy: "scheduled",
  };

  await options.store.saveAnalysis(analysis);

  if (isQueueEnabled()) {
    await enqueueAnalysisJob({
      analysisId: analysis.id,
      projectId: project.id,
      snapshotId: project.latestSnapshotId,
      workspaceId: schedule.workspaceId,
      triggeredBy: "scheduled",
    });
  } else {
    void processAnalysisJob(analysis.id, options).catch(() => undefined);
  }

  await options.store.appendCognitionActivity(
    createActivityEvent({
      workspaceId: schedule.workspaceId,
      projectId: project.id,
      analysisId: analysis.id,
      type: "reanalysis_triggered",
      summary: `Scheduled re-analysis started for ${project.name}`,
      metadata: { scheduleId: schedule.id, interval: schedule.interval },
    }),
  );

  return analysis;
}

export async function runDueReAnalysisSchedules(options: SchedulerOptions): Promise<number> {
  const schedules = await options.store.listReAnalysisSchedules();
  let triggered = 0;

  for (const schedule of schedules) {
    if (!scheduleIsDue(schedule)) continue;

    const project = await options.store.getProject(schedule.projectId);
    if (!project || project.workspaceId !== schedule.workspaceId) continue;

    await triggerScheduledReAnalysis(schedule, project, options);
    await options.store.saveReAnalysisSchedule(advanceSchedule(schedule));
    triggered += 1;
  }

  return triggered;
}

export function startReAnalysisScheduler(options: SchedulerOptions): () => void {
  const pollIntervalMs = options.pollIntervalMs ?? 60_000;
  const timer = setInterval(() => {
    void runDueReAnalysisSchedules(options).catch((error) => {
      console.error("Re-analysis scheduler tick failed:", error);
    });
  }, pollIntervalMs);

  void runDueReAnalysisSchedules(options).catch((error) => {
    console.error("Re-analysis scheduler initial tick failed:", error);
  });

  return () => clearInterval(timer);
}