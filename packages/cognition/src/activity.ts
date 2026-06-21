import { createId } from "@codetruth/core";
import type { AnalysisJob, CognitionActivityEvent, CognitionActivityType } from "@codetruth/core";

export function createActivityEvent(input: {
  workspaceId: string;
  projectId?: string;
  analysisId?: string;
  type: CognitionActivityType;
  summary: string;
  metadata?: Record<string, unknown>;
}): CognitionActivityEvent {
  return {
    id: createId("activity"),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    type: input.type,
    timestamp: new Date().toISOString(),
    summary: input.summary,
    metadata: input.metadata,
  };
}

export function activityFromAnalysis(
  workspaceId: string,
  analysis: AnalysisJob,
  projectName: string,
): CognitionActivityEvent | undefined {
  if (analysis.status === "completed") {
    const score = analysis.artifacts?.scorecard.overall;
    const findings = analysis.artifacts?.findings.length ?? 0;
    return createActivityEvent({
      workspaceId,
      projectId: analysis.projectId,
      analysisId: analysis.id,
      type: "analysis_completed",
      summary: `${projectName} analysis completed · score ${score ?? "—"} · ${findings} findings`,
      metadata: {
        triggeredBy: analysis.triggeredBy,
        overallScore: score,
        findingCount: findings,
      },
    });
  }

  if (analysis.status === "failed") {
    return createActivityEvent({
      workspaceId,
      projectId: analysis.projectId,
      analysisId: analysis.id,
      type: "analysis_failed",
      summary: `${projectName} analysis failed: ${analysis.error ?? "unknown error"}`,
      metadata: { triggeredBy: analysis.triggeredBy },
    });
  }

  if (analysis.status === "queued" || analysis.status === "ingestion") {
    return createActivityEvent({
      workspaceId,
      projectId: analysis.projectId,
      analysisId: analysis.id,
      type: "analysis_started",
      summary: `${projectName} analysis started (${analysis.triggeredBy ?? "manual"})`,
      metadata: { triggeredBy: analysis.triggeredBy },
    });
  }

  return undefined;
}