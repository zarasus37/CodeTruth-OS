export type ConfidenceLevel =
  | "Confirmed"
  | "Strongly Inferred"
  | "Weakly Inferred"
  | "Unknown"
  | "Contradicted";

export type SeverityLevel =
  | "Critical blocker"
  | "High-risk flaw"
  | "Medium-priority weakness"
  | "Low-priority debt"
  | "Informational observation";

export type ScoringDomain =
  | "code structure"
  | "build readiness"
  | "runtime readiness"
  | "test maturity"
  | "security posture"
  | "DevOps maturity"
  | "observability"
  | "documentation"
  | "product completeness"
  | "integration health";

export type GapCategory =
  | "CI/CD pipeline"
  | "secrets management"
  | "authentication system"
  | "error tracking"
  | "monitoring and alerting"
  | "backup and recovery"
  | "test layers"
  | "health checks"
  | "migration management"
  | "release workflow"
  | "environment configuration"
  | "documentation surfaces";

export type AnalysisStage =
  | "queued"
  | "ingestion"
  | "parsing"
  | "reconstruction"
  | "evaluation"
  | "truth_council"
  | "planning"
  | "completed"
  | "failed";

export type EffortBand = "XS" | "S" | "M" | "L" | "XL";

export type PlanningTrack =
  | "stabilize"
  | "complete"
  | "harden"
  | "optimize"
  | "scale";

export interface EvidenceRecord {
  snapshotHash: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  symbolId?: string;
  snippet?: string;
  extractionMethod: "AST" | "pattern_match" | "inference" | "config_parse";
}

export interface FileManifestEntry {
  path: string;
  hash: string;
  size: number;
  language?: string;
}

export interface DetectedStackProfile {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  containerization: string[];
  infrastructureAsCode: string[];
  cicd: string[];
  testFrameworks: string[];
}

export interface SnapshotRecord {
  id: string;
  projectId: string;
  hash: string;
  createdAt: string;
  fileCount: number;
  manifest: FileManifestEntry[];
  stackProfile: DetectedStackProfile;
  rootPath: string;
  parentSnapshotId?: string;
}

export interface SnapshotDiff {
  baseSnapshotId: string;
  targetSnapshotId: string;
  added: FileManifestEntry[];
  removed: FileManifestEntry[];
  modified: Array<{ path: string; beforeHash: string; afterHash: string; sizeDelta: number }>;
  unchanged: number;
  changeRatio: number;
  /** V2: per-language file change counts */
  languageBreakdown?: LanguageDiffStats[];
  /** V2: symbol-level drift between snapshots */
  symbolChanges?: SymbolDiffEntry[];
  /** V2: composite drift score 0–1 (files + symbols) */
  driftScore?: number;
}

export interface LanguageDiffStats {
  language: string;
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export interface SymbolDiffEntry {
  name: string;
  kind: SymbolRecord["kind"];
  filePath: string;
  change: "added" | "removed" | "modified";
  line?: number;
}

export type SpatialNodeKind =
  | "service"
  | "module"
  | "file"
  | "symbol"
  | "finding"
  | "domain";

export interface SpatialPosition {
  x: number;
  y: number;
  z: number;
}

export type SpatialDiffState = "added" | "removed" | "modified" | "unchanged";

export interface SpatialNode {
  id: string;
  kind: SpatialNodeKind;
  label: string;
  confidence?: ConfidenceLevel;
  severity?: SeverityLevel;
  score?: number;
  filePath?: string;
  domain?: ScoringDomain;
  position: SpatialPosition;
  /** V2.1: snapshot diff overlay */
  diffState?: SpatialDiffState;
  meta?: Record<string, string | number>;
}

export interface SpatialEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  weight: number;
}

export interface SpatialLayer {
  z: number;
  label: string;
  nodeKind: SpatialNodeKind;
}

export interface SpatialGraph {
  nodes: SpatialNode[];
  edges: SpatialEdge[];
  bounds: { min: SpatialPosition; max: SpatialPosition };
  layers: SpatialLayer[];
  /** V2.1: attached snapshot diff summary when incremental */
  diffOverlay?: Pick<
    SnapshotDiff,
    "baseSnapshotId" | "targetSnapshotId" | "driftScore" | "changeRatio"
  >;
}

export type ComplianceFramework = "soc2" | "iso27001" | "nist_csf" | "custom";

export type ComplianceControlStatus = "passing" | "failing" | "not_applicable";

export interface ComplianceControl {
  id: string;
  framework: ComplianceFramework;
  title: string;
  description: string;
  domains: ScoringDomain[];
  gapCategories?: GapCategory[];
  severityThreshold: SeverityLevel;
}

export interface CustomCompliancePolicy {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  domains: ScoringDomain[];
  gapCategories?: GapCategory[];
  severityThreshold: SeverityLevel;
  createdAt: string;
  createdBy: string;
}

export interface ComplianceViolation {
  controlId: string;
  controlTitle: string;
  findingId: string;
  findingTitle: string;
  severity: SeverityLevel;
  domain: ScoringDomain;
  status: "open" | "mitigated" | "accepted";
}

export interface ComplianceScorecard {
  framework: ComplianceFramework;
  overallScore: number;
  controlsTotal: number;
  controlsPassing: number;
  controlsFailing: number;
  violations: ComplianceViolation[];
  attestationStatus: "none" | "pending" | "attested" | "expired";
}

export interface ProjectCompliancePosture {
  projectId: string;
  projectName: string;
  analysisId?: string;
  scorecards: ComplianceScorecard[];
  overallComplianceScore: number;
}

export interface PortfolioComplianceView {
  workspaceId: string;
  projects: ProjectCompliancePosture[];
  aggregateComplianceScore: number;
  openViolations: number;
  frameworkBreakdown: Record<
    ComplianceFramework,
    { passing: number; failing: number; score: number }
  >;
}

export type ReAnalysisInterval = "6h" | "12h" | "24h" | "7d" | "30d";

export interface ReAnalysisSchedule {
  id: string;
  workspaceId: string;
  projectId: string;
  enabled: boolean;
  interval: ReAnalysisInterval;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  createdBy: string;
}

export type CognitionActivityType =
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed"
  | "reanalysis_scheduled"
  | "reanalysis_triggered"
  | "compliance_violation"
  | "drift_alert";

export interface CognitionActivityEvent {
  id: string;
  workspaceId: string;
  projectId?: string;
  analysisId?: string;
  type: CognitionActivityType;
  timestamp: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface ComplianceAttestation {
  id: string;
  workspaceId: string;
  projectId?: string;
  framework: ComplianceFramework;
  attestedBy: string;
  attestedAt: string;
  expiresAt?: string;
  signature?: string;
  notes?: string;
}

export interface PortfolioTrendPoint {
  projectId: string;
  projectName: string;
  analysisId: string;
  completedAt: string;
  overallScore: number;
  findingCount: number;
  driftScore?: number;
  complianceScore?: number;
}

export interface PortfolioProjectEntry {
  projectId: string;
  projectName: string;
  analysisId?: string;
  snapshotId?: string;
  overallScore?: number;
  maturityStage?: BuildStateScorecard["maturityStage"];
  findingCount?: number;
  driftScore?: number;
  complianceScore?: number;
  openViolations?: number;
  languages: string[];
  updatedAt?: string;
}

export interface PortfolioView {
  workspaceId: string;
  projects: PortfolioProjectEntry[];
  aggregateScore: number;
  aggregateComplianceScore: number;
  projectCount: number;
  maturityDistribution: Record<BuildStateScorecard["maturityStage"], number>;
  driftAlerts: Array<{ projectId: string; projectName: string; driftScore: number }>;
}

export interface InstitutionalPortfolioView extends PortfolioView {
  compliance: PortfolioComplianceView;
  trendSeries: PortfolioTrendPoint[];
  recentActivity: CognitionActivityEvent[];
  schedules: ReAnalysisSchedule[];
}

export interface PortfolioSpatialGraph extends SpatialGraph {
  projects: Array<{ projectId: string; projectName: string; analysisId: string; offset: SpatialPosition }>;
}

export interface ParserStats {
  babel: number;
  python: number;
  go: number;
  rust: number;
  java: number;
  csharp: number;
  ruby: number;
  treesitter: number;
  skipped: number;
  total: number;
}

export interface PipelineStreamEvent {
  analysisId: string;
  stage: AnalysisStage;
  progress: number;
  timestamp: string;
  partial?: {
    symbolCount?: number;
    dependencyCount?: number;
    serviceCount?: number;
    moduleCount?: number;
    overallScore?: number;
    findingCount?: number;
    consensusSummary?: string;
    taskCount?: number;
    incrementalSavingsPercent?: number;
    llmPowered?: boolean;
  };
}

export interface SymbolRecord {
  id: string;
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "export" | "import";
  filePath: string;
  line?: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: "imports" | "depends_on" | "calls";
}

export interface ServiceNode {
  id: string;
  name: string;
  confidence: ConfidenceLevel;
  evidence: EvidenceRecord[];
}

export interface ArchitectureGraph {
  services: ServiceNode[];
  modules: Array<{ id: string; name: string; serviceId?: string; confidence: ConfidenceLevel }>;
  edges: Array<{ from: string; to: string; kind: string; confidence: ConfidenceLevel }>;
}

export interface DomainScore {
  domain: ScoringDomain;
  score: number;
  confidence: ConfidenceLevel;
  rationale: string;
}

export interface Finding {
  id: string;
  domain: ScoringDomain;
  severity: SeverityLevel;
  confidence: ConfidenceLevel;
  title: string;
  description: string;
  evidence: EvidenceRecord[];
  remediationPath?: string;
  gapCategory?: GapCategory;
  contradicted?: boolean;
}

export interface BuildStateScorecard {
  overall: number;
  maturityStage: "prototype" | "developing" | "production_candidate" | "production_ready";
  domains: DomainScore[];
}

export interface ConsensusTruthReport {
  summary: string;
  confirmedClaims: string[];
  inferredClaims: string[];
  contradictions: string[];
  unknowns: string[];
}

export interface PlannerTask {
  id: string;
  title: string;
  description: string;
  effort: EffortBand;
  track: PlanningTrack;
  prerequisites: string[];
  acceptanceCriteria: string[];
  findingIds: string[];
}

export interface PhasedRoadmap {
  tracks: Record<PlanningTrack, PlannerTask[]>;
}

export interface ContradictionRecord {
  id: string;
  claim: string;
  challenge: string;
  models: string[];
  severity: "resolved" | "unresolved";
}

export interface CouncilPhaseResult {
  phase: "independent" | "cross_review" | "consensus";
  modelAssessments: Record<string, string[]>;
  contradictions: ContradictionRecord[];
}

export interface IncrementalComputeMetrics {
  mode: "full" | "incremental";
  filesTotal: number;
  filesParsed: number;
  filesSkipped: number;
  computeUnitsFull: number;
  computeUnitsActual: number;
  /** Percent compute saved vs full re-parse (0–100). */
  savingsPercent: number;
  changeRatio: number;
  /** True when small diff meets Phase C 85% savings gate. */
  meetsSavingsTarget?: boolean;
}

export interface LlmCouncilRunMeta {
  provider?: string;
  model?: string;
  estimatedCostUsd?: number;
  quotaDegraded?: boolean;
}

export interface PipelineArtifacts {
  snapshot: SnapshotRecord;
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
  architecture: ArchitectureGraph;
  scorecard: BuildStateScorecard;
  findings: Finding[];
  consensus: ConsensusTruthReport;
  roadmap: PhasedRoadmap;
  councilPhases?: CouncilPhaseResult[];
  contradictionRegister?: ContradictionRecord[];
  modelNotes?: Record<string, string[]>;
  analyzerVersion?: string;
  parserStats?: ParserStats;
  spatialGraph?: SpatialGraph;
  llmPowered?: boolean;
  llmFallbackReason?: string;
  llmCouncilMeta?: LlmCouncilRunMeta;
  incrementalMetrics?: IncrementalComputeMetrics;
}

export type FindingReviewStatus = "pending" | "accepted" | "rejected" | "deferred";

export interface FindingReview {
  id: string;
  analysisId: string;
  findingId: string;
  workspaceId: string;
  status: FindingReviewStatus;
  rationale?: string;
  deferUntil?: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface FindingAnnotation {
  id: string;
  analysisId: string;
  findingId: string;
  workspaceId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export type ReportApprovalStatus = "draft" | "pending_review" | "approved" | "rejected";

export interface ReportApproval {
  id: string;
  analysisId: string;
  workspaceId: string;
  status: ReportApprovalStatus;
  submittedBy?: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rationale?: string;
  signature?: string;
  signedAt?: string;
  analyzerVersion: string;
}

export type TaskExportFormat = "github" | "jira" | "linear" | "csv";

export interface ExportedTask {
  externalId?: string;
  title: string;
  description: string;
  labels: string[];
  effort: EffortBand;
  track: PlanningTrack;
  acceptanceCriteria: string[];
  findingIds: string[];
}

export type WorkspaceRole = "owner" | "admin" | "engineer" | "reviewer" | "viewer";

export type Permission =
  | "workspace:manage"
  | "workspace:invite"
  | "project:create"
  | "analysis:trigger"
  | "report:view"
  | "finding:annotate"
  | "report:approve"
  | "task:export";

export type AuthProvider = "email" | "github" | "google";

export type SubscriptionPlan = "free" | "pro" | "team" | "enterprise";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export type BillingFeature =
  | "continuous_analysis"
  | "webhooks"
  | "live_reanalysis"
  | "spatial_navigator"
  | "exports"
  | "snapshot_history"
  | "llm_council"
  | "portfolio"
  | "compliance_audit_export"
  | "rbac_advanced"
  | "team_seats"
  | "quality_gate";

export interface User {
  id: string;
  email: string;
  displayName: string;
  apiToken: string;
  createdAt: string;
  authProvider?: AuthProvider;
  githubId?: string;
  googleId?: string;
  avatarUrl?: string;
  betaAccessAt?: string;
  betaInviteCode?: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface WorkspaceSubscription {
  workspaceId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  seatCount?: number;
  updatedAt: string;
}

export interface WorkspaceUsage {
  workspaceId: string;
  /** Billing period key, e.g. 2026-06 */
  period: string;
  analysesCount: number;
  llmCouncilRuns: number;
  projectsCreated: number;
  /** Estimated LLM spend this period (USD) for tier cost caps. */
  llmCostUsd?: number;
}

export type ProductEventName =
  | "user.signed_up"
  | "user.signed_in"
  | "workspace.created"
  | "project.created"
  | "analysis.started"
  | "analysis.completed"
  | "analysis.failed"
  | "onboarding.step_completed"
  | "onboarding.completed"
  | "activation.survey_submitted"
  | "beta.invite_redeemed"
  | "billing.checkout_started"
  | "billing.upgrade_blocked"
  | "billing.upgrade_prompt_shown"
  | "feature.used"
  | "evidence.drilldown_clicked"
  | "evidence.ledger_opened"
  | "contradiction.viewed"
  | "finding.override"
  | "activation.moment_viewed"
  | "incremental.savings";

export interface ProductEvent {
  id: string;
  event: ProductEventName | string;
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  analysisId?: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

export type OnboardingStep =
  | "welcome"
  | "create_workspace"
  | "create_project"
  | "connect_github"
  | "first_upload"
  | "view_report"
  | "activation_survey";

export interface ActivationSurveyResponse {
  unknownFindingsCount: number;
  feltActivationMoment: boolean;
  notes?: string;
}

export interface UserOnboarding {
  userId: string;
  completedSteps: OnboardingStep[];
  firstAnalysisCompletedAt?: string;
  activationSurvey?: ActivationSurveyResponse;
  activationSurveyAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface BetaInvite {
  id: string;
  code: string;
  label?: string;
  maxRedemptions: number;
  redemptionCount: number;
  grantsPlan: SubscriptionPlan;
  trialDays: number;
  expiresAt?: string;
  createdAt: string;
}

export interface BetaRedemption {
  id: string;
  inviteId: string;
  userId: string;
  workspaceId?: string;
  redeemedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type GitHubAuthMode = "pat" | "app";

export interface GitHubProjectConfig {
  owner: string;
  repo: string;
  defaultBranch: string;
  webhookSecret: string;
  connectedAt: string;
  authMode?: GitHubAuthMode;
  installationId?: number;
}

export interface QualityGatePolicy {
  /** Severities that fail CI / merge checks. */
  blockSeverities: SeverityLevel[];
  /** Optional minimum overall score (0–100). */
  minOverallScore?: number;
}

export interface QualityGateResult {
  passed: boolean;
  analysisId?: string;
  snapshotId?: string;
  overallScore?: number;
  blockedFindings: Array<Pick<Finding, "id" | "title" | "severity" | "domain" | "description">>;
  policy: QualityGatePolicy;
  summary: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  latestSnapshotId?: string;
  github?: GitHubProjectConfig;
  qualityGate?: QualityGatePolicy;
}

export type AnalysisTriggerSource =
  | "upload"
  | "github_webhook"
  | "manual"
  | "scheduled"
  | "reanalysis";

export interface AnalysisJob {
  id: string;
  projectId: string;
  snapshotId: string;
  status: AnalysisStage;
  progress: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
  artifacts?: PipelineArtifacts;
  streamEvents?: PipelineStreamEvent[];
  incrementalBaseSnapshotId?: string;
  triggeredBy?: AnalysisTriggerSource;
}

export interface TruthReport {
  analysisId: string;
  projectId: string;
  snapshotId: string;
  generatedAt: string;
  executiveSummary: string;
  scorecard: BuildStateScorecard;
  findings: Finding[];
  consensus: ConsensusTruthReport;
  roadmap: PhasedRoadmap;
  councilPhases?: CouncilPhaseResult[];
  contradictionRegister?: ContradictionRecord[];
  modelNotes?: Record<string, string[]>;
  llmCouncilMeta?: LlmCouncilRunMeta;
  incrementalMetrics?: IncrementalComputeMetrics;
  approval?: ReportApproval;
  reviews?: FindingReview[];
  annotations?: FindingAnnotation[];
}