import { Queue, type ConnectionOptions } from "bullmq";

export const ANALYSIS_QUEUE_NAME = "codetruth-analysis";

export interface AnalysisJobData {
  analysisId: string;
  projectId: string;
  snapshotId: string;
  workspaceId: string;
  triggeredBy: "upload" | "github_webhook" | "manual" | "scheduled" | "reanalysis";
}

let analysisQueue: Queue<AnalysisJobData> | undefined;

export function isQueueEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  return { url, maxRetriesPerRequest: null };
}

export function getAnalysisQueue(): Queue<AnalysisJobData> {
  if (!analysisQueue) {
    analysisQueue = new Queue<AnalysisJobData>(ANALYSIS_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
  }
  return analysisQueue;
}

export async function enqueueAnalysisJob(data: AnalysisJobData): Promise<string> {
  const job = await getAnalysisQueue().add("run-analysis", data, {
    jobId: data.analysisId,
  });
  return job.id ?? data.analysisId;
}

export async function closeAnalysisQueue(): Promise<void> {
  if (analysisQueue) {
    await analysisQueue.close();
    analysisQueue = undefined;
  }
}