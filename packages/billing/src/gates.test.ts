import { describe, expect, it } from "vitest";
import {
  assertAnalysisAllowed,
  assertFeature,
  assertLlmCouncilAllowed,
  BillingGateError,
  defaultSubscription,
  hasFeature,
} from "./gates.js";
import { createEmptyUsage } from "./metering.js";
import { PLAN_CATALOG } from "./plans.js";

describe("billing gates", () => {
  it("free plan blocks webhooks and live re-analysis", () => {
    const sub = defaultSubscription("ws_1");
    expect(hasFeature(sub, "webhooks")).toBe(false);
    expect(hasFeature(sub, "live_reanalysis")).toBe(false);
    expect(() => assertFeature(sub, "webhooks")).toThrow(BillingGateError);
  });

  it("pro plan allows continuous analysis within monthly limits", () => {
    const sub = {
      ...defaultSubscription("ws_1"),
      plan: "pro" as const,
      status: "active" as const,
    };
    const usage = createEmptyUsage("ws_1");
    expect(() =>
      assertAnalysisAllowed({ subscription: sub, usage }, "github_webhook"),
    ).not.toThrow();
  });

  it("free plan enforces analysis quota", () => {
    const sub = defaultSubscription("ws_1");
    const usage = {
      ...createEmptyUsage("ws_1"),
      analysesCount: PLAN_CATALOG.free.limits.analysesPerMonth,
    };
    expect(() => assertAnalysisAllowed({ subscription: sub, usage }, "manual")).toThrow(
      BillingGateError,
    );
  });

  it("pro plan enforces LLM cost cap", () => {
    const sub = {
      ...defaultSubscription("ws_1"),
      plan: "pro" as const,
      status: "active" as const,
    };
    const usage = {
      ...createEmptyUsage("ws_1"),
      llmCostUsd: PLAN_CATALOG.pro.limits.llmCostCapUsdPerMonth,
    };
    expect(() => assertLlmCouncilAllowed({ subscription: sub, usage })).toThrow(BillingGateError);
  });
});