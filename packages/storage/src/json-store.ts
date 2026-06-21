import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AnalysisJob,
  AuditLogEntry,
  AuthSession,
  BetaInvite,
  BetaRedemption,
  CognitionActivityEvent,
  ComplianceAttestation,
  CustomCompliancePolicy,
  FindingAnnotation,
  FindingReview,
  ProductEvent,
  Project,
  ReAnalysisSchedule,
  ReportApproval,
  User,
  UserOnboarding,
  Workspace,
  WorkspaceMember,
  WorkspaceSubscription,
  WorkspaceUsage,
} from "@codetruth/core";
import type { DataStore } from "./interface.js";

export class JsonStore implements DataStore {
  constructor(private readonly rootDir: string) {}

  private file(name: string): string {
    return path.join(this.rootDir, name);
  }

  async init(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  private async readCollection<T>(name: string): Promise<T[]> {
    try {
      const raw = await readFile(this.file(name), "utf8");
      return JSON.parse(raw) as T[];
    } catch {
      return [];
    }
  }

  private async writeCollection<T>(name: string, items: T[]): Promise<void> {
    await writeFile(this.file(name), JSON.stringify(items, null, 2), "utf8");
  }

  async listUsers(): Promise<User[]> {
    return this.readCollection<User>("users.json");
  }

  async getUser(id: string): Promise<User | undefined> {
    return (await this.listUsers()).find((user) => user.id === id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    return (await this.listUsers()).find((user) => user.email === normalized);
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    return (await this.listUsers()).find((user) => user.apiToken === token);
  }

  async saveUser(user: User): Promise<void> {
    const users = await this.listUsers();
    const index = users.findIndex((item) => item.id === user.id);
    if (index >= 0) users[index] = user;
    else users.push(user);
    await this.writeCollection("users.json", users);
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    return (await this.listUsers()).find((user) => user.githubId === githubId);
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return (await this.listUsers()).find((user) => user.googleId === googleId);
  }

  async getSessionByToken(token: string): Promise<AuthSession | undefined> {
    return (await this.readCollection<AuthSession>("auth_sessions.json")).find(
      (session) => session.token === token,
    );
  }

  async saveSession(session: AuthSession): Promise<void> {
    const sessions = await this.readCollection<AuthSession>("auth_sessions.json");
    const index = sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) sessions[index] = session;
    else sessions.push(session);
    await this.writeCollection("auth_sessions.json", sessions);
  }

  async deleteSession(token: string): Promise<void> {
    const sessions = (await this.readCollection<AuthSession>("auth_sessions.json")).filter(
      (session) => session.token !== token,
    );
    await this.writeCollection("auth_sessions.json", sessions);
  }

  async deleteExpiredSessions(before = new Date().toISOString()): Promise<void> {
    const sessions = (await this.readCollection<AuthSession>("auth_sessions.json")).filter(
      (session) => session.expiresAt > before,
    );
    await this.writeCollection("auth_sessions.json", sessions);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.readCollection<Workspace>("workspaces.json");
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return (await this.listWorkspaces()).find((workspace) => workspace.id === id);
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    const workspaces = await this.listWorkspaces();
    const index = workspaces.findIndex((item) => item.id === workspace.id);
    if (index >= 0) workspaces[index] = workspace;
    else workspaces.push(workspace);
    await this.writeCollection("workspaces.json", workspaces);
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined> {
    return (await this.readCollection<WorkspaceMember>("workspace_members.json")).find(
      (member) => member.workspaceId === workspaceId && member.userId === userId,
    );
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return (await this.readCollection<WorkspaceMember>("workspace_members.json")).filter(
      (member) => member.workspaceId === workspaceId,
    );
  }

  async listUserWorkspaces(userId: string): Promise<WorkspaceMember[]> {
    return (await this.readCollection<WorkspaceMember>("workspace_members.json")).filter(
      (member) => member.userId === userId,
    );
  }

  async saveMember(member: WorkspaceMember): Promise<void> {
    const members = await this.readCollection<WorkspaceMember>("workspace_members.json");
    const index = members.findIndex(
      (item) => item.workspaceId === member.workspaceId && item.userId === member.userId,
    );
    if (index >= 0) members[index] = member;
    else members.push(member);
    await this.writeCollection("workspace_members.json", members);
  }

  async listProjects(workspaceId?: string): Promise<Project[]> {
    const projects = await this.readCollection<Project>("projects.json");
    if (!workspaceId) return projects;
    return projects.filter((project) => project.workspaceId === workspaceId);
  }

  async getProject(id: string): Promise<Project | undefined> {
    return (await this.listProjects()).find((project) => project.id === id);
  }

  async getProjectByGithub(owner: string, repo: string): Promise<Project | undefined> {
    const normalizedOwner = owner.toLowerCase();
    const normalizedRepo = repo.toLowerCase();
    return (await this.listProjects()).find(
      (project) =>
        project.github?.owner.toLowerCase() === normalizedOwner &&
        project.github?.repo.toLowerCase() === normalizedRepo,
    );
  }

  async saveProject(project: Project): Promise<void> {
    const projects = await this.readCollection<Project>("projects.json");
    const index = projects.findIndex((item) => item.id === project.id);
    if (index >= 0) projects[index] = project;
    else projects.push(project);
    await this.writeCollection("projects.json", projects);
  }

  async listAnalyses(projectId?: string): Promise<AnalysisJob[]> {
    const analyses = await this.readCollection<AnalysisJob>("analyses.json");
    if (!projectId) return analyses;
    return analyses.filter((analysis) => analysis.projectId === projectId);
  }

  async getAnalysis(id: string): Promise<AnalysisJob | undefined> {
    return (await this.listAnalyses()).find((analysis) => analysis.id === id);
  }

  async saveAnalysis(analysis: AnalysisJob): Promise<void> {
    const analyses = await this.listAnalyses();
    const index = analyses.findIndex((item) => item.id === analysis.id);
    if (index >= 0) analyses[index] = analysis;
    else analyses.push(analysis);
    await this.writeCollection("analyses.json", analyses);
  }

  async appendAudit(entry: AuditLogEntry): Promise<void> {
    const entries = await this.readCollection<AuditLogEntry>("audit_log.json");
    entries.push(entry);
    await this.writeCollection("audit_log.json", entries);
  }

  async listAudit(workspaceId: string, limit = 100): Promise<AuditLogEntry[]> {
    const entries = await this.readCollection<AuditLogEntry>("audit_log.json");
    return entries
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async listFindingReviews(analysisId: string): Promise<FindingReview[]> {
    return (await this.readCollection<FindingReview>("finding_reviews.json")).filter(
      (review) => review.analysisId === analysisId,
    );
  }

  async getFindingReview(analysisId: string, findingId: string): Promise<FindingReview | undefined> {
    return (await this.listFindingReviews(analysisId)).find((review) => review.findingId === findingId);
  }

  async saveFindingReview(review: FindingReview): Promise<void> {
    const reviews = await this.readCollection<FindingReview>("finding_reviews.json");
    const index = reviews.findIndex(
      (item) => item.analysisId === review.analysisId && item.findingId === review.findingId,
    );
    if (index >= 0) reviews[index] = review;
    else reviews.push(review);
    await this.writeCollection("finding_reviews.json", reviews);
  }

  async listFindingAnnotations(analysisId: string, findingId?: string): Promise<FindingAnnotation[]> {
    const annotations = (await this.readCollection<FindingAnnotation>("finding_annotations.json")).filter(
      (annotation) => annotation.analysisId === analysisId,
    );
    if (!findingId) return annotations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return annotations
      .filter((annotation) => annotation.findingId === findingId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveFindingAnnotation(annotation: FindingAnnotation): Promise<void> {
    const annotations = await this.readCollection<FindingAnnotation>("finding_annotations.json");
    annotations.push(annotation);
    await this.writeCollection("finding_annotations.json", annotations);
  }

  async getReportApproval(analysisId: string): Promise<ReportApproval | undefined> {
    return (await this.readCollection<ReportApproval>("report_approvals.json")).find(
      (approval) => approval.analysisId === analysisId,
    );
  }

  async saveReportApproval(approval: ReportApproval): Promise<void> {
    const approvals = await this.readCollection<ReportApproval>("report_approvals.json");
    const index = approvals.findIndex((item) => item.analysisId === approval.analysisId);
    if (index >= 0) approvals[index] = approval;
    else approvals.push(approval);
    await this.writeCollection("report_approvals.json", approvals);
  }

  async listReAnalysisSchedules(workspaceId?: string): Promise<ReAnalysisSchedule[]> {
    const schedules = await this.readCollection<ReAnalysisSchedule>("reanalysis_schedules.json");
    if (!workspaceId) return schedules;
    return schedules.filter((schedule) => schedule.workspaceId === workspaceId);
  }

  async getReAnalysisSchedule(id: string): Promise<ReAnalysisSchedule | undefined> {
    return (await this.listReAnalysisSchedules()).find((schedule) => schedule.id === id);
  }

  async getReAnalysisScheduleByProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ReAnalysisSchedule | undefined> {
    return (await this.listReAnalysisSchedules(workspaceId)).find(
      (schedule) => schedule.projectId === projectId,
    );
  }

  async saveReAnalysisSchedule(schedule: ReAnalysisSchedule): Promise<void> {
    const schedules = await this.listReAnalysisSchedules();
    const index = schedules.findIndex((item) => item.id === schedule.id);
    if (index >= 0) schedules[index] = schedule;
    else schedules.push(schedule);
    await this.writeCollection("reanalysis_schedules.json", schedules);
  }

  async listComplianceAttestations(workspaceId: string): Promise<ComplianceAttestation[]> {
    return (await this.readCollection<ComplianceAttestation>("compliance_attestations.json")).filter(
      (attestation) => attestation.workspaceId === workspaceId,
    );
  }

  async saveComplianceAttestation(attestation: ComplianceAttestation): Promise<void> {
    const attestations = await this.readCollection<ComplianceAttestation>(
      "compliance_attestations.json",
    );
    attestations.push(attestation);
    await this.writeCollection("compliance_attestations.json", attestations);
  }

  async appendCognitionActivity(event: CognitionActivityEvent): Promise<void> {
    const events = await this.readCollection<CognitionActivityEvent>("cognition_activity.json");
    events.push(event);
    await this.writeCollection("cognition_activity.json", events.slice(-5000));
  }

  async listCognitionActivity(
    workspaceId: string,
    limit = 100,
  ): Promise<CognitionActivityEvent[]> {
    const events = await this.readCollection<CognitionActivityEvent>("cognition_activity.json");
    return events
      .filter((event) => event.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async listCustomCompliancePolicies(workspaceId: string): Promise<CustomCompliancePolicy[]> {
    return (await this.readCollection<CustomCompliancePolicy>("custom_compliance_policies.json")).filter(
      (policy) => policy.workspaceId === workspaceId,
    );
  }

  async saveCustomCompliancePolicy(policy: CustomCompliancePolicy): Promise<void> {
    const policies = await this.readCollection<CustomCompliancePolicy>("custom_compliance_policies.json");
    const index = policies.findIndex((item) => item.id === policy.id);
    if (index >= 0) policies[index] = policy;
    else policies.push(policy);
    await this.writeCollection("custom_compliance_policies.json", policies);
  }

  async deleteCustomCompliancePolicy(workspaceId: string, policyId: string): Promise<void> {
    const policies = (await this.readCollection<CustomCompliancePolicy>("custom_compliance_policies.json")).filter(
      (policy) => !(policy.workspaceId === workspaceId && policy.id === policyId),
    );
    await this.writeCollection("custom_compliance_policies.json", policies);
  }

  async getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription | undefined> {
    return (await this.readCollection<WorkspaceSubscription>("workspace_subscriptions.json")).find(
      (subscription) => subscription.workspaceId === workspaceId,
    );
  }

  async saveWorkspaceSubscription(subscription: WorkspaceSubscription): Promise<void> {
    const subscriptions = await this.readCollection<WorkspaceSubscription>(
      "workspace_subscriptions.json",
    );
    const index = subscriptions.findIndex(
      (item) => item.workspaceId === subscription.workspaceId,
    );
    if (index >= 0) subscriptions[index] = subscription;
    else subscriptions.push(subscription);
    await this.writeCollection("workspace_subscriptions.json", subscriptions);
  }

  async getWorkspaceUsage(
    workspaceId: string,
    period: string,
  ): Promise<WorkspaceUsage | undefined> {
    return (await this.readCollection<WorkspaceUsage>("workspace_usage.json")).find(
      (usage) => usage.workspaceId === workspaceId && usage.period === period,
    );
  }

  async saveWorkspaceUsage(usage: WorkspaceUsage): Promise<void> {
    const records = await this.readCollection<WorkspaceUsage>("workspace_usage.json");
    const index = records.findIndex(
      (item) => item.workspaceId === usage.workspaceId && item.period === usage.period,
    );
    if (index >= 0) records[index] = usage;
    else records.push(usage);
    await this.writeCollection("workspace_usage.json", records);
  }

  async appendProductEvent(event: ProductEvent): Promise<void> {
    const events = await this.readCollection<ProductEvent>("product_events.json");
    events.push(event);
    await this.writeCollection("product_events.json", events.slice(-10_000));
  }

  async listProductEvents(limit = 500, event?: string): Promise<ProductEvent[]> {
    let events = await this.readCollection<ProductEvent>("product_events.json");
    if (event) events = events.filter((item) => item.event === event);
    return events
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async getUserOnboarding(userId: string): Promise<UserOnboarding | undefined> {
    return (await this.readCollection<UserOnboarding>("user_onboarding.json")).find(
      (item) => item.userId === userId,
    );
  }

  async saveUserOnboarding(onboarding: UserOnboarding): Promise<void> {
    const records = await this.readCollection<UserOnboarding>("user_onboarding.json");
    const index = records.findIndex((item) => item.userId === onboarding.userId);
    if (index >= 0) records[index] = onboarding;
    else records.push(onboarding);
    await this.writeCollection("user_onboarding.json", records);
  }

  async getBetaInviteByCode(code: string): Promise<BetaInvite | undefined> {
    const normalized = code.trim().toUpperCase();
    return (await this.readCollection<BetaInvite>("beta_invites.json")).find(
      (invite) => invite.code.toUpperCase() === normalized,
    );
  }

  async listBetaInvites(): Promise<BetaInvite[]> {
    return this.readCollection<BetaInvite>("beta_invites.json");
  }

  async saveBetaInvite(invite: BetaInvite): Promise<void> {
    const invites = await this.readCollection<BetaInvite>("beta_invites.json");
    const index = invites.findIndex((item) => item.id === invite.id);
    if (index >= 0) invites[index] = invite;
    else invites.push(invite);
    await this.writeCollection("beta_invites.json", invites);
  }

  async saveBetaRedemption(redemption: BetaRedemption): Promise<void> {
    const redemptions = await this.readCollection<BetaRedemption>("beta_redemptions.json");
    redemptions.push(redemption);
    await this.writeCollection("beta_redemptions.json", redemptions);
  }

  async listBetaRedemptions(userId?: string): Promise<BetaRedemption[]> {
    const redemptions = await this.readCollection<BetaRedemption>("beta_redemptions.json");
    if (!userId) return redemptions;
    return redemptions.filter((item) => item.userId === userId);
  }

  async countBetaRedemptions(): Promise<number> {
    return (await this.readCollection<BetaRedemption>("beta_redemptions.json")).length;
  }

  async setUserBetaAccess(userId: string, inviteCode: string, accessAt: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;
    user.betaAccessAt = accessAt;
    user.betaInviteCode = inviteCode;
    await this.saveUser(user);
  }

  async hasUserBetaAccess(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return Boolean(user?.betaAccessAt);
  }
}