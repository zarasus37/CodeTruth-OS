import "./load-env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeQueueConnections,
  createAnalysisWorker,
  isQueueEnabled,
  startReAnalysisScheduler,
} from "@codetruth/queue";
import { createStore } from "@codetruth/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const dataRoot = path.join(repoRoot, ".data");
const snapshotRoot = path.join(dataRoot, "snapshots");

async function main() {
  if (!isQueueEnabled()) {
    console.error("REDIS_URL is required for the analysis worker.");
    process.exit(1);
  }

  const store = createStore({
    databaseUrl: process.env.DATABASE_URL,
    jsonRootDir: path.join(dataRoot, "store"),
  });
  await store.init();

  const worker = createAnalysisWorker({ store, snapshotRoot });
  const stopScheduler = startReAnalysisScheduler({ store, snapshotRoot });

  worker.on("completed", (job) => {
    console.log(`Analysis completed: ${job.data.analysisId}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Analysis failed: ${job?.data.analysisId ?? "unknown"}`, error.message);
  });

  console.log("CodeTruth analysis worker started");

  const shutdown = async () => {
    stopScheduler();
    await worker.close();
    await closeQueueConnections();
    await store.disconnect?.();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});