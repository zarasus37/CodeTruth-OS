import type {
  BuildStateScorecard,
  ComplianceAttestation,
  ComplianceControl,
  ComplianceFramework,
  ComplianceScorecard,
  ComplianceViolation,
  CustomCompliancePolicy,
  Finding,
  PortfolioComplianceView,
  ProjectCompliancePosture,
} from "@codetruth/core";
import { COMPLIANCE_FRAMEWORKS, controlsForFramework, severityMeetsThreshold } from "./controls.js";

export function customPoliciesToControls(
  policies: CustomCompliancePolicy[],
): ComplianceControl[] {
  return policies.map((policy) => ({
    id: policy.id,
    framework: "custom",
    title: policy.title,
    description: policy.description,
    domains: policy.domains,
    gapCategories: policy.gapCategories,
    severityThreshold: policy.severityThreshold,
  }));
}

export interface EvaluateComplianceInput {
  projectId: string;
  projectName: string;
  analysisId?: string;
  findings: Finding[];
  scorecard?: BuildStateScorecard;
  attestations?: ComplianceAttestation[];
  customPolicies?: CustomCompliancePolicy[];
}

function findingViolatesControl(finding: Finding, control: ReturnType<typeof controlsForFramework>[number]): boolean {
  if (!severityMeetsThreshold(finding.severity, control.severityThreshold)) {
    return false;
  }
  if (finding.contradicted) return false;

  const domainMatch = control.domains.includes(finding.domain);
  const gapMatch = finding.gapCategory
    ? control.gapCategories?.includes(finding.gapCategory)
    : false;

  return domainMatch || Boolean(gapMatch);
}

function attestationStatus(
  framework: ComplianceFramework,
  projectId: string,
  attestations: ComplianceAttestation[] = [],
): ComplianceScorecard["attestationStatus"] {
  const now = Date.now();
  const match = attestations
    .filter((a) => a.framework === framework && (!a.projectId || a.projectId === projectId))
    .sort((a, b) => b.attestedAt.localeCompare(a.attestedAt))[0];

  if (!match) return "none";
  if (match.expiresAt && Date.parse(match.expiresAt) < now) return "expired";
  return "attested";
}

export function evaluateFrameworkCompliance(
  framework: ComplianceFramework,
  findings: Finding[],
  options?: {
    projectId?: string;
    attestations?: ComplianceAttestation[];
    customControls?: ComplianceControl[];
  },
): ComplianceScorecard {
  const controls =
    framework === "custom"
      ? (options?.customControls ?? [])
      : controlsForFramework(framework);
  const violations: ComplianceViolation[] = [];

  for (const control of controls) {
    for (const finding of findings) {
      if (!findingViolatesControl(finding, control)) continue;
      violations.push({
        controlId: control.id,
        controlTitle: control.title,
        findingId: finding.id,
        findingTitle: finding.title,
        severity: finding.severity,
        domain: finding.domain,
        status: "open",
      });
    }
  }

  const failingControlIds = new Set(violations.map((v) => v.controlId));
  const controlsFailing = failingControlIds.size;
  const controlsPassing = controls.length - controlsFailing;
  const overallScore =
    controls.length > 0 ? Math.round((controlsPassing / controls.length) * 100) : 100;

  return {
    framework,
    overallScore,
    controlsTotal: controls.length,
    controlsPassing,
    controlsFailing,
    violations,
    attestationStatus: attestationStatus(
      framework,
      options?.projectId ?? "",
      options?.attestations,
    ),
  };
}

export function evaluateProjectCompliance(input: EvaluateComplianceInput): ProjectCompliancePosture {
  const customControls = customPoliciesToControls(input.customPolicies ?? []);
  const frameworks = customControls.length
    ? COMPLIANCE_FRAMEWORKS
    : COMPLIANCE_FRAMEWORKS.filter((f) => f !== "custom");

  const scorecards = frameworks.map((framework) =>
    evaluateFrameworkCompliance(framework, input.findings, {
      projectId: input.projectId,
      attestations: input.attestations,
      customControls: framework === "custom" ? customControls : undefined,
    }),
  );

  const overallComplianceScore = scorecards.length
    ? Math.round(
        scorecards.reduce((sum, card) => sum + card.overallScore, 0) / scorecards.length,
      )
    : 0;

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    analysisId: input.analysisId,
    scorecards,
    overallComplianceScore,
  };
}

export function buildPortfolioComplianceView(
  workspaceId: string,
  projects: ProjectCompliancePosture[],
): PortfolioComplianceView {
  const frameworkBreakdown = Object.fromEntries(
    COMPLIANCE_FRAMEWORKS.map((framework) => {
      const cards = projects.flatMap((p) =>
        p.scorecards.filter((s) => s.framework === framework),
      );
      const passing = cards.reduce((sum, c) => sum + c.controlsPassing, 0);
      const failing = cards.reduce((sum, c) => sum + c.controlsFailing, 0);
      const score = cards.length
        ? Math.round(cards.reduce((sum, c) => sum + c.overallScore, 0) / cards.length)
        : 0;
      return [framework, { passing, failing, score }];
    }),
  ) as PortfolioComplianceView["frameworkBreakdown"];

  const aggregateComplianceScore = projects.length
    ? Math.round(
        projects.reduce((sum, p) => sum + p.overallComplianceScore, 0) / projects.length,
      )
    : 0;

  const openViolations = projects.reduce(
    (sum, p) =>
      sum + p.scorecards.reduce((inner, card) => inner + card.violations.length, 0),
    0,
  );

  return {
    workspaceId,
    projects,
    aggregateComplianceScore,
    openViolations,
    frameworkBreakdown,
  };
}