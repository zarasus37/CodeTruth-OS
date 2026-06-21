import type { Prisma } from "@prisma/client";
import type {
  AnalysisJob,
  AuditLogEntry,
  AuthSession,
  GitHubProjectConfig,
  PipelineArtifacts,
  Project,
  SubscriptionPlan,
  SubscriptionStatus,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceSubscription,
  WorkspaceUsage,
} from "@codetruth/core";

export function toUser(row: {
  id: string;
  email: string;
  displayName: string;
  apiToken: string;
  authProvider?: string | null;
  githubId?: string | null;
  googleId?: string | null;
  avatarUrl?: string | null;
  createdAt: Date;
}): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    apiToken: row.apiToken,
    authProvider: row.authProvider as User["authProvider"],
    githubId: row.githubId ?? undefined,
    googleId: row.googleId ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAuthSession(row: {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}): AuthSession {
  return {
    id: row.id,
    userId: row.userId,
    token: row.token,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWorkspaceSubscription(row: {
  workspaceId: string;
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  seatCount: number | null;
  updatedAt: Date;
}): WorkspaceSubscription {
  return {
    workspaceId: row.workspaceId,
    plan: row.plan as SubscriptionPlan,
    status: row.status as SubscriptionStatus,
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString(),
    seatCount: row.seatCount ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWorkspaceUsage(row: {
  workspaceId: string;
  period: string;
  analysesCount: number;
  llmCouncilRuns: number;
  projectsCreated: number;
}): WorkspaceUsage {
  return {
    workspaceId: row.workspaceId,
    period: row.period,
    analysesCount: row.analysesCount,
    llmCouncilRuns: row.llmCouncilRuns,
    projectsCreated: row.projectsCreated,
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