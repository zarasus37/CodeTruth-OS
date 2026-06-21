import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const storeDir = path.join(repoRoot, ".data", "store");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function readJson(name) {
  try {
    return JSON.parse(await readFile(path.join(storeDir, name), "utf8"));
  } catch {
    return [];
  }
}

const prisma = new PrismaClient();

async function main() {
  const users = await readJson("users.json");
  const workspaces = await readJson("workspaces.json");
  const members = await readJson("workspace_members.json");
  const projects = await readJson("projects.json");
  const analyses = await readJson("analyses.json");
  const audit = await readJson("audit_log.json");

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        apiToken: user.apiToken,
        createdAt: new Date(user.createdAt),
      },
      update: {
        email: user.email,
        displayName: user.displayName,
        apiToken: user.apiToken,
      },
    });
  }

  for (const workspace of workspaces) {
    await prisma.workspace.upsert({
      where: { id: workspace.id },
      create: {
        id: workspace.id,
        name: workspace.name,
        createdAt: new Date(workspace.createdAt),
        createdBy: workspace.createdBy,
      },
      update: { name: workspace.name },
    });
  }

  for (const member of members) {
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: member.workspaceId,
          userId: member.userId,
        },
      },
      create: {
        workspaceId: member.workspaceId,
        userId: member.userId,
        role: member.role,
        joinedAt: new Date(member.joinedAt),
      },
      update: { role: member.role },
    });
  }

  for (const project of projects) {
    if (!project.workspaceId) continue;
    await prisma.project.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        workspaceId: project.workspaceId,
        name: project.name,
        createdAt: new Date(project.createdAt),
        latestSnapshotId: project.latestSnapshotId ?? null,
      },
      update: {
        name: project.name,
        latestSnapshotId: project.latestSnapshotId ?? null,
      },
    });
  }

  for (const analysis of analyses) {
    await prisma.analysis.upsert({
      where: { id: analysis.id },
      create: {
        id: analysis.id,
        projectId: analysis.projectId,
        snapshotId: analysis.snapshotId,
        status: analysis.status,
        progress: analysis.progress,
        error: analysis.error ?? null,
        createdAt: new Date(analysis.createdAt),
        completedAt: analysis.completedAt ? new Date(analysis.completedAt) : null,
        artifacts: analysis.artifacts ?? undefined,
      },
      update: {
        status: analysis.status,
        progress: analysis.progress,
        error: analysis.error ?? null,
        completedAt: analysis.completedAt ? new Date(analysis.completedAt) : null,
        artifacts: analysis.artifacts ?? undefined,
      },
    });
  }

  for (const entry of audit) {
    await prisma.auditLogEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        timestamp: new Date(entry.timestamp),
        metadata: entry.metadata ?? undefined,
      },
      update: {},
    });
  }

  console.log("Migration complete:");
  console.log(`  users: ${users.length}`);
  console.log(`  workspaces: ${workspaces.length}`);
  console.log(`  members: ${members.length}`);
  console.log(`  projects: ${projects.length}`);
  console.log(`  analyses: ${analyses.length}`);
  console.log(`  audit entries: ${audit.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });