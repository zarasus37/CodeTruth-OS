import type {
  AnalysisStage,
  ConfidenceLevel,
  Finding,
  PipelineDiagnostics,
  PipelineEntityState,
  PipelineStageFailure,
  PipelineStageRecord,
} from "@codetruth/core";
import { CONFIDENCE_LEVELS } from "@codetruth/core";

export function createDiagnostics(): PipelineDiagnostics {
  return {
    stages: [],
    failures: [],
    confidenceSummary: {},
    evidenceViolationsCorrected: 0,
  };
}

export function beginStage(diagnostics: PipelineDiagnostics, stage: AnalysisStage): void {
  diagnostics.stages.push({
    stage,
    state: "running",
    startedAt: new Date().toISOString(),
  });
}

export function completeStage(
  diagnostics: PipelineDiagnostics,
  stage: AnalysisStage,
  state: PipelineEntityState,
  error?: string,
): void {
  const record = [...diagnostics.stages].reverse().find((s) => s.stage === stage && !s.completedAt);
  if (!record) return;
  record.state = state;
  record.completedAt = new Date().toISOString();
  if (error) record.error = error;
}

export function recordFailure(diagnostics: PipelineDiagnostics, failure: PipelineStageFailure): void {
  diagnostics.failures.push(failure);
}

export function buildConfidenceSummary(findings: Finding[]): Partial<Record<ConfidenceLevel, number>> {
  const summary: Partial<Record<ConfidenceLevel, number>> = {};
  for (const level of CONFIDENCE_LEVELS) summary[level] = 0;
  for (const finding of findings) {
    summary[finding.confidence] = (summary[finding.confidence] ?? 0) + 1;
  }
  return summary;
}

export function stageSnapshot(diagnostics: PipelineDiagnostics): {
  stageFailures: number;
  lastStageState?: PipelineEntityState;
} {
  const last = diagnostics.stages.at(-1);
  return {
    stageFailures: diagnostics.failures.length,
    lastStageState: last?.state,
  };
}

export function listStageRecords(diagnostics: PipelineDiagnostics): PipelineStageRecord[] {
  return diagnostics.stages;
}