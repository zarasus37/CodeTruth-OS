import { rm } from "node:fs/promises";
import type { Project, SnapshotRecord } from "@codetruth/core";
import { downloadRepositoryArchive } from "@codetruth/github";
import { ingestDirectory } from "@codetruth/ingestion";
import { persistSnapshot } from "./analysis.js";
import { snapshotRoot } from "./context.js";

export async function ingestGitHubRepository(options: {
  project: Project;
  owner: string;
  repo: string;
  ref: string;
  token?: string;
}): Promise<{ snapshot: SnapshotRecord; tempDir: string }> {
  const parentSnapshotId = options.project.latestSnapshotId;
  const tempDir = await downloadRepositoryArchive({
    owner: options.owner,
    repo: options.repo,
    ref: options.ref,
    token: options.token,
    installationId:
      options.project.github?.authMode === "app"
        ? options.project.github.installationId
        : undefined,
  });

  try {
    const snapshot = await ingestDirectory({
      projectId: options.project.id,
      sourceRoot: tempDir,
      destinationRoot: snapshotRoot,
      parentSnapshotId,
    });
    await persistSnapshot(snapshot);
    return { snapshot, tempDir };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}