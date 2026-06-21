import type { AnalysisStage, PipelineDiagnostics } from "@codetruth/core";
import { PipelineError } from "./errors.js";
import { beginStage, completeStage, recordFailure } from "./diagnostics.js";

export async function runIsolatedStage<T>(
  diagnostics: PipelineDiagnostics,
  stage: AnalysisStage,
  fn: () => Promise<T>,
  fallback: (error: unknown) => T,
): Promise<T> {
  beginStage(diagnostics, stage);
  try {
    const result = await fn();
    completeStage(diagnostics, stage, "completed");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const scope =
      error instanceof PipelineError ? error.scope : ("stage" as const);
    const target = error instanceof PipelineError ? error.target : undefined;

    recordFailure(diagnostics, {
      stage,
      scope,
      target,
      message,
      degraded: true,
    });
    completeStage(diagnostics, stage, "degraded", message);
    return fallback(error);
  }
}