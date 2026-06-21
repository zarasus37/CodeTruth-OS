import type {
  DueDiligenceEngagement,
  DueDiligenceStage,
  PipelineArtifacts,
  WorkspaceSettings,
} from "@codetruth/core";

export const DUE_DILIGENCE_STAGES: DueDiligenceStage[] = [
  "intake",
  "technical_review",
  "risk_assessment",
  "report_draft",
  "client_delivery",
  "closed",
];

export * from "./policy.js";

export function defaultDataResidency(): WorkspaceSettings["dataResidency"] {
  const raw = process.env.DEFAULT_DATA_RESIDENCY?.toLowerCase();
  if (raw === "eu" || raw === "apac" || raw === "sovereign" || raw === "us") return raw;
  return "us";
}

export function generateDueDiligencePlaybook(
  engagement: DueDiligenceEngagement,
  artifacts: PipelineArtifacts,
  options?: { workspaceName?: string; dataResidency?: WorkspaceSettings["dataResidency"] },
): string {
  const lines: string[] = [];
  const residency = options?.dataResidency ?? defaultDataResidency();
  const critical = artifacts.findings.filter((f) => f.severity === "Critical blocker");
  const high = artifacts.findings.filter((f) => f.severity === "High-risk flaw");
  const marketplace = artifacts.marketplaceResults ?? [];

  lines.push(`# Sovereign Services — Due Diligence Playbook`);
  lines.push("");
  lines.push(`**Engagement:** ${engagement.title}`);
  if (engagement.clientName) lines.push(`**Client:** ${engagement.clientName}`);
  if (options?.workspaceName) lines.push(`**Workspace:** ${options.workspaceName}`);
  lines.push(`**Stage:** ${engagement.stage}`);
  lines.push(`**Data residency:** ${residency}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  lines.push(artifacts.consensus.summary);
  lines.push("");
  lines.push(`- Overall score: **${artifacts.scorecard.overall}** (${artifacts.scorecard.maturityStage})`);
  lines.push(`- Findings: ${artifacts.findings.length} total (${critical.length} critical, ${high.length} high)`);
  if (marketplace.length) {
    lines.push(`- Marketplace analyzers: ${marketplace.map((r) => r.analyzerName).join(", ")}`);
  }
  lines.push("");
  lines.push("## Phase 3 deliverables (blueprint)");
  lines.push("");
  lines.push("1. Technical truth report with evidence chain");
  lines.push("2. Risk register (severity × confidence)");
  lines.push("3. Contradiction register (where claims conflict)");
  lines.push("4. Remediation roadmap with effort bands");
  lines.push("5. Marketplace supplemental findings (DeFi / Solidity / agents)");
  lines.push("");
  lines.push("## Risk register (top blockers)");
  lines.push("");
  if (!critical.length && !high.length) {
    lines.push("_No critical or high-severity findings._");
  } else {
    for (const finding of [...critical, ...high].slice(0, 15)) {
      lines.push(`### ${finding.title}`);
      lines.push(`- Severity: ${finding.severity}`);
      lines.push(`- Confidence: ${finding.confidence}`);
      lines.push(`- ${finding.description}`);
      if (finding.evidence[0]?.filePath) {
        lines.push(`- Evidence: \`${finding.evidence[0].filePath}\``);
      }
      lines.push("");
    }
  }

  if (artifacts.contradictionRegister?.length) {
    lines.push("## Contradiction register");
    lines.push("");
    for (const row of artifacts.contradictionRegister.slice(0, 10)) {
      lines.push(`- **${row.claim}** vs ${row.challenge} (${row.severity})`);
    }
    lines.push("");
  }

  if (marketplace.length) {
    lines.push("## Marketplace analyzer outputs");
    lines.push("");
    for (const run of marketplace) {
      lines.push(`### ${run.analyzerName} (${run.category})`);
      lines.push(run.summary);
      for (const finding of run.findings.slice(0, 5)) {
        lines.push(`- [${finding.severity}] ${finding.title}`);
      }
      lines.push("");
    }
  }

  lines.push("## Engagement workflow");
  lines.push("");
  for (const stage of DUE_DILIGENCE_STAGES) {
    const marker = stage === engagement.stage ? " ← current" : "";
    lines.push(`- ${stage}${marker}`);
  }

  if (engagement.notes) {
    lines.push("");
    lines.push("## Engagement notes");
    lines.push("");
    lines.push(engagement.notes);
  }

  lines.push("");
  lines.push("---");
  lines.push("_CodeTruth OS Sovereign Services — institutional due diligence export_");

  return lines.join("\n");
}