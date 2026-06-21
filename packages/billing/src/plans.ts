import type { BillingFeature, SubscriptionPlan } from "@codetruth/core";

export interface PlanLimits {
  workspaces: number;
  projectsPerWorkspace: number;
  filesPerProject: number;
  analysesPerMonth: number;
  llmCouncilRunsPerMonth: number;
  /** Estimated monthly LLM spend cap (USD) for Truth Council. */
  llmCostCapUsdPerMonth: number;
  seatsIncluded: number;
  maxSeats: number;
}

export interface PlanPricing {
  monthlyUsd: number | null;
  yearlyUsd: number | null;
  additionalSeatUsd: number | null;
  stripePriceMonthly?: string;
  stripePriceYearly?: string;
  stripePriceTeamMonthly?: string;
}

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  tagline: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  features: BillingFeature[];
}

/** Researched optimal pricing for CodeTruth OS (June 2026). */
export const PLAN_CATALOG: Record<SubscriptionPlan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Builder",
    tagline: "Manual truth analysis for solo builders",
    pricing: {
      monthlyUsd: 0,
      yearlyUsd: 0,
      additionalSeatUsd: null,
    },
    limits: {
      workspaces: 1,
      projectsPerWorkspace: 2,
      filesPerProject: 500,
      analysesPerMonth: 3,
      llmCouncilRunsPerMonth: 0,
      llmCostCapUsdPerMonth: 0,
      seatsIncluded: 1,
      maxSeats: 1,
    },
    features: [],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Continuous cognition for serious engineering teams",
    pricing: {
      monthlyUsd: 79,
      yearlyUsd: 790,
      additionalSeatUsd: null,
      stripePriceMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      stripePriceYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
    },
    limits: {
      workspaces: 3,
      projectsPerWorkspace: 15,
      filesPerProject: 5_000,
      analysesPerMonth: 30,
      llmCouncilRunsPerMonth: 15,
      llmCostCapUsdPerMonth: 5,
      seatsIncluded: 1,
      maxSeats: 3,
    },
    features: [
      "continuous_analysis",
      "webhooks",
      "live_reanalysis",
      "spatial_navigator",
      "exports",
      "snapshot_history",
      "llm_council",
      "portfolio",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "Institutional governance for agencies and platform teams",
    pricing: {
      monthlyUsd: 449,
      yearlyUsd: 4_490,
      additionalSeatUsd: 49,
      stripePriceTeamMonthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    },
    limits: {
      workspaces: 10,
      projectsPerWorkspace: 50,
      filesPerProject: 20_000,
      analysesPerMonth: 150,
      llmCouncilRunsPerMonth: 75,
      llmCostCapUsdPerMonth: 25,
      seatsIncluded: 5,
      maxSeats: 50,
    },
    features: [
      "continuous_analysis",
      "webhooks",
      "live_reanalysis",
      "spatial_navigator",
      "exports",
      "snapshot_history",
      "llm_council",
      "portfolio",
      "compliance_audit_export",
      "rbac_advanced",
      "team_seats",
      "quality_gate",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "SSO, SLA, and portfolio governance at scale",
    pricing: {
      monthlyUsd: 1_200,
      yearlyUsd: 14_400,
      additionalSeatUsd: null,
    },
    limits: {
      workspaces: 999,
      projectsPerWorkspace: 999,
      filesPerProject: 100_000,
      analysesPerMonth: 999,
      llmCouncilRunsPerMonth: 999,
      llmCostCapUsdPerMonth: 999,
      seatsIncluded: 25,
      maxSeats: 999,
    },
    features: [
      "continuous_analysis",
      "webhooks",
      "live_reanalysis",
      "spatial_navigator",
      "exports",
      "snapshot_history",
      "llm_council",
      "portfolio",
      "compliance_audit_export",
      "rbac_advanced",
      "team_seats",
      "quality_gate",
      "sso",
      "data_residency",
      "marketplace_analyzers",
      "sovereign_services",
    ],
  },
};

export const ANNUAL_DISCOUNT_PERCENT = 17;

export function getPlanDefinition(plan: SubscriptionPlan): PlanDefinition {
  return PLAN_CATALOG[plan];
}

export function effectivePlan(
  plan: SubscriptionPlan,
  status: string,
): SubscriptionPlan {
  if (status === "active" || status === "trialing") return plan;
  return "free";
}

export function listPublicPlans(): PlanDefinition[] {
  return [PLAN_CATALOG.free, PLAN_CATALOG.pro, PLAN_CATALOG.team];
}