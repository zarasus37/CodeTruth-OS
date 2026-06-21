import type {
  AnalysisJob,
  AuditLogEntry,
  AuthSession,
  CognitionActivityEvent,
  ComplianceAttestation,
  CustomCompliancePolicy,
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

export interface DataStore {
  init(): Promise<void>;
  disconnect?(): Promise<void>;
  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByToken(token: string): Promise<User | undefined>;
  getUserByGithubId(githubId: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  saveUser(user: User): Promise<void>;
  getSessionByToken(token: string): Promise<AuthSession | undefined>;
  saveSession(session: AuthSession): Promise<void>;
  deleteSession(token: string): Promise<void>;
  deleteExpiredSessions(before?: string): Promise<void>;
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  listUserWorkspaces(userId: string): Promise<WorkspaceMember[]>;
  saveMember(member: WorkspaceMember): Promise<void>;
  listProjects(workspaceId?: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  getProjectByGithub(owner: string, repo: string): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  listAnalyses(projectId?: string): Promise<AnalysisJob[]>;
  getAnalysis(id: string): Promise<AnalysisJob | undefined>;
  saveAnalysis(analysis: AnalysisJob): Promise<void>;
  appendAudit(entry: AuditLogEntry): Promise<void>;
  listAudit(workspaceId: string, limit?: number): Promise<AuditLogEntry[]>;
  listFindingReviews(analysisId: string): Promise<FindingReview[]>;
  getFindingReview(analysisId: string, findingId: string): Promise<FindingReview | undefined>;
  saveFindingReview(review: FindingReview): Promise<void>;
  listFindingAnnotations(analysisId: string, findingId?: string): Promise<FindingAnnotation[]>;
  saveFindingAnnotation(annotation: FindingAnnotation): Promise<void>;
  getReportApproval(analysisId: string): Promise<ReportApproval | undefined>;
  saveReportApproval(approval: ReportApproval): Promise<void>;
  listReAnalysisSchedules(workspaceId?: string): Promise<ReAnalysisSchedule[]>;
  getReAnalysisSchedule(id: string): Promise<ReAnalysisSchedule | undefined>;
  getReAnalysisScheduleByProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ReAnalysisSchedule | undefined>;
  saveReAnalysisSchedule(schedule: ReAnalysisSchedule): Promise<void>;
  listComplianceAttestations(workspaceId: string): Promise<ComplianceAttestation[]>;
  saveComplianceAttestation(attestation: ComplianceAttestation): Promise<void>;
  appendCognitionActivity(event: CognitionActivityEvent): Promise<void>;
  listCognitionActivity(workspaceId: string, limit?: number): Promise<CognitionActivityEvent[]>;
  listCustomCompliancePolicies(workspaceId: string): Promise<CustomCompliancePolicy[]>;
  saveCustomCompliancePolicy(policy: CustomCompliancePolicy): Promise<void>;
  deleteCustomCompliancePolicy(workspaceId: string, policyId: string): Promise<void>;
  getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription | undefined>;
  saveWorkspaceSubscription(subscription: WorkspaceSubscription): Promise<void>;
  getWorkspaceUsage(workspaceId: string, period: string): Promise<WorkspaceUsage | undefined>;
  saveWorkspaceUsage(usage: WorkspaceUsage): Promise<void>;
}