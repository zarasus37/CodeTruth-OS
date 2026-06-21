import { buildCouncilEvidenceBundle } from "@codetruth/core";
import type { ArchitectureGraph, BuildStateScorecard, Finding } from "@codetruth/core";
import { applyLlmCouncilEvidenceToFindings, isLlmEnabled, runLlmTruthCouncil } from "@codetruth/llm";
import { applyCouncilFallbackToFindings } from "./fallback.js";
import { runHeuristicDeliberation } from "./phases.js";
import { runHeuristicTruthCouncil, type CouncilResult } from "./heuristic.js";

export {
  COUNCIL_MODELS,
  modelFindings,
  runHeuristicTruthCouncil,
  type CouncilModel,
} from "./heuristic.js";
export { buildCouncilEvidenceBundle } from "@codetruth/core";
export type { CouncilResult };

export interface CouncilRunOptions {
  /** When false, skip LLM even if configured (tier quota / cost cap). */
  useLlm?: boolean;
}

function wrapDeliberation(
  deliberation: ReturnType<typeof runHeuristicDeliberation>,
  llmPowered: boolean,
  extras: Partial<CouncilResult> = {},
): CouncilResult {
  return {
    consensus: deliberation.consensus,
    modelNotes: deliberation.modelNotes,
    phases: deliberation.phases,
    contradictionRegister: deliberation.contradictionRegister,
    llmPowered,
    ...extras,
  };
}

export async function runTruthCouncil(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
  options: CouncilRunOptions = {},
): Promise<CouncilResult> {
  const bundle = buildCouncilEvidenceBundle(scorecard, findings, architecture);
  const llmAllowed = options.useLlm !== false && isLlmEnabled();

  if (llmAllowed) {
    try {
      const llm = await runLlmTruthCouncil(bundle);
      return {
        consensus: llm.consensus,
        modelNotes: llm.modelNotes,
        phases: llm.phases,
        contradictionRegister: llm.contradictionRegister,
        adjustedFindings: applyLlmCouncilEvidenceToFindings(
          findings,
          llm.phases,
          bundle.evidencePool,
        ),
        llmPowered: true,
        llmProvider: llm.provider,
        llmModel: llm.model,
        llmEstimatedCostUsd: llm.estimatedCostUsd,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "LLM unavailable";
      const deliberation = runHeuristicDeliberation(bundle, false);
      return wrapDeliberation(deliberation, false, {
        llmFallbackReason: reason,
        llmQuotaDegraded: true,
        adjustedFindings: applyCouncilFallbackToFindings(
          findings,
          reason,
          deliberation.contradictionRegister,
        ),
      });
    }
  }

  const deliberation = runHeuristicDeliberation(bundle, false);

  if (options.useLlm === false && isLlmEnabled()) {
    const reason = "LLM council blocked by plan quota or cost cap";
    return wrapDeliberation(deliberation, false, {
      llmFallbackReason: reason,
      llmQuotaDegraded: true,
      adjustedFindings: applyCouncilFallbackToFindings(
        findings,
        reason,
        deliberation.contradictionRegister,
      ),
    });
  }

  return wrapDeliberation(deliberation, false, { adjustedFindings: findings });
}