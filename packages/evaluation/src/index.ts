import { createId } from "@codetruth/core";
import type {
  ArchitectureGraph,
  BuildStateScorecard,
  Finding,
  GapCategory,
  ScoringDomain,
  SeverityLevel,
  SnapshotRecord,
} from "@codetruth/core";

export interface EvaluationResult {
  scorecard: BuildStateScorecard;
  findings: Finding[];
}

function hasPath(snapshot: SnapshotRecord, matcher: (path: string) => boolean): boolean {
  return snapshot.manifest.some((entry) => matcher(entry.path.replace(/\\/g, "/")));
}

function makeFinding(input: {
  domain: ScoringDomain;
  severity: SeverityLevel;
  title: string;
  description: string;
  gapCategory?: GapCategory;
  filePath?: string;
  snapshot: SnapshotRecord;
}): Finding {
  return {
    id: createId("find"),
    domain: input.domain,
    severity: input.severity,
    confidence: input.filePath ? "Confirmed" : "Strongly Inferred",
    title: input.title,
    description: input.description,
    gapCategory: input.gapCategory,
    evidence: [
      {
        snapshotHash: input.snapshot.hash,
        filePath: input.filePath ?? "repository",
        extractionMethod: input.filePath ? "config_parse" : "inference",
        snippet: input.description,
      },
    ],
    remediationPath: `Address ${input.title.toLowerCase()} before production deployment.`,
  };
}

function scoreDomain(present: boolean, partial = false): number {
  if (present) return 85;
  if (partial) return 55;
  return 35;
}

export function evaluateProject(
  snapshot: SnapshotRecord,
  architecture: ArchitectureGraph,
): EvaluationResult {
  const findings: Finding[] = [];
  const paths = snapshot.manifest.map((entry) => entry.path.replace(/\\/g, "/"));

  const hasPackageJson = paths.includes("package.json");
  const hasReadme = paths.some((p) => /^readme(\.|$)/i.test(p.split("/").pop() ?? ""));
  const hasTests = paths.some((p) => /(test|spec)\.(ts|js|tsx|jsx|py)$/i.test(p));
  const hasCi = paths.some((p) => p.startsWith(".github/workflows/"));
  const hasDocker = paths.some((p) => p.toLowerCase().includes("dockerfile") || p.endsWith("docker-compose.yml"));
  const hasEnvExample = paths.some((p) => p === ".env.example" || p.endsWith("/.env.example"));
  const hasAuthHints = paths.some((p) => /auth|jwt|session|oauth/i.test(p));
  const hasMonitoringHints = paths.some((p) => /sentry|datadog|prometheus|opentelemetry/i.test(p));
  const hasHealthHints = paths.some((p) => /health|ready|live/i.test(p));
  const hasMigrations = paths.some((p) => /migration|alembic|prisma\/schema/i.test(p));

  if (!hasCi) {
    findings.push(
      makeFinding({
        domain: "DevOps maturity",
        severity: "High-risk flaw",
        title: "Missing CI/CD pipeline",
        description: "No GitHub Actions or equivalent CI workflow detected.",
        gapCategory: "CI/CD pipeline",
        snapshot,
      }),
    );
  }

  if (!hasEnvExample) {
    findings.push(
      makeFinding({
        domain: "runtime readiness",
        severity: "Medium-priority weakness",
        title: "Missing environment configuration template",
        description: "No .env.example or documented environment template found.",
        gapCategory: "environment configuration",
        snapshot,
      }),
    );
  }

  if (!hasTests) {
    findings.push(
      makeFinding({
        domain: "test maturity",
        severity: "High-risk flaw",
        title: "No automated test suite detected",
        description: "No test or spec files were found in the repository.",
        gapCategory: "test layers",
        snapshot,
      }),
    );
  }

  if (!hasReadme) {
    findings.push(
      makeFinding({
        domain: "documentation",
        severity: "Medium-priority weakness",
        title: "Missing README documentation",
        description: "No README file detected for onboarding and operational context.",
        gapCategory: "documentation surfaces",
        snapshot,
      }),
    );
  }

  if (!hasAuthHints) {
    findings.push(
      makeFinding({
        domain: "security posture",
        severity: "Medium-priority weakness",
        title: "Authentication surface not evidenced",
        description: "No auth-related modules or configuration were detected.",
        gapCategory: "authentication system",
        snapshot,
      }),
    );
  }

  if (!hasMonitoringHints) {
    findings.push(
      makeFinding({
        domain: "observability",
        severity: "Medium-priority weakness",
        title: "Monitoring and error tracking not evidenced",
        description: "No monitoring, tracing, or error tracking integration detected.",
        gapCategory: "monitoring and alerting",
        snapshot,
      }),
    );
  }

  if (!hasHealthHints) {
    findings.push(
      makeFinding({
        domain: "runtime readiness",
        severity: "Low-priority debt",
        title: "Health check endpoints not detected",
        description: "No explicit health/readiness endpoint patterns found.",
        gapCategory: "health checks",
        snapshot,
      }),
    );
  }

  if (!hasMigrations && paths.some((p) => /prisma|sqlalchemy|django/i.test(p))) {
    findings.push(
      makeFinding({
        domain: "integration health",
        severity: "Low-priority debt",
        title: "Database migration workflow not evidenced",
        description: "Data layer detected without clear migration management artifacts.",
        gapCategory: "migration management",
        snapshot,
      }),
    );
  }

  const domains = [
    {
      domain: "code structure" as ScoringDomain,
      score: Math.min(95, 50 + architecture.modules.length * 4 + architecture.services.length * 5),
      confidence: "Strongly Inferred" as const,
      rationale: `${architecture.modules.length} modules and ${architecture.services.length} services inferred.`,
    },
    {
      domain: "build readiness" as ScoringDomain,
      score: scoreDomain(hasPackageJson),
      confidence: hasPackageJson ? "Confirmed" as const : "Weakly Inferred" as const,
      rationale: hasPackageJson ? "package.json present." : "No package manifest detected.",
    },
    {
      domain: "runtime readiness" as ScoringDomain,
      score: scoreDomain(hasDocker, hasEnvExample),
      confidence: "Strongly Inferred" as const,
      rationale: "Runtime packaging and environment readiness assessed from config artifacts.",
    },
    {
      domain: "test maturity" as ScoringDomain,
      score: scoreDomain(hasTests),
      confidence: hasTests ? "Confirmed" as const : "Strongly Inferred" as const,
      rationale: hasTests ? "Automated tests detected." : "No test files found.",
    },
    {
      domain: "security posture" as ScoringDomain,
      score: scoreDomain(hasAuthHints),
      confidence: "Weakly Inferred" as const,
      rationale: "Security posture inferred from auth-related artifacts.",
    },
    {
      domain: "DevOps maturity" as ScoringDomain,
      score: scoreDomain(hasCi, hasDocker),
      confidence: "Strongly Inferred" as const,
      rationale: "DevOps maturity assessed from CI and container artifacts.",
    },
    {
      domain: "observability" as ScoringDomain,
      score: scoreDomain(hasMonitoringHints),
      confidence: "Weakly Inferred" as const,
      rationale: "Observability assessed from monitoring integrations.",
    },
    {
      domain: "documentation" as ScoringDomain,
      score: scoreDomain(hasReadme),
      confidence: hasReadme ? "Confirmed" as const : "Strongly Inferred" as const,
      rationale: hasReadme ? "README present." : "README missing.",
    },
    {
      domain: "product completeness" as ScoringDomain,
      score: Math.min(90, 40 + snapshot.fileCount),
      confidence: "Weakly Inferred" as const,
      rationale: "Completeness estimated from repository breadth.",
    },
    {
      domain: "integration health" as ScoringDomain,
      score: scoreDomain(architecture.edges.length > 0),
      confidence: "Strongly Inferred" as const,
      rationale: `${architecture.edges.length} dependency relationships mapped.`,
    },
  ];

  const overall = Math.round(domains.reduce((sum, item) => sum + item.score, 0) / domains.length);
  const criticalCount = findings.filter((finding) => finding.severity === "Critical blocker").length;
  const highCount = findings.filter((finding) => finding.severity === "High-risk flaw").length;

  const maturityStage =
    overall >= 80 && highCount === 0
      ? "production_ready"
      : overall >= 65
        ? "production_candidate"
        : overall >= 45
          ? "developing"
          : "prototype";

  return {
    scorecard: {
      overall,
      maturityStage,
      domains,
    },
    findings,
  };
}