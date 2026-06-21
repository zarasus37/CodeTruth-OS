import { createId } from "@codetruth/core";
import type {
  ArchitectureGraph,
  BuildStateScorecard,
  ConsensusTruthReport,
  ContradictionRecord,
  CouncilPhaseResult,
  Finding,
} from "@codetruth/core";

export const COUNCIL_MODELS = [
  "Architecture Model",
  "Runtime Model",
  "DevOps Model",
  "Security Model",
  "Planning Model",
] as const;

export type CouncilModel = (typeof COUNCIL_MODELS)[number];

export interface CouncilResult {
  consensus: ConsensusTruthReport;
  modelNotes: Record<CouncilModel, string[]>;
  phases: CouncilPhaseResult[];
  contradictionRegister: ContradictionRecord[];
  llmPowered: boolean;
  llmFallbackReason?: string;
}

function modelFindings(model: CouncilModel, findings: Finding[]): Finding[] {
  switch (model) {
    case "Architecture Model":
      return findings.filter(
        (f) => f.domain === "code structure" || f.domain === "integration health",
      );
    case "Runtime Model":
      return findings.filter(
        (f) => f.domain === "runtime readiness" || f.domain === "build readiness",
      );
    case "DevOps Model":
      return findings.filter(
        (f) => f.domain === "DevOps maturity" || f.domain === "observability",
      );
    case "Security Model":
      return findings.filter((f) => f.domain === "security posture");
    case "Planning Model":
      return findings;
  }
}

export function runHeuristicTruthCouncil(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
): CouncilResult {
  const modelNotes = Object.fromEntries(
    COUNCIL_MODELS.map((model) => [
      model,
      modelFindings(model, findings).map((f) => `${f.severity}: ${f.title}`),
    ]),
  ) as Record<CouncilModel, string[]>;

  const contradictionRegister: ContradictionRecord[] = [];
  if (scorecard.overall >= 75 && findings.some((f) => f.severity === "High-risk flaw")) {
    contradictionRegister.push({
      id: createId("contradiction"),
      claim: "Scorecard indicates strong readiness",
      challenge: "High-risk findings remain unresolved",
      models: ["Planning Model", "Evaluation Layer"],
      severity: "unresolved",
    });
  }

  const consensus: ConsensusTruthReport = {
    summary: `Heuristic Truth Council reviewed ${findings.length} findings across ${COUNCIL_MODELS.length} models. Project classified as ${scorecard.maturityStage} (${scorecard.overall}/100). Enable LLM_API_KEY for adversarial multi-LLM deliberation.`,
    confirmedClaims: [
      `${architecture.services.length} service boundary(ies) identified`,
      `Overall maturity stage: ${scorecard.maturityStage}`,
      `Overall score: ${scorecard.overall}/100`,
    ],
    inferredClaims: findings
      .filter((f) => f.confidence !== "Confirmed")
      .map((f) => f.title),
    contradictions: contradictionRegister.map((c) => `${c.claim} ↔ ${c.challenge}`),
    unknowns: scorecard.domains
      .filter((d) => d.confidence === "Unknown" || d.confidence === "Weakly Inferred")
      .map((d) => `${d.domain} requires additional evidence`),
  };

  return {
    consensus,
    modelNotes,
    phases: [
      { phase: "independent", modelAssessments: modelNotes, contradictions: [] },
      { phase: "cross_review", modelAssessments: modelNotes, contradictions: contradictionRegister },
      { phase: "consensus", modelAssessments: modelNotes, contradictions: contradictionRegister },
    ],
    contradictionRegister,
    llmPowered: false as boolean,
  };
}