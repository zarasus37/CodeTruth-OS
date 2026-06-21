import { Worker } from "bullmq";
import { processAnalysisJob, type ProcessorOptions } from "./processor.js";
import {
  ANALYSIS_QUEUE_NAME,
  closeAnalysisQueue,
  enqueueAnalysisJob,
  getRedisConnection,
  isQueueEnabled,
  type AnalysisJobData,
} from "./queue-client.js";

export { processAnalysisJob } from "./processor.js";
export type { ProcessorOptions } from "./processor.js";
export {
  runDueReAnalysisSchedules,
  startReAnalysisScheduler,
} from "./scheduler.js";
export type { SchedulerOptions } from "./scheduler.js";
export {
  ANALYSIS_QUEUE_NAME,
  enqueueAnalysisJob,
  getRedisConnection,
  isQueueEnabled,
} from "./queue-client.js";
export type { AnalysisJobData } from "./queue-client.js";
export {
  closeStreamConnections,
  isStreamPubSubEnabled,
  publishStreamEvent,
  subscribeStreamEvents,
} from "./streaming.js";

export function createAnalysisWorker(options: ProcessorOptions): Worker<AnalysisJobData> {
  return new Worker<AnalysisJobData>(
    ANALYSIS_QUEUE_NAME,
    async (job) => {
      await processAnalysisJob(job.data.analysisId, options);
    },
    {
      connection: getRedisConnection(),
      concurrency: Number(process.env.ANALYSIS_WORKER_CONCURRENCY ?? 2),
    },
  );
}

export async function closeQueueConnections(): Promise<void> {
  const { closeStreamConnections } = await import("./streaming.js");
  await closeStreamConnections();
  await closeAnalysisQueue();
}