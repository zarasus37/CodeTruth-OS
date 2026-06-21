import {
  createId,
  createEvidenceFromSymbol,
  enrichEvidenceRecord,
  gateFindingConfidenceAtSource,
  inferConfidenceFromEvidence,
  initialFindingLifecycle,
} from "@codetruth/core";
import type {
  ArchitectureGraph,
  BuildStateScorecard,
  DependencyEdge,
  EvidenceRecord,
  Finding,
  GapCategory,
  ScoringDomain,
  SeverityLevel,
  SnapshotRecord,
  SymbolRecord,
} from "@codetruth/core";

export interface EvaluationContext {
  symbols?: SymbolRecord[];
  dependencies?: DependencyEdge[];
  parseEvidence?: EvidenceRecord[];
}

export interface EvaluationResult {
  scorecard: BuildStateScorecard;
  findings: Finding[];
}

function hasPath(snapshot: SnapshotRecord, matcher: (path: string) => boolean): boolean {
  return snapshot.manifest.some((entry) => matcher(entry.path.replace(/\\/g, "/")));
}

function symbolsMatching(
  symbols: SymbolRecord[] | undefined,
  pattern: RegExp,
): SymbolRecord[] {
  if (!symbols?.length) return [];
  return symbols.filter(
    (s) => pattern.test(s.filePath) || pattern.test(s.name) || pattern.test(`${s.kind}`),
  );
}

function makeFinding(input: {
  domain: ScoringDomain;
  severity: SeverityLevel;
  title: string;
  description: string;
  gapCategory?: GapCategory;
  filePath?: string;
  snapshot: SnapshotRecord;
  context?: EvaluationContext;
  symbolPattern?: RegExp;
}): Finding {
  const relatedSymbols = input.symbolPattern
    ? symbolsMatching(input.context?.symbols, input.symbolPattern)
    : [];

  const parseFileEvidence =
    input.filePath && input.context?.parseEvidence
      ? input.context.parseEvidence.filter((e) => e.filePath === input.filePath).slice(0, 2)
      : [];

  const symbolEvidence = relatedSymbols
    .slice(0, 2)
    .map((symbol) => createEvidenceFromSymbol(symbol, input.snapshot.hash));

  const absenceChain = [
    enrichEvidenceRecord({
      snapshotHash: input.snapshot.hash,
      filePath: input.filePath ?? "repository",
      extractionMethod: input.filePath ? "config_parse" : "inference",
      rawSnippet: input.filePath
        ? `Artifact check: ${input.filePath}`
        : `Repository scan (${input.snapshot.fileCount} files): ${input.description}`,
      snippet: input.filePath
        ? `Artifact check: ${input.filePath}`
        : `Repository scan (${input.snapshot.fileCount} files): ${input.description}`,
      confidenceAtExtraction: input.filePath ? "Confirmed" : "Strongly Inferred",
    }),
  ];

  const evidenceChain =
    symbolEvidence.length > 0
      ? symbolEvidence
      : parseFileEvidence.length > 0
        ? parseFileEvidence
        : absenceChain;

  const draft: Finding = {
    id: createId("find"),
    domain: input.domain,
    severity: input.severity,
    confidence: inferConfidenceFromEvidence(evidenceChain),
    title: input.title,
    description: input.description,
    gapCategory: input.gapCategory,
    evidence: evidenceChain,
    evidenceChain,
    remediationPath: `Address ${input.title.toLowerCase()} before production deployment.`,
    lifecycleState: initialFindingLifecycle(),
  };

  const gated = gateFindingConfidenceAtSource(draft);
  return { ...draft, ...gated };
}

function scoreDomain(present: boolean, partial = false): number {
  if (present) return 85;
  if (partial) return 55;
  return 35;
}

export function evaluateProject(
  snapshot: SnapshotRecord,
  architecture: ArchitectureGraph,
  context: EvaluationContext = {},
): EvaluationResult {
  const findings: Finding[] = [];
  const paths = snapshot.manifest.map((entry) => entry.path.replace(/\\/g, "/"));

  const hasPackageJson = paths.includes("package.json");
  const hasReadme = paths.some((p) => /^readme(\.|$)/i.test(p.split("/").pop() ?? ""));
  const hasTests =
    paths.some((p) => /(test|spec)\.(ts|js|tsx|jsx|py)$/i.test(p)) ||
    symbolsMatching(context.symbols, /test|spec/i).length > 0;
  const hasCi = paths.some((p) => p.startsWith(".github/workflows/"));
  const hasDocker = paths.some((p) => p.toLowerCase().includes("dockerfile") || p.endsWith("docker-compose.yml"));
  const hasEnvExample = paths.some((p) => p === ".env.example" || p.endsWith("/.env.example"));
  const hasAuthHints =
    paths.some((p) => /auth|jwt|session|oauth/i.test(p)) ||
    symbolsMatching(context.symbols, /auth|jwt|session|oauth/i).length > 0;
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
        context,
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
        context,
        filePath: ".env.example",
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
        context,
        symbolPattern: /test|spec/i,
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
        context,
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
        context,
        symbolPattern: /auth|jwt|session|oauth/i,
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
        context,
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
        context,
        symbolPattern: /health|ready|live/i,
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
        context,
      }),
    );
  }

  const symbolBackedDomains = context.symbols?.length ?? 0;
  const domains = [
    {
      domain: "code structure" as ScoringDomain,
      score: Math.min(95, 50 + architecture.modules.length * 4 + architecture.services.length * 5),
      confidence: symbolBackedDomains > 0 ? ("Confirmed" as const) : ("Strongly Inferred" as const),
      rationale: `${architecture.modules.length} modules and ${architecture.services.length} services inferred (${symbolBackedDomains} parse-backed symbols).`,
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
      confidence: hasAuthHints ? "Strongly Inferred" as const : "Weakly Inferred" as const,
      rationale: "Security posture inferred from auth-related artifacts and symbols.",
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
      score: scoreDomain((context.dependencies?.length ?? architecture.edges.length) > 0),
      confidence: (context.dependencies?.length ?? 0) > 0 ? "Confirmed" as const : "Strongly Inferred" as const,
      rationale: `${context.dependencies?.length ?? architecture.edges.length} dependency relationships mapped.`,
    },
  ];

  const overall = Math.round(domains.reduce((sum, item) => sum + item.score, 0) / domains.length);
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