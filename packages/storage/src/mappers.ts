import type { Prisma } from "@prisma/client";
import type {
  ActivationSurveyResponse,
  AnalysisJob,
  AuditLogEntry,
  AuthSession,
  BetaInvite,
  BetaRedemption,
  GitHubProjectConfig,
  OnboardingStep,
  PipelineArtifacts,
  ProductEvent,
  Project,
  SubscriptionPlan,
  SubscriptionStatus,
  User,
  UserOnboarding,
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
  betaAccessAt?: Date | null;
  betaInviteCode?: string | null;
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
    betaAccessAt: row.betaAccessAt?.toISOString(),
    betaInviteCode: row.betaInviteCode ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserOnboarding(row: {
  userId: string;
  completedSteps: unknown;
  firstAnalysisCompletedAt: Date | null;
  activationSurvey: unknown | null;
  activationSurveyAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}): UserOnboarding {
  return {
    userId: row.userId,
    completedSteps: (row.completedSteps as OnboardingStep[]) ?? [],
    firstAnalysisCompletedAt: row.firstAnalysisCompletedAt?.toISOString(),
    activationSurvey: row.activationSurvey
      ? (row.activationSurvey as ActivationSurveyResponse)
      : undefined,
    activationSurveyAt: row.activationSurveyAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProductEvent(row: {
  id: string;
  event: string;
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  analysisId: string | null;
  properties: unknown | null;
  timestamp: Date;
}): ProductEvent {
  return {
    id: row.id,
    event: row.event,
    userId: row.userId ?? undefined,
    workspaceId: row.workspaceId ?? undefined,
    projectId: row.projectId ?? undefined,
    analysisId: row.analysisId ?? undefined,
    properties: row.properties ? (row.properties as Record<string, unknown>) : undefined,
    timestamp: row.timestamp.toISOString(),
  };
}

export function toBetaInvite(row: {
  id: string;
  code: string;
  label: string | null;
  maxRedemptions: number;
  redemptionCount: number;
  grantsPlan: string;
  trialDays: number;
  expiresAt: Date | null;
  createdAt: Date;
}): BetaInvite {
  return {
    id: row.id,
    code: row.code,
    label: row.label ?? undefined,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    grantsPlan: row.grantsPlan as SubscriptionPlan,
    trialDays: row.trialDays,
    expiresAt: row.expiresAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toBetaRedemption(row: {
  id: string;
  inviteId: string;
  userId: string;
  workspaceId: string | null;
  redeemedAt: Date;
}): BetaRedemption {
  return {
    id: row.id,
    inviteId: row.inviteId,
    userId: row.userId,
    workspaceId: row.workspaceId ?? undefined,
    redeemedAt: row.redeemedAt.toISOString(),
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
  llmCostUsd?: number | null;
}): WorkspaceUsage {
  return {
    workspaceId: row.workspaceId,
    period: row.period,
    analysesCount: row.analysesCount,
    llmCouncilRuns: row.llmCouncilRuns,
    projectsCreated: row.projectsCreated,
    llmCostUsd: row.llmCostUsd ?? 0,
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