import { buildCouncilEvidenceBundle } from "@codetruth/core";
import type {
  ArchitectureGraph,
  BuildStateScorecard,
  ConsensusTruthReport,
  ContradictionRecord,
  CouncilPhaseResult,
  Finding,
} from "@codetruth/core";
import { runHeuristicDeliberation } from "./phases.js";
import { COUNCIL_MODELS, type CouncilModel } from "./models.js";

export { COUNCIL_MODELS, modelFindings, type CouncilModel } from "./models.js";

export interface CouncilResult {
  consensus: ConsensusTruthReport;
  modelNotes: Record<CouncilModel, string[]>;
  phases: CouncilPhaseResult[];
  contradictionRegister: ContradictionRecord[];
  adjustedFindings?: Finding[];
  llmPowered: boolean;
  llmFallbackReason?: string;
  llmQuotaDegraded?: boolean;
  llmProvider?: string;
  llmModel?: string;
  llmEstimatedCostUsd?: number;
}

export function runHeuristicTruthCouncil(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
): CouncilResult {
  const bundle = buildCouncilEvidenceBundle(scorecard, findings, architecture);
  const deliberation = runHeuristicDeliberation(bundle, false);

  return {
    consensus: deliberation.consensus,
    modelNotes: deliberation.modelNotes,
    phases: deliberation.phases,
    contradictionRegister: deliberation.contradictionRegister,
    llmPowered: false,
  };
}