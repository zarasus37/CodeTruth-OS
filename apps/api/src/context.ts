import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, type DataStore } from "@codetruth/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "../../..");
export const dataRoot = path.join(repoRoot, ".data");
export const uploadRoot = path.join(repoRoot, "uploads");
export const snapshotRoot = path.join(dataRoot, "snapshots");
export const webRoot = path.join(repoRoot, "apps/web/public");

export const storageBackend = process.env.DATABASE_URL ? "postgres" : "json";

export const store: DataStore = createStore({
  databaseUrl: process.env.DATABASE_URL,
  jsonRootDir: path.join(dataRoot, "store"),
});