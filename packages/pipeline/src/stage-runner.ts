import type { AnalysisStage, PipelineDiagnostics, PipelineStageFailure } from "@codetruth/core";
import { PipelineError } from "./errors.js";
import { beginStage, completeStage, recordFailure } from "./diagnostics.js";

export interface IsolatedOperationContext {
  stage: AnalysisStage;
  scope: PipelineStageFailure["scope"];
  target?: string;
}

export async function runIsolatedOperation<T>(
  diagnostics: PipelineDiagnostics,
  context: IsolatedOperationContext,
  fn: () => Promise<T> | T,
  fallback: (error: unknown) => T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordFailure(diagnostics, {
      stage: context.stage,
      scope: context.scope,
      target: context.target,
      message,
      degraded: true,
    });
    return fallback(error);
  }
}

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