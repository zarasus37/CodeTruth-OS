import type {
  AnalysisJob,
  CognitionActivityEvent,
  ComplianceAttestation,
  CustomCompliancePolicy,
  InstitutionalPortfolioView,
  PortfolioProjectEntry,
  PortfolioTrendPoint,
  Project,
  ReAnalysisSchedule,
} from "@codetruth/core";
import { buildPortfolioComplianceView, evaluateProjectCompliance } from "@codetruth/compliance";
import { buildPortfolioView } from "@codetruth/spatial";

export interface InstitutionalPortfolioInput {
  workspaceId: string;
  projects: Project[];
  analysesByProject: Map<string, AnalysisJob[]>;
  attestations?: ComplianceAttestation[];
  customPolicies?: CustomCompliancePolicy[];
  activity?: CognitionActivityEvent[];
  schedules?: ReAnalysisSchedule[];
}

function languagesFromParserStats(
  parserStats: NonNullable<AnalysisJob["artifacts"]>["parserStats"],
): string[] {
  if (!parserStats) return [];
  const languages: string[] = [];
  if (parserStats.babel) languages.push("javascript/typescript");
  if (parserStats.python) languages.push("python");
  if (parserStats.go) languages.push("go");
  if (parserStats.rust) languages.push("rust");
  if (parserStats.java) languages.push("java");
  if (parserStats.csharp) languages.push("csharp");
  if (parserStats.ruby) languages.push("ruby");
  return languages;
}

function latestCompletedAnalysis(analyses: AnalysisJob[]): AnalysisJob | undefined {
  return analyses
    .filter((a) => a.status === "completed" && a.artifacts)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
}

export function buildPortfolioTrendSeries(
  projects: Project[],
  analysesByProject: Map<string, AnalysisJob[]>,
  complianceByProject: Map<string, number>,
): PortfolioTrendPoint[] {
  const points: PortfolioTrendPoint[] = [];

  for (const project of projects) {
    const analyses = analysesByProject.get(project.id) ?? [];
    const completed = analyses
      .filter((a) => a.status === "completed" && a.artifacts && a.completedAt)
      .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""))
      .slice(-8);

    for (const analysis of completed) {
      const artifacts = analysis.artifacts!;
      points.push({
        projectId: project.id,
        projectName: project.name,
        analysisId: analysis.id,
        completedAt: analysis.completedAt!,
        overallScore: artifacts.scorecard.overall,
        findingCount: artifacts.findings.length,
        driftScore: artifacts.spatialGraph?.diffOverlay?.driftScore,
        complianceScore: complianceByProject.get(project.id),
      });
    }
  }

  return points.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export function buildInstitutionalPortfolioView(
  input: InstitutionalPortfolioInput,
): InstitutionalPortfolioView {
  const entries: PortfolioProjectEntry[] = [];
  const compliancePostures = [];
  const complianceByProject = new Map<string, number>();

  for (const project of input.projects) {
    const analyses = input.analysesByProject.get(project.id) ?? [];
    const latest = latestCompletedAnalysis(analyses);
    const artifacts = latest?.artifacts;

    const posture = evaluateProjectCompliance({
      projectId: project.id,
      projectName: project.name,
      analysisId: latest?.id,
      findings: artifacts?.findings ?? [],
      scorecard: artifacts?.scorecard,
      attestations: input.attestations,
      customPolicies: input.customPolicies,
    });

    compliancePostures.push(posture);
    complianceByProject.set(project.id, posture.overallComplianceScore);

    const openViolations = posture.scorecards.reduce(
      (sum, card) => sum + card.violations.length,
      0,
    );

    entries.push({
      projectId: project.id,
      projectName: project.name,
      analysisId: latest?.id,
      snapshotId: latest?.snapshotId,
      overallScore: artifacts?.scorecard.overall,
      maturityStage: artifacts?.scorecard.maturityStage,
      findingCount: artifacts?.findings.length,
      driftScore: artifacts?.spatialGraph?.diffOverlay?.driftScore,
      complianceScore: posture.overallComplianceScore,
      openViolations,
      languages: languagesFromParserStats(artifacts?.parserStats),
      updatedAt: latest?.completedAt ?? project.createdAt,
    });
  }

  const portfolio = buildPortfolioView(input.workspaceId, entries);
  const compliance = buildPortfolioComplianceView(input.workspaceId, compliancePostures);
  const trendSeries = buildPortfolioTrendSeries(
    input.projects,
    input.analysesByProject,
    complianceByProject,
  );

  return {
    ...portfolio,
    compliance,
    trendSeries,
    recentActivity: (input.activity ?? []).slice(0, 50),
    schedules: input.schedules ?? [],
  };
}