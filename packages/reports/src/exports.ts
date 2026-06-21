import type {
  ExportedTask,
  PlannerTask,
  PhasedRoadmap,
  TaskExportFormat,
  TruthReport,
  Finding,
} from "@codetruth/core";

export const ANALYZER_VERSION = "3.0.0";

function flattenTasks(roadmap: PhasedRoadmap): PlannerTask[] {
  return Object.values(roadmap.tracks).flat();
}

export function tasksFromReport(report: TruthReport): ExportedTask[] {
  return flattenTasks(report.roadmap).map((task) => ({
    title: task.title,
    description: task.description,
    labels: [task.track, `effort:${task.effort}`],
    effort: task.effort,
    track: task.track,
    acceptanceCriteria: task.acceptanceCriteria,
    findingIds: task.findingIds,
  }));
}

export function renderFindingsCsv(findings: Finding[]): string {
  const header = "id,title,severity,confidence,domain,gap_category,description";
  const rows = findings.map((f) => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [
      f.id,
      escape(f.title),
      f.severity,
      f.confidence,
      f.domain,
      f.gapCategory ?? "",
      escape(f.description),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function renderTasksCsv(tasks: ExportedTask[]): string {
  const header = "title,track,effort,labels,description,acceptance_criteria,finding_ids";
  const rows = tasks.map((t) => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [
      escape(t.title),
      t.track,
      t.effort,
      escape(t.labels.join(";")),
      escape(t.description),
      escape(t.acceptanceCriteria.join(" | ")),
      escape(t.findingIds.join(";")),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function renderGitHubIssuesExport(tasks: ExportedTask[]): string {
  const payload = tasks.map((task) => ({
    title: task.title,
    body: [
      task.description,
      "",
      "**Acceptance criteria**",
      ...task.acceptanceCriteria.map((c) => `- ${c}`),
      "",
      `**Track:** ${task.track} · **Effort:** ${task.effort}`,
    ].join("\n"),
    labels: task.labels,
  }));
  return JSON.stringify({ issues: payload }, null, 2);
}

export function renderJiraCsvExport(tasks: ExportedTask[]): string {
  const header = "Summary,Description,Issue Type,Priority,Labels";
  const priorityMap: Record<string, string> = {
    L: "Highest",
    M: "High",
    S: "Medium",
    XS: "Low",
    XL: "Highest",
  };
  const rows = tasks.map((t) => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [
      escape(t.title),
      escape(`${t.description}\n\nAcceptance:\n${t.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`),
      "Task",
      priorityMap[t.effort] ?? "Medium",
      escape(t.labels.join(" ")),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function renderLinearExport(tasks: ExportedTask[]): string {
  const payload = tasks.map((task) => ({
    title: task.title,
    description: task.description,
    priority: task.effort === "L" || task.effort === "XL" ? 1 : task.effort === "M" ? 2 : 3,
    labelNames: task.labels,
    acceptanceCriteria: task.acceptanceCriteria,
  }));
  return JSON.stringify({ issues: payload }, null, 2);
}

export function renderTaskExport(report: TruthReport, format: TaskExportFormat): string {
  const tasks = tasksFromReport(report);
  switch (format) {
    case "github":
      return renderGitHubIssuesExport(tasks);
    case "jira":
      return renderJiraCsvExport(tasks);
    case "linear":
      return renderLinearExport(tasks);
    case "csv":
      return renderTasksCsv(tasks);
  }
}

export function renderHtmlReport(report: TruthReport): string {
  const domainRows = report.scorecard.domains
    .map(
      (d) =>
        `<tr><td>${d.domain}</td><td>${d.score}</td><td>${d.confidence}</td><td>${d.rationale}</td></tr>`,
    )
    .join("");

  const findingBlocks = report.findings
    .map(
      (f) => `
      <article class="finding" id="${f.id}">
        <h3>${f.title}</h3>
        <p><strong>Severity:</strong> ${f.severity} · <strong>Confidence:</strong> ${f.confidence} · <strong>Domain:</strong> ${f.domain}</p>
        <p>${f.description}</p>
        ${f.remediationPath ? `<p><em>Remediation:</em> ${f.remediationPath}</p>` : ""}
      </article>`,
    )
    .join("");

  const roadmapBlocks = Object.entries(report.roadmap.tracks)
    .filter(([, tasks]) => tasks.length > 0)
    .map(
      ([track, tasks]) => `
      <section><h3>${track}</h3><ul>${tasks.map((t) => `<li>[${t.effort}] ${t.title}</li>`).join("")}</ul></section>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CodeTruth Report — ${report.analysisId}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 900px; margin: 2rem auto; color: #1a1a1a; line-height: 1.5; }
    h1 { border-bottom: 2px solid #1a1a1a; padding-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
    .finding { margin: 1.5rem 0; padding: 1rem; border-left: 4px solid #333; background: #f8f8f8; }
    @media print { body { margin: 1cm; } .finding { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>CodeTruth Executive Truth Report</h1>
  <p><strong>Generated:</strong> ${report.generatedAt}</p>
  <p><strong>Maturity:</strong> ${report.scorecard.maturityStage} · <strong>Score:</strong> ${report.scorecard.overall}/100</p>
  <h2>Executive Summary</h2>
  <p>${report.executiveSummary}</p>
  <h2>Domain Scorecard</h2>
  <table><thead><tr><th>Domain</th><th>Score</th><th>Confidence</th><th>Rationale</th></tr></thead><tbody>${domainRows}</tbody></table>
  <h2>Priority Findings</h2>
  ${findingBlocks}
  <h2>Planning Roadmap</h2>
  ${roadmapBlocks}
</body>
</html>`;
}