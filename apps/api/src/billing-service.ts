import type { AnalysisTriggerSource, WorkspaceSubscription } from "@codetruth/core";
import {
  assertAnalysisAllowed,
  assertFeature,
  assertFileUploadAllowed,
  assertLlmCouncilAllowed,
  assertProjectCreateAllowed,
  assertSeatInviteAllowed,
  BillingGateError,
  createEmptyUsage,
  currentUsagePeriod,
  defaultSubscription,
  getPlanDefinition,
  incrementUsage,
  resolveActivePlan,
} from "@codetruth/billing";
import type { FastifyReply } from "fastify";
import { store } from "./context.js";

export { BillingGateError };

export async function getOrCreateSubscription(
  workspaceId: string,
): Promise<WorkspaceSubscription> {
  const existing = await store.getWorkspaceSubscription(workspaceId);
  if (existing) return existing;
  const subscription = defaultSubscription(workspaceId);
  await store.saveWorkspaceSubscription(subscription);
  return subscription;
}

export async function getOrCreateUsage(workspaceId: string) {
  const period = currentUsagePeriod();
  const existing = await store.getWorkspaceUsage(workspaceId, period);
  if (existing) return existing;
  const usage = createEmptyUsage(workspaceId, period);
  await store.saveWorkspaceUsage(usage);
  return usage;
}

export async function buildGateContext(workspaceId: string) {
  const [subscription, usage, projects, members] = await Promise.all([
    getOrCreateSubscription(workspaceId),
    getOrCreateUsage(workspaceId),
    store.listProjects(workspaceId),
    store.listWorkspaceMembers(workspaceId),
  ]);

  return {
    subscription,
    usage,
    projectCount: projects.length,
    memberCount: members.length,
  };
}

export function sendBillingError(reply: FastifyReply, error: BillingGateError) {
  return reply.code(402).send({
    error: error.message,
    code: error.code,
    upgradePlan: error.upgradePlan,
  });
}

export async function enforceAnalysisGate(
  workspaceId: string,
  triggeredBy: AnalysisTriggerSource,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const ctx = await buildGateContext(workspaceId);
    assertAnalysisAllowed(ctx, triggeredBy);
    return true;
  } catch (error) {
    if (error instanceof BillingGateError) {
      sendBillingError(reply, error);
      return false;
    }
    throw error;
  }
}

export async function enforceProjectCreateGate(
  workspaceId: string,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const ctx = await buildGateContext(workspaceId);
    assertProjectCreateAllowed(ctx);
    return true;
  } catch (error) {
    if (error instanceof BillingGateError) {
      sendBillingError(reply, error);
      return false;
    }
    throw error;
  }
}

export async function enforceFileUploadGate(
  workspaceId: string,
  fileCount: number,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const ctx = await buildGateContext(workspaceId);
    assertFileUploadAllowed(ctx, fileCount);
    return true;
  } catch (error) {
    if (error instanceof BillingGateError) {
      sendBillingError(reply, error);
      return false;
    }
    throw error;
  }
}

export async function enforceFeatureGate(
  workspaceId: string,
  feature: Parameters<typeof assertFeature>[1],
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const subscription = await getOrCreateSubscription(workspaceId);
    assertFeature(subscription, feature);
    return true;
  } catch (error) {
    if (error instanceof BillingGateError) {
      sendBillingError(reply, error);
      return false;
    }
    throw error;
  }
}

export async function enforceSeatInviteGate(
  workspaceId: string,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const ctx = await buildGateContext(workspaceId);
    assertSeatInviteAllowed(ctx);
    return true;
  } catch (error) {
    if (error instanceof BillingGateError) {
      sendBillingError(reply, error);
      return false;
    }
    throw error;
  }
}

export async function recordAnalysisUsage(workspaceId: string): Promise<void> {
  const usage = await getOrCreateUsage(workspaceId);
  await store.saveWorkspaceUsage(incrementUsage(usage, "analysesCount"));
}

export async function recordLlmCouncilUsage(workspaceId: string): Promise<void> {
  const usage = await getOrCreateUsage(workspaceId);
  await store.saveWorkspaceUsage(incrementUsage(usage, "llmCouncilRuns"));
}

export async function recordProjectCreatedUsage(workspaceId: string): Promise<void> {
  const usage = await getOrCreateUsage(workspaceId);
  await store.saveWorkspaceUsage(incrementUsage(usage, "projectsCreated"));
}

export async function getBillingSummary(workspaceId: string) {
  const ctx = await buildGateContext(workspaceId);
  const plan = resolveActivePlan(ctx.subscription);
  const definition = getPlanDefinition(plan);

  return {
    subscription: ctx.subscription,
    usage: ctx.usage,
    plan: definition,
    limits: definition.limits,
    features: definition.features,
  };
}

export async function shouldUseLlmCouncil(workspaceId: string): Promise<boolean> {
  try {
    const ctx = await buildGateContext(workspaceId);
    assertLlmCouncilAllowed(ctx);
    return true;
  } catch {
    return false;
  }
}