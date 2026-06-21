import type { ArchitectureGraph, BuildStateScorecard, Finding } from "@codetruth/core";
import { isLlmEnabled, runLlmTruthCouncil } from "@codetruth/llm";
import { runHeuristicTruthCouncil, type CouncilResult } from "./heuristic.js";

export {
  COUNCIL_MODELS,
  runHeuristicTruthCouncil,
  type CouncilModel,
} from "./heuristic.js";
export type { CouncilResult };

export interface CouncilRunOptions {
  /** When false, skip LLM even if configured (tier quota / cost cap). */
  useLlm?: boolean;
}

export async function runTruthCouncil(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
  options: CouncilRunOptions = {},
): Promise<CouncilResult> {
  const llmAllowed = options.useLlm !== false && isLlmEnabled();

  if (llmAllowed) {
    try {
      const llm = await runLlmTruthCouncil(scorecard, findings, architecture);
      return {
        consensus: llm.consensus,
        modelNotes: llm.modelNotes,
        phases: llm.phases,
        contradictionRegister: llm.contradictionRegister,
        llmPowered: true,
        llmProvider: llm.provider,
        llmModel: llm.model,
        llmEstimatedCostUsd: llm.estimatedCostUsd,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "LLM unavailable";
      const heuristic = await runHeuristicTruthCouncil(scorecard, findings, architecture);
      return { ...heuristic, llmFallbackReason: reason, llmQuotaDegraded: true };
    }
  }

  const heuristic = await runHeuristicTruthCouncil(scorecard, findings, architecture);
  if (options.useLlm === false && isLlmEnabled()) {
    return { ...heuristic, llmFallbackReason: "LLM council blocked by plan quota or cost cap" };
  }
  return heuristic;
}