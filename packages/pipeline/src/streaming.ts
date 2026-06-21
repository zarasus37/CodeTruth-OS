import type { AnalysisStage, PipelineStreamEvent } from "@codetruth/core";

export type StreamCallback = (event: PipelineStreamEvent) => void | Promise<void>;

export async function emitStream(
  analysisId: string,
  stage: AnalysisStage,
  progress: number,
  partial: PipelineStreamEvent["partial"],
  onStream?: StreamCallback,
): Promise<void> {
  if (!onStream) return;
  await onStream({
    analysisId,
    stage,
    progress,
    timestamp: new Date().toISOString(),
    partial,
  });
}