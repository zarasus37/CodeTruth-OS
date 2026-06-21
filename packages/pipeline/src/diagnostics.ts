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
    evidenceCorrectionsByStage: {},
    isolatedTargets: [],
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
  record.durationMs = Math.max(
    0,
    new Date(record.completedAt).getTime() - new Date(record.startedAt).getTime(),
  );
}

export function recordFailure(diagnostics: PipelineDiagnostics, failure: PipelineStageFailure): void {
  diagnostics.failures.push(failure);
  if (failure.target) {
    recordIsolatedTarget(diagnostics, failure.target);
  }
}

export function recordIsolatedTarget(diagnostics: PipelineDiagnostics, target: string): void {
  if (!diagnostics.isolatedTargets) diagnostics.isolatedTargets = [];
  if (!diagnostics.isolatedTargets.includes(target)) {
    diagnostics.isolatedTargets.push(target);
  }
}

export function recordEvidenceCorrections(
  diagnostics: PipelineDiagnostics,
  stage: AnalysisStage,
  count: number,
): void {
  if (count <= 0) return;
  diagnostics.evidenceViolationsCorrected += count;
  if (!diagnostics.evidenceCorrectionsByStage) diagnostics.evidenceCorrectionsByStage = {};
  diagnostics.evidenceCorrectionsByStage[stage] =
    (diagnostics.evidenceCorrectionsByStage[stage] ?? 0) + count;

  const record = [...diagnostics.stages].reverse().find((s) => s.stage === stage);
  if (record) {
    record.evidenceCorrections = (record.evidenceCorrections ?? 0) + count;
  }
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

export function formatConfidenceDistribution(
  summary: Partial<Record<ConfidenceLevel, number>> | undefined,
): string {
  if (!summary) return "n/a";
  return CONFIDENCE_LEVELS.filter((level) => (summary[level] ?? 0) > 0)
    .map((level) => `${level}: ${summary[level]}`)
    .join(", ");
}