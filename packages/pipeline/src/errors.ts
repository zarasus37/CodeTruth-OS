import type { AnalysisStage } from "@codetruth/core";

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly stage: AnalysisStage,
    readonly scope: "stage" | "file" | "analyzer" = "stage",
    readonly target?: string,
    readonly degraded = true,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}