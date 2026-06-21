import type {
  BillingFeature,
  SubscriptionPlan,
  SubscriptionStatus,
  WorkspaceSubscription,
  WorkspaceUsage,
} from "@codetruth/core";
import { effectivePlan, getPlanDefinition } from "./plans.js";

export interface GateContext {
  subscription: WorkspaceSubscription;
  usage: WorkspaceUsage;
  memberCount?: number;
  projectCount?: number;
  fileCount?: number;
}

export class BillingGateError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly upgradePlan?: SubscriptionPlan,
  ) {
    super(message);
    this.name = "BillingGateError";
  }
}

export function resolveActivePlan(subscription: WorkspaceSubscription): SubscriptionPlan {
  return effectivePlan(subscription.plan, subscription.status);
}

export function hasFeature(subscription: WorkspaceSubscription, feature: BillingFeature): boolean {
  const plan = resolveActivePlan(subscription);
  return getPlanDefinition(plan).features.includes(feature);
}

export function assertFeature(subscription: WorkspaceSubscription, feature: BillingFeature): void {
  if (!hasFeature(subscription, feature)) {
    const requiredPlan: SubscriptionPlan =
      feature === "team_seats" || feature === "compliance_audit_export" || feature === "rbac_advanced"
        ? "team"
        : "pro";
    throw new BillingGateError(
      `${feature} requires the ${requiredPlan} plan`,
      "plan_upgrade_required",
      requiredPlan,
    );
  }
}

export function assertAnalysisAllowed(ctx: GateContext, triggeredBy?: string): void {
  const plan = resolveActivePlan(ctx.subscription);
  const limits = getPlanDefinition(plan).limits;

  if (triggeredBy === "github_webhook" || triggeredBy === "scheduled") {
    assertFeature(ctx.subscription, "continuous_analysis");
  }

  if (triggeredBy === "reanalysis" || triggeredBy === "scheduled") {
    assertFeature(ctx.subscription, "live_reanalysis");
  }

  if (ctx.usage.analysesCount >= limits.analysesPerMonth) {
    throw new BillingGateError(
      `Monthly analysis limit reached (${limits.analysesPerMonth}/${limits.analysesPerMonth})`,
      "usage_limit_exceeded",
      plan === "free" ? "pro" : "team",
    );
  }
}

export function assertProjectCreateAllowed(ctx: GateContext): void {
  const plan = resolveActivePlan(ctx.subscription);
  const limits = getPlanDefinition(plan).limits;
  const projectCount = ctx.projectCount ?? 0;

  if (projectCount >= limits.projectsPerWorkspace) {
    throw new BillingGateError(
      `Project limit reached (${limits.projectsPerWorkspace} on ${plan})`,
      "project_limit_exceeded",
      plan === "free" ? "pro" : "team",
    );
  }
}

export function assertFileUploadAllowed(ctx: GateContext, fileCount: number): void {
  const plan = resolveActivePlan(ctx.subscription);
  const limits = getPlanDefinition(plan).limits;

  if (fileCount > limits.filesPerProject) {
    throw new BillingGateError(
      `Upload exceeds file limit (${fileCount} > ${limits.filesPerProject} on ${plan})`,
      "file_limit_exceeded",
      plan === "free" ? "pro" : "team",
    );
  }
}

export function assertLlmCouncilAllowed(ctx: GateContext): void {
  assertFeature(ctx.subscription, "llm_council");
  const plan = resolveActivePlan(ctx.subscription);
  const limits = getPlanDefinition(plan).limits;

  if (limits.llmCouncilRunsPerMonth === 0) {
    throw new BillingGateError(
      "LLM Truth Council requires Pro or higher",
      "plan_upgrade_required",
      "pro",
    );
  }

  if (ctx.usage.llmCouncilRuns >= limits.llmCouncilRunsPerMonth) {
    throw new BillingGateError(
      `Monthly LLM council limit reached (${limits.llmCouncilRunsPerMonth})`,
      "usage_limit_exceeded",
      plan === "pro" ? "team" : "enterprise",
    );
  }

  const spent = ctx.usage.llmCostUsd ?? 0;
  if (limits.llmCostCapUsdPerMonth > 0 && spent >= limits.llmCostCapUsdPerMonth) {
    throw new BillingGateError(
      `Monthly LLM cost cap reached ($${limits.llmCostCapUsdPerMonth})`,
      "llm_cost_cap_exceeded",
      plan === "pro" ? "team" : "enterprise",
    );
  }
}

export function canUseLlmCouncil(ctx: GateContext): boolean {
  try {
    assertLlmCouncilAllowed(ctx);
    return true;
  } catch {
    return false;
  }
}

export function assertSeatInviteAllowed(ctx: GateContext): void {
  assertFeature(ctx.subscription, "team_seats");
  const plan = resolveActivePlan(ctx.subscription);
  const limits = getPlanDefinition(plan).limits;
  const seats = ctx.subscription.seatCount ?? limits.seatsIncluded;
  const memberCount = ctx.memberCount ?? 1;

  if (memberCount >= seats) {
    throw new BillingGateError(
      `Seat limit reached (${memberCount}/${seats}). Add seats or upgrade.`,
      "seat_limit_exceeded",
      "team",
    );
  }
}

export function defaultSubscription(workspaceId: string): WorkspaceSubscription {
  return {
    workspaceId,
    plan: "free",
    status: "active",
    updatedAt: new Date().toISOString(),
  };
}

export function isSubscriptionBillable(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}