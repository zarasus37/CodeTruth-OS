import type { WorkspaceUsage } from "@codetruth/core";

export function currentUsagePeriod(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function createEmptyUsage(workspaceId: string, period = currentUsagePeriod()): WorkspaceUsage {
  return {
    workspaceId,
    period,
    analysesCount: 0,
    llmCouncilRuns: 0,
    projectsCreated: 0,
    llmCostUsd: 0,
  };
}

export function incrementUsage(
  usage: WorkspaceUsage,
  field: keyof Pick<WorkspaceUsage, "analysesCount" | "llmCouncilRuns" | "projectsCreated">,
  amount = 1,
): WorkspaceUsage {
  return {
    ...usage,
    [field]: usage[field] + amount,
  };
}

export function addLlmCost(usage: WorkspaceUsage, costUsd: number): WorkspaceUsage {
  return {
    ...usage,
    llmCostUsd: Math.round(((usage.llmCostUsd ?? 0) + costUsd) * 10000) / 10000,
  };
}