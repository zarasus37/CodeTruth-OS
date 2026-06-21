import type { AnalysisJob, ProductEvent } from "@codetruth/core";

/** Blueprint Phase C gate: 85–90% compute savings on small diffs. */
export const PHASE_C_GATES = {
  incrementalSavingsPercent: 85,
  smallDiffChangeRatio: 0.1,
} as const;

export interface PhaseCMetrics {
  incrementalAnalyses: number;
  incrementalWithSavings: number;
  avgIncrementalSavingsPercent: number;
  smallDiffAnalyses: number;
  smallDiffMeetingTarget: number;
  smallDiffSavingsRate: number;
  evidenceLedgerOpens: number;
  contradictionViews: number;
  llmCouncilRuns: number;
  llmQuotaDegradedRuns: number;
  gates: {
    incrementalSavingsMet: boolean;
  };
}

export function computePhaseCMetrics(input: {
  analyses: AnalysisJob[];
  events: ProductEvent[];
}): PhaseCMetrics {
  const completed = input.analyses.filter((a) => a.status === "completed");
  const incremental = completed.filter((a) => a.incrementalBaseSnapshotId);

  const savingsValues = incremental
    .map((a) => a.artifacts?.incrementalMetrics?.savingsPercent)
    .filter((v): v is number => v != null);

  const smallDiff = incremental.filter(
    (a) => (a.artifacts?.incrementalMetrics?.changeRatio ?? 1) <= PHASE_C_GATES.smallDiffChangeRatio,
  );
  const smallDiffMeetingTarget = smallDiff.filter(
    (a) =>
      (a.artifacts?.incrementalMetrics?.savingsPercent ?? 0) >=
      PHASE_C_GATES.incrementalSavingsPercent,
  );

  const evidenceLedgerOpens = input.events.filter((e) => e.event === "evidence.ledger_opened").length;
  const contradictionViews = input.events.filter((e) => e.event === "contradiction.viewed").length;
  const llmCouncilRuns = completed.filter((a) => a.artifacts?.llmPowered).length;
  const llmQuotaDegradedRuns = completed.filter(
    (a) => a.artifacts?.llmCouncilMeta?.quotaDegraded || a.artifacts?.llmFallbackReason,
  ).length;

  const avgIncrementalSavingsPercent =
    savingsValues.length > 0
      ? savingsValues.reduce((sum, v) => sum + v, 0) / savingsValues.length
      : 0;

  const smallDiffSavingsRate =
    smallDiff.length > 0 ? smallDiffMeetingTarget.length / smallDiff.length : 0;

  return {
    incrementalAnalyses: incremental.length,
    incrementalWithSavings: savingsValues.filter((v) => v > 0).length,
    avgIncrementalSavingsPercent,
    smallDiffAnalyses: smallDiff.length,
    smallDiffMeetingTarget: smallDiffMeetingTarget.length,
    smallDiffSavingsRate,
    evidenceLedgerOpens,
    contradictionViews,
    llmCouncilRuns,
    llmQuotaDegradedRuns,
    gates: {
      incrementalSavingsMet: smallDiffSavingsRate >= 0.85 || smallDiff.length === 0,
    },
  };
}