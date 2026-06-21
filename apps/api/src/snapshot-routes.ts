import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { SnapshotRecord } from "@codetruth/core";
import { diffSnapshots } from "@codetruth/ingestion";
import { parseSnapshot } from "@codetruth/parsing";
import { enforceFeatureGate } from "./billing-service.js";
import { authenticate } from "./auth.js";
import { snapshotRoot, store } from "./context.js";
import { requireWorkspaceAccess } from "./rbac.js";

async function loadSnapshot(snapshotId: string): Promise<SnapshotRecord | null> {
  const manifestPath = path.join(snapshotRoot, snapshotId, "snapshot.json");
  try {
    const raw = await readFile(manifestPath, "utf8");
    const snapshot = JSON.parse(raw) as SnapshotRecord;
    snapshot.rootPath = path.join(snapshotRoot, snapshotId);
    return snapshot;
  } catch {
    return null;
  }
}

export async function registerSnapshotRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { base?: string; symbols?: string } }>(
    "/snapshots/:id/diff",
    { preHandler: authenticate },
    async (request, reply) => {
      const target = await loadSnapshot(request.params.id);
      if (!target) return reply.code(404).send({ error: "Snapshot not found" });

      const project = await store.getProject(target.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
      if (!member) return;
      if (!(await enforceFeatureGate(project.workspaceId, "snapshot_history", reply))) return;

      const baseId = request.query.base ?? target.parentSnapshotId ?? project.latestSnapshotId;
      if (!baseId || baseId === target.id) {
        return reply.code(400).send({ error: "base snapshot query param or parentSnapshotId required" });
      }

      const base = await loadSnapshot(baseId);
      if (!base) return reply.code(404).send({ error: "Base snapshot not found" });

      const includeSymbols = request.query.symbols === "true" || request.query.symbols === "1";
      let diffOptions = {};

      if (includeSymbols) {
        const [baseParsed, targetParsed] = await Promise.all([
          parseSnapshot(base),
          parseSnapshot(target),
        ]);
        diffOptions = {
          baseSymbols: baseParsed.symbols,
          targetSymbols: targetParsed.symbols,
        };
      }

      return { diff: diffSnapshots(base, target, diffOptions) };
    },
  );
}