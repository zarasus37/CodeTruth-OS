export type { DataStore } from "./interface.js";
export { JsonStore } from "./json-store.js";
export { PostgresStore } from "./postgres-store.js";

import type { DataStore } from "./interface.js";
import { JsonStore } from "./json-store.js";
import { PostgresStore } from "./postgres-store.js";

export interface StoreOptions {
  databaseUrl?: string;
  jsonRootDir?: string;
}

export function createStore(options: StoreOptions = {}): DataStore {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
    return new PostgresStore();
  }

  if (!options.jsonRootDir) {
    throw new Error("jsonRootDir is required when DATABASE_URL is not set");
  }

  return new JsonStore(options.jsonRootDir);
}