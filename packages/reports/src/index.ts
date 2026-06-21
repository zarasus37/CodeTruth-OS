import type {
  FindingAnnotation,
  FindingReview,
  PipelineArtifacts,
  PipelineDiagnostics,
  ReportApproval,
  TruthReport,
} from "@codetruth/core";
import { CONFIDENCE_LEVELS } from "@codetruth/core";

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
    diagnostics: artifacts.diagnostics,
    stageFailures: artifacts.stageFailures ?? artifacts.diagnostics?.failures,
  };
}

function renderDiagnosticsSection(diagnostics?: PipelineDiagnostics): string[] {
  if (!diagnostics) return [];

  const lines: string[] = [
    "## Pipeline Diagnostics",
    "",
    "> Per-stage timing, evidence corrections, confidence shifts, and isolated failures.",
    "",
  ];

  if (diagnostics.stages.length) {
    lines.push("### Stage timing", "");
    for (const stage of diagnostics.stages) {
      const duration = stage.durationMs != null ? `${stage.durationMs}ms` : "—";
      const corrections =
        stage.evidenceCorrections != null ? ` · evidence corrections: ${stage.evidenceCorrections}` : "";
      lines.push(`- **${stage.stage}:** ${stage.state} (${duration})${corrections}`);
      if (stage.error) lines.push(`  - Error: ${stage.error}`);
    }
    lines.push("");
  }

  if (diagnostics.evidenceCorrectionsByStage) {
    const entries = Object.entries(diagnostics.evidenceCorrectionsByStage).filter(([, n]) => (n ?? 0) > 0);
    if (entries.length) {
      lines.push("### Evidence corrections by stage", "");
      for (const [stage, count] of entries) {
        lines.push(`- ${stage}: ${count}`);
      }
      lines.push("");
    }
  }

  if (diagnostics.confidenceBeforeCouncil || diagnostics.confidenceAfterCouncil) {
    lines.push("### Confidence distribution (Truth Council)", "");
    const format = (label: string, summary?: Partial<Record<string, number>>) => {
      if (!summary) return;
      const parts = CONFIDENCE_LEVELS.filter((level) => (summary[level] ?? 0) > 0).map(
        (level) => `${level}: ${summary[level]}`,
      );
      lines.push(`- **${label}:** ${parts.length ? parts.join(", ") : "none"}`);
    };
    format("Before council", diagnostics.confidenceBeforeCouncil);
    format("After council", diagnostics.confidenceAfterCouncil);
    lines.push("");
  }

  if (diagnostics.isolatedTargets?.length) {
    lines.push("### Isolated targets", "");
    for (const target of diagnostics.isolatedTargets) {
      lines.push(`- ${target}`);
    }
    lines.push("");
  }

  if (diagnostics.failures.length) {
    lines.push("### Stage failures", "");
    for (const failure of diagnostics.failures) {
      const target = failure.target ? ` \`${failure.target}\`` : "";
      lines.push(
        `- **${failure.stage}** (${failure.scope}${target}): ${failure.message}${
          failure.degraded ? " _[degraded]_" : ""
        }`,
      );
    }
    lines.push("");
  }

  return lines;
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
    );
    if (record.impactSeverity) {
      lines.push(`- **Impact:** ${record.impactSeverity}`);
    }
    if (record.modelA && record.modelB) {
      lines.push(`- **Dispute:** ${record.modelA} ↔ ${record.modelB}`);
    }
    if (record.suggestedResolution) {
      lines.push(`- **Suggested resolution:** ${record.suggestedResolution}`);
    }
    if (record.disagreementPenalty != null) {
      lines.push(`- **Disagreement penalty:** ${(record.disagreementPenalty * 100).toFixed(0)}%`);
    }
    if (record.positions?.length) {
      lines.push("- **Model positions:**");
      for (const pos of record.positions) {
        lines.push(
          `  - ${pos.model} (${pos.stance}, ${pos.confidence}): ${pos.claim}${
            pos.evidenceRefs.length ? ` — refs: ${pos.evidenceRefs.join(", ")}` : ""
          }`,
        );
      }
    }
    if (record.claimEvidence?.length) {
      lines.push(
        `- **Claim evidence:** ${record.claimEvidence
          .map((e) => `${e.filePath}${e.lineStart != null ? `:${e.lineStart}` : ""}`)
          .join("; ")}`,
      );
    }
    if (record.challengeEvidence?.length) {
      lines.push(
        `- **Challenge evidence:** ${record.challengeEvidence
          .map((e) => `${e.filePath}${e.snippet ? ` ("${e.snippet.slice(0, 60)}")` : ""}`)
          .join("; ")}`,
      );
    }
    lines.push("");
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
  lines.push(...renderDiagnosticsSection(report.diagnostics));
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