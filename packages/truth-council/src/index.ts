import type { ArchitectureGraph, BuildStateScorecard, Finding } from "@codetruth/core";
import { isLlmEnabled, runLlmTruthCouncil } from "@codetruth/llm";
import { runHeuristicTruthCouncil, type CouncilResult } from "./heuristic.js";

export { COUNCIL_MODELS, type CouncilModel } from "./heuristic.js";
export type { CouncilResult };

export async function runTruthCouncil(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
): Promise<CouncilResult> {
  if (isLlmEnabled()) {
    try {
      const llm = await runLlmTruthCouncil(scorecard, findings, architecture);
      return {
        consensus: llm.consensus,
        modelNotes: llm.modelNotes,
        phases: llm.phases,
        contradictionRegister: llm.contradictionRegister,
        llmPowered: true,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "LLM unavailable";
      const heuristic = await runHeuristicTruthCouncil(scorecard, findings, architecture);
      return { ...heuristic, llmFallbackReason: reason };
    }
  }
  return runHeuristicTruthCouncil(scorecard, findings, architecture);
}