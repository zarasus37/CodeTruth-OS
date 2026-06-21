import type { Prisma } from "@prisma/client";
import type {
  AnalysisJob,
  AuditLogEntry,
  GitHubProjectConfig,
  PipelineArtifacts,
  Project,
  User,
  Workspace,
  WorkspaceMember,
} from "@codetruth/core";

export function toUser(row: {
  id: string;
  email: string;
  displayName: string;
  apiToken: string;
  createdAt: Date;
}): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    apiToken: row.apiToken,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWorkspace(row: {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string;
}): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

export function toMember(row: {
  workspaceId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}): WorkspaceMember {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role as WorkspaceMember["role"],
    joinedAt: row.joinedAt.toISOString(),
  };
}

export function toProject(row: {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: Date;
  latestSnapshotId: string | null;
  githubConfig?: Prisma.JsonValue | null;
}): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    latestSnapshotId: row.latestSnapshotId ?? undefined,
    github: row.githubConfig
      ? (row.githubConfig as unknown as GitHubProjectConfig)
      : undefined,
  };
}

export function toAnalysis(row: {
  id: string;
  projectId: string;
  snapshotId: string;
  status: string;
  progress: number;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  artifacts: Prisma.JsonValue | null;
}): AnalysisJob {
  return {
    id: row.id,
    projectId: row.projectId,
    snapshotId: row.snapshotId,
    status: row.status as AnalysisJob["status"],
    progress: row.progress,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    artifacts: row.artifacts ? (row.artifacts as unknown as PipelineArtifacts) : undefined,
  };
}

export function toAudit(row: {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  timestamp: Date;
  metadata: Prisma.JsonValue | null;
}): AuditLogEntry {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId ?? undefined,
    timestamp: row.timestamp.toISOString(),
    metadata: row.metadata ? (row.metadata as unknown as Record<string, unknown>) : undefined,
  };
}