import type { InstitutionalPortfolioView, PortfolioComplianceView } from "@codetruth/core";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderComplianceCsv(view: PortfolioComplianceView): string {
  const header =
    "project,framework,control_id,control_title,finding_id,finding_title,severity,domain,status";
  const rows: string[] = [];

  for (const project of view.projects) {
    for (const card of project.scorecards) {
      for (const violation of card.violations) {
        rows.push(
          [
            project.projectName,
            card.framework,
            violation.controlId,
            violation.controlTitle,
            violation.findingId,
            violation.findingTitle,
            violation.severity,
            violation.domain,
            violation.status,
          ]
            .map(csvEscape)
            .join(","),
        );
      }
    }
  }

  return [header, ...rows].join("\n");
}

export function renderAuditorReport(view: InstitutionalPortfolioView): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    workspaceId: view.workspaceId,
    aggregateScore: view.aggregateScore,
    aggregateComplianceScore: view.aggregateComplianceScore,
    projectCount: view.projectCount,
    maturityDistribution: view.maturityDistribution,
    driftAlerts: view.driftAlerts,
    compliance: view.compliance,
    trendSeries: view.trendSeries,
    recentActivity: view.recentActivity.slice(0, 25),
    schedules: view.schedules,
  };
}