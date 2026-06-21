import type { FindingAnnotation, FindingReview, PipelineArtifacts, ReportApproval, TruthReport } from "@codetruth/core";

export { ANALYZER_VERSION } from "./exports.js";
export * from "./exports.js";

export interface BuildReportOptions {
  reviews?: FindingReview[];
  annotations?: FindingAnnotation[];
  approval?: ReportApproval;
}

export function buildTruthReport(
  analysisId: string,
  projectId: string,
  artifacts: PipelineArtifacts,
  options: BuildReportOptions = {},
): TruthReport {
  return {
    analysisId,
    projectId,
    snapshotId: artifacts.snapshot.id,
    generatedAt: new Date().toISOString(),
    executiveSummary: artifacts.consensus.summary,
    scorecard: artifacts.scorecard,
    findings: artifacts.findings,
    consensus: artifacts.consensus,
    roadmap: artifacts.roadmap,
    councilPhases: artifacts.councilPhases,
    contradictionRegister: artifacts.contradictionRegister,
    modelNotes: artifacts.modelNotes,
    llmCouncilMeta: artifacts.llmCouncilMeta,
    incrementalMetrics: artifacts.incrementalMetrics,
    reviews: options.reviews,
    annotations: options.annotations,
    approval: options.approval,
  };
}

function renderContradictionRegister(
  register: TruthReport["contradictionRegister"],
  consensusContradictions: string[],
): string[] {
  const lines: string[] = [
    "## Contradiction Register",
    "",
    "> Blueprint guardrail: disagreements are never hidden. Unresolved council conflicts appear here first.",
    "",
  ];

  const records = register ?? [];
  if (!records.length && !consensusContradictions.length) {
    lines.push(
      "_No unresolved contradictions recorded. Council assessments aligned on this snapshot._",
      "",
    );
    return lines;
  }

  for (const record of records) {
    lines.push(
      `### ${record.claim}`,
      `- **Challenge:** ${record.challenge}`,
      `- **Models:** ${record.models.join(", ")}`,
      `- **Status:** ${record.severity}`,
      "",
    );
  }

  for (const text of consensusContradictions) {
    if (records.some((r) => `${r.claim} ↔ ${r.challenge}` === text)) continue;
    lines.push(`- ${text}`, "");
  }

  return lines;
}

export function renderMarkdownReport(report: TruthReport): string {
  const lines: string[] = [
    "# CodeTruth OS — Executive Truth Report",
    "",
    `**Generated:** ${report.generatedAt}`,
    `**Snapshot:** ${report.snapshotId}`,
    `**Maturity Stage:** ${report.scorecard.maturityStage}`,
    `**Overall Score:** ${report.scorecard.overall}/100`,
    "",
    "## Executive Summary",
    report.executiveSummary,
    "",
    "## Domain Scorecard",
    "",
    "| Domain | Score | Confidence |",
    "|---|---:|---|",
    ...report.scorecard.domains.map(
      (domain) => `| ${domain.domain} | ${domain.score} | ${domain.confidence} |`,
    ),
    "",
    "## Priority Findings",
    "",
  ];

  for (const finding of report.findings) {
    lines.push(
      `### ${finding.title}`,
      `- **Severity:** ${finding.severity}`,
      `- **Confidence:** ${finding.confidence}`,
      `- **Domain:** ${finding.domain}`,
      `- **Description:** ${finding.description}`,
      `- **Remediation:** ${finding.remediationPath ?? "See planning roadmap."}`,
      "",
    );
  }

  lines.push(...renderContradictionRegister(report.contradictionRegister, report.consensus.contradictions));
  lines.push("## Consensus Truth", "", report.consensus.summary, "");
  if (report.councilPhases?.length) {
    lines.push("## Truth Council Deliberation", "");
    for (const phase of report.councilPhases) {
      lines.push(`### Phase: ${phase.phase}`, "");
      for (const [model, notes] of Object.entries(phase.modelAssessments)) {
        if (!notes.length) continue;
        lines.push(`**${model}**`, ...notes.map((n) => `- ${n}`), "");
      }
      if (phase.contradictions.length) {
        lines.push("**Contradictions**", ...phase.contradictions.map((c) => `- ${c.claim} ↔ ${c.challenge}`), "");
      }
    }
  }
  if (report.approval?.status === "approved") {
    lines.push("## Report Approval", `- Status: approved`, `- Signed: ${report.approval.signedAt ?? "pending"}`, "");
  }

  lines.push("## Planning Roadmap", "");
  for (const [track, tasks] of Object.entries(report.roadmap.tracks)) {
    if (tasks.length === 0) continue;
    lines.push(`### ${track}`, "");
    for (const task of tasks) {
      lines.push(`- [${task.effort}] ${task.title}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderJsonReport(report: TruthReport): string {
  return JSON.stringify(report, null, 2);
}