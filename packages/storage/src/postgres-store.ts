import { Prisma, PrismaClient } from "@prisma/client";
import type {
  AnalysisJob,
  AuditLogEntry,
  AuthSession,
  CognitionActivityEvent,
  ComplianceAttestation,
  ComplianceFramework,
  CustomCompliancePolicy,
  GapCategory,
  ScoringDomain,
  SeverityLevel,
  FindingAnnotation,
  FindingReview,
  Project,
  ReAnalysisSchedule,
  ReportApproval,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceSubscription,
  WorkspaceUsage,
} from "@codetruth/core";
import type { DataStore } from "./interface.js";
import {
  toAnalysis,
  toAudit,
  toAuthSession,
  toMember,
  toProject,
  toUser,
  toWorkspace,
  toWorkspaceSubscription,
  toWorkspaceUsage,
} from "./mappers.js";

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PostgresStore implements DataStore {
  private readonly prisma = new PrismaClient();

  async init(): Promise<void> {
    try {
      await this.prisma.$connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error";
      throw new Error(
        `PostgreSQL connection failed (${message}). Start Postgres with 'npm run db:up' and apply schema with 'npm run db:push', or unset DATABASE_URL to use JSON storage.`,
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async listUsers(): Promise<User[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toUser);
  }

  async getUser(id: string): Promise<User | undefined> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return row ? toUser(row) : undefined;
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    const row = await this.prisma.user.findUnique({ where: { apiToken: token } });
    return row ? toUser(row) : undefined;
  }

  async saveUser(user: User): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        apiToken: user.apiToken,
        authProvider: user.authProvider ?? null,
        githubId: user.githubId ?? null,
        googleId: user.googleId ?? null,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: new Date(user.createdAt),
      },
      update: {
        email: user.email,
        displayName: user.displayName,
        apiToken: user.apiToken,
        authProvider: user.authProvider ?? null,
        githubId: user.githubId ?? null,
        googleId: user.googleId ?? null,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    const row = await this.prisma.user.findUnique({ where: { githubId } });
    return row ? toUser(row) : undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const row = await this.prisma.user.findUnique({ where: { googleId } });
    return row ? toUser(row) : undefined;
  }

  async getSessionByToken(token: string): Promise<AuthSession | undefined> {
    const row = await this.prisma.authSession.findUnique({ where: { token } });
    return row ? toAuthSession(row) : undefined;
  }

  async saveSession(session: AuthSession): Promise<void> {
    await this.prisma.authSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        userId: session.userId,
        token: session.token,
        expiresAt: new Date(session.expiresAt),
        createdAt: new Date(session.createdAt),
      },
      update: {
        expiresAt: new Date(session.expiresAt),
      },
    });
  }

  async deleteSession(token: string): Promise<void> {
    await this.prisma.authSession.deleteMany({ where: { token } });
  }

  async deleteExpiredSessions(before = new Date().toISOString()): Promise<void> {
    await this.prisma.authSession.deleteMany({
      where: { expiresAt: { lt: new Date(before) } },
    });
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const rows = await this.prisma.workspace.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toWorkspace);
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const row = await this.prisma.workspace.findUnique({ where: { id } });
    return row ? toWorkspace(row) : undefined;
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    await this.prisma.workspace.upsert({
      where: { id: workspace.id },
      create: {
        id: workspace.id,
        name: workspace.name,
        createdAt: new Date(workspace.createdAt),
        createdBy: workspace.createdBy,
      },
      update: {
        name: workspace.name,
      },
    });
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined> {
    const row = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return row ? toMember(row) : undefined;
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { joinedAt: "asc" },
    });
    return rows.map(toMember);
  }

  async listUserWorkspaces(userId: string): Promise<WorkspaceMember[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { joinedAt: "asc" },
    });
    return rows.map(toMember);
  }

  async saveMember(member: WorkspaceMember): Promise<void> {
    await this.prisma.workspaceMember.upsert({
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
      update: {
        role: member.role,
      },
    });
  }

  async listProjects(workspaceId?: string): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toProject);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const row = await this.prisma.project.findUnique({ where: { id } });
    return row ? toProject(row) : undefined;
  }

  async getProjectByGithub(owner: string, repo: string): Promise<Project | undefined> {
    const rows = await this.prisma.project.findMany();
    const normalizedOwner = owner.toLowerCase();
    const normalizedRepo = repo.toLowerCase();
    const row = rows.find((project) => {
      if (!project.githubConfig || typeof project.githubConfig !== "object") return false;
      const config = project.githubConfig as { owner?: string; repo?: string };
      return (
        config.owner?.toLowerCase() === normalizedOwner &&
        config.repo?.toLowerCase() === normalizedRepo
      );
    });
    return row ? toProject(row) : undefined;
  }

  async saveProject(project: Project): Promise<void> {
    await this.prisma.project.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        workspaceId: project.workspaceId,
        name: project.name,
        createdAt: new Date(project.createdAt),
        latestSnapshotId: project.latestSnapshotId ?? null,
        githubConfig: toJsonValue(project.github),
      },
      update: {
        name: project.name,
        latestSnapshotId: project.latestSnapshotId ?? null,
        githubConfig: toJsonValue(project.github),
      },
    });
  }

  async listAnalyses(projectId?: string): Promise<AnalysisJob[]> {
    const rows = await this.prisma.analysis.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toAnalysis);
  }

  async getAnalysis(id: string): Promise<AnalysisJob | undefined> {
    const row = await this.prisma.analysis.findUnique({ where: { id } });
    return row ? toAnalysis(row) : undefined;
  }

  async saveAnalysis(analysis: AnalysisJob): Promise<void> {
    await this.prisma.analysis.upsert({
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
        artifacts: toJsonValue(analysis.artifacts),
      },
      update: {
        status: analysis.status,
        progress: analysis.progress,
        error: analysis.error ?? null,
        completedAt: analysis.completedAt ? new Date(analysis.completedAt) : null,
        artifacts: toJsonValue(analysis.artifacts),
      },
    });
  }

  async appendAudit(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        id: entry.id,
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        timestamp: new Date(entry.timestamp),
        metadata: toJsonValue(entry.metadata),
      },
    });
  }

  async listAudit(workspaceId: string, limit = 100): Promise<AuditLogEntry[]> {
    const rows = await this.prisma.auditLogEntry.findMany({
      where: { workspaceId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    return rows.map(toAudit);
  }

  async listFindingReviews(analysisId: string): Promise<FindingReview[]> {
    const rows = await this.prisma.findingReview.findMany({ where: { analysisId } });
    return rows.map((row) => ({
      id: row.id,
      analysisId: row.analysisId,
      findingId: row.findingId,
      workspaceId: row.workspaceId,
      status: row.status as FindingReview["status"],
      rationale: row.rationale ?? undefined,
      deferUntil: row.deferUntil?.toISOString(),
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt.toISOString(),
    }));
  }

  async getFindingReview(analysisId: string, findingId: string): Promise<FindingReview | undefined> {
    const row = await this.prisma.findingReview.findUnique({
      where: { analysisId_findingId: { analysisId, findingId } },
    });
    if (!row) return undefined;
    return {
      id: row.id,
      analysisId: row.analysisId,
      findingId: row.findingId,
      workspaceId: row.workspaceId,
      status: row.status as FindingReview["status"],
      rationale: row.rationale ?? undefined,
      deferUntil: row.deferUntil?.toISOString(),
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt.toISOString(),
    };
  }

  async saveFindingReview(review: FindingReview): Promise<void> {
    await this.prisma.findingReview.upsert({
      where: { analysisId_findingId: { analysisId: review.analysisId, findingId: review.findingId } },
      create: {
        id: review.id,
        analysisId: review.analysisId,
        findingId: review.findingId,
        workspaceId: review.workspaceId,
        status: review.status,
        rationale: review.rationale ?? null,
        deferUntil: review.deferUntil ? new Date(review.deferUntil) : null,
        reviewedBy: review.reviewedBy,
        reviewedAt: new Date(review.reviewedAt),
      },
      update: {
        status: review.status,
        rationale: review.rationale ?? null,
        deferUntil: review.deferUntil ? new Date(review.deferUntil) : null,
        reviewedBy: review.reviewedBy,
        reviewedAt: new Date(review.reviewedAt),
      },
    });
  }

  async listFindingAnnotations(analysisId: string, findingId?: string): Promise<FindingAnnotation[]> {
    const rows = await this.prisma.findingAnnotation.findMany({
      where: { analysisId, ...(findingId ? { findingId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      analysisId: row.analysisId,
      findingId: row.findingId,
      workspaceId: row.workspaceId,
      userId: row.userId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async saveFindingAnnotation(annotation: FindingAnnotation): Promise<void> {
    await this.prisma.findingAnnotation.create({
      data: {
        id: annotation.id,
        analysisId: annotation.analysisId,
        findingId: annotation.findingId,
        workspaceId: annotation.workspaceId,
        userId: annotation.userId,
        body: annotation.body,
        createdAt: new Date(annotation.createdAt),
      },
    });
  }

  async getReportApproval(analysisId: string): Promise<ReportApproval | undefined> {
    const row = await this.prisma.reportApproval.findUnique({ where: { analysisId } });
    if (!row) return undefined;
    return {
      id: row.id,
      analysisId: row.analysisId,
      workspaceId: row.workspaceId,
      status: row.status as ReportApproval["status"],
      submittedBy: row.submittedBy ?? undefined,
      submittedAt: row.submittedAt?.toISOString(),
      reviewedBy: row.reviewedBy ?? undefined,
      reviewedAt: row.reviewedAt?.toISOString(),
      rationale: row.rationale ?? undefined,
      signature: row.signature ?? undefined,
      signedAt: row.signedAt?.toISOString(),
      analyzerVersion: row.analyzerVersion,
    };
  }

  async saveReportApproval(approval: ReportApproval): Promise<void> {
    await this.prisma.reportApproval.upsert({
      where: { analysisId: approval.analysisId },
      create: {
        id: approval.id,
        analysisId: approval.analysisId,
        workspaceId: approval.workspaceId,
        status: approval.status,
        submittedBy: approval.submittedBy ?? null,
        submittedAt: approval.submittedAt ? new Date(approval.submittedAt) : null,
        reviewedBy: approval.reviewedBy ?? null,
        reviewedAt: approval.reviewedAt ? new Date(approval.reviewedAt) : null,
        rationale: approval.rationale ?? null,
        signature: approval.signature ?? null,
        signedAt: approval.signedAt ? new Date(approval.signedAt) : null,
        analyzerVersion: approval.analyzerVersion,
      },
      update: {
        status: approval.status,
        submittedBy: approval.submittedBy ?? null,
        submittedAt: approval.submittedAt ? new Date(approval.submittedAt) : null,
        reviewedBy: approval.reviewedBy ?? null,
        reviewedAt: approval.reviewedAt ? new Date(approval.reviewedAt) : null,
        rationale: approval.rationale ?? null,
        signature: approval.signature ?? null,
        signedAt: approval.signedAt ? new Date(approval.signedAt) : null,
        analyzerVersion: approval.analyzerVersion,
      },
    });
  }

  async listReAnalysisSchedules(workspaceId?: string): Promise<ReAnalysisSchedule[]> {
    const rows = await this.prisma.reAnalysisSchedule.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      enabled: row.enabled,
      interval: row.interval as ReAnalysisSchedule["interval"],
      lastRunAt: row.lastRunAt?.toISOString(),
      nextRunAt: row.nextRunAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    }));
  }

  async getReAnalysisSchedule(id: string): Promise<ReAnalysisSchedule | undefined> {
    const row = await this.prisma.reAnalysisSchedule.findUnique({ where: { id } });
    if (!row) return undefined;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      enabled: row.enabled,
      interval: row.interval as ReAnalysisSchedule["interval"],
      lastRunAt: row.lastRunAt?.toISOString(),
      nextRunAt: row.nextRunAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    };
  }

  async getReAnalysisScheduleByProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ReAnalysisSchedule | undefined> {
    const row = await this.prisma.reAnalysisSchedule.findUnique({
      where: { workspaceId_projectId: { workspaceId, projectId } },
    });
    if (!row) return undefined;
    return this.getReAnalysisSchedule(row.id);
  }

  async saveReAnalysisSchedule(schedule: ReAnalysisSchedule): Promise<void> {
    await this.prisma.reAnalysisSchedule.upsert({
      where: { id: schedule.id },
      create: {
        id: schedule.id,
        workspaceId: schedule.workspaceId,
        projectId: schedule.projectId,
        enabled: schedule.enabled,
        interval: schedule.interval,
        lastRunAt: schedule.lastRunAt ? new Date(schedule.lastRunAt) : null,
        nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
        createdAt: new Date(schedule.createdAt),
        createdBy: schedule.createdBy,
      },
      update: {
        enabled: schedule.enabled,
        interval: schedule.interval,
        lastRunAt: schedule.lastRunAt ? new Date(schedule.lastRunAt) : null,
        nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
      },
    });
  }

  async listComplianceAttestations(workspaceId: string): Promise<ComplianceAttestation[]> {
    const rows = await this.prisma.complianceAttestation.findMany({
      where: { workspaceId },
      orderBy: { attestedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      projectId: row.projectId ?? undefined,
      framework: row.framework as ComplianceFramework,
      attestedBy: row.attestedBy,
      attestedAt: row.attestedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString(),
      signature: row.signature ?? undefined,
      notes: row.notes ?? undefined,
    }));
  }

  async saveComplianceAttestation(attestation: ComplianceAttestation): Promise<void> {
    await this.prisma.complianceAttestation.create({
      data: {
        id: attestation.id,
        workspaceId: attestation.workspaceId,
        projectId: attestation.projectId ?? null,
        framework: attestation.framework,
        attestedBy: attestation.attestedBy,
        attestedAt: new Date(attestation.attestedAt),
        expiresAt: attestation.expiresAt ? new Date(attestation.expiresAt) : null,
        signature: attestation.signature ?? null,
        notes: attestation.notes ?? null,
      },
    });
  }

  async appendCognitionActivity(event: CognitionActivityEvent): Promise<void> {
    await this.prisma.cognitionActivity.create({
      data: {
        id: event.id,
        workspaceId: event.workspaceId,
        projectId: event.projectId ?? null,
        analysisId: event.analysisId ?? null,
        type: event.type,
        timestamp: new Date(event.timestamp),
        summary: event.summary,
        metadata: toJsonValue(event.metadata),
      },
    });
  }

  async listCognitionActivity(
    workspaceId: string,
    limit = 100,
  ): Promise<CognitionActivityEvent[]> {
    const rows = await this.prisma.cognitionActivity.findMany({
      where: { workspaceId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      projectId: row.projectId ?? undefined,
      analysisId: row.analysisId ?? undefined,
      type: row.type as CognitionActivityEvent["type"],
      timestamp: row.timestamp.toISOString(),
      summary: row.summary,
      metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    }));
  }

  async listCustomCompliancePolicies(workspaceId: string): Promise<CustomCompliancePolicy[]> {
    const rows = await this.prisma.customCompliancePolicy.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      title: row.title,
      description: row.description,
      domains: row.domains as ScoringDomain[],
      gapCategories: (row.gapCategories as GapCategory[] | null) ?? undefined,
      severityThreshold: row.severityThreshold as SeverityLevel,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    }));
  }

  async saveCustomCompliancePolicy(policy: CustomCompliancePolicy): Promise<void> {
    await this.prisma.customCompliancePolicy.upsert({
      where: { id: policy.id },
      create: {
        id: policy.id,
        workspaceId: policy.workspaceId,
        title: policy.title,
        description: policy.description,
        domains: toJsonValue(policy.domains)!,
        gapCategories: toJsonValue(policy.gapCategories),
        severityThreshold: policy.severityThreshold,
        createdAt: new Date(policy.createdAt),
        createdBy: policy.createdBy,
      },
      update: {
        title: policy.title,
        description: policy.description,
        domains: toJsonValue(policy.domains)!,
        gapCategories: toJsonValue(policy.gapCategories),
        severityThreshold: policy.severityThreshold,
      },
    });
  }

  async deleteCustomCompliancePolicy(workspaceId: string, policyId: string): Promise<void> {
    await this.prisma.customCompliancePolicy.deleteMany({
      where: { workspaceId, id: policyId },
    });
  }

  async getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription | undefined> {
    const row = await this.prisma.workspaceSubscription.findUnique({
      where: { workspaceId },
    });
    return row ? toWorkspaceSubscription(row) : undefined;
  }

  async saveWorkspaceSubscription(subscription: WorkspaceSubscription): Promise<void> {
    await this.prisma.workspaceSubscription.upsert({
      where: { workspaceId: subscription.workspaceId },
      create: {
        workspaceId: subscription.workspaceId,
        plan: subscription.plan,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId ?? null,
        stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd)
          : null,
        seatCount: subscription.seatCount ?? null,
        updatedAt: new Date(subscription.updatedAt),
      },
      update: {
        plan: subscription.plan,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId ?? null,
        stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd)
          : null,
        seatCount: subscription.seatCount ?? null,
        updatedAt: new Date(subscription.updatedAt),
      },
    });
  }

  async getWorkspaceUsage(
    workspaceId: string,
    period: string,
  ): Promise<WorkspaceUsage | undefined> {
    const row = await this.prisma.workspaceUsage.findUnique({
      where: { workspaceId_period: { workspaceId, period } },
    });
    return row ? toWorkspaceUsage(row) : undefined;
  }

  async saveWorkspaceUsage(usage: WorkspaceUsage): Promise<void> {
    await this.prisma.workspaceUsage.upsert({
      where: { workspaceId_period: { workspaceId: usage.workspaceId, period: usage.period } },
      create: {
        workspaceId: usage.workspaceId,
        period: usage.period,
        analysesCount: usage.analysesCount,
        llmCouncilRuns: usage.llmCouncilRuns,
        projectsCreated: usage.projectsCreated,
      },
      update: {
        analysesCount: usage.analysesCount,
        llmCouncilRuns: usage.llmCouncilRuns,
        projectsCreated: usage.projectsCreated,
      },
    });
  }
}