import { describe, expect, it } from "vitest";
import { estimateCompletionCostUsd, parseLlmProviders } from "./provider.js";

describe("parseLlmProviders", () => {
  it("returns primary and fallback providers from env", () => {
    const prevPrimary = process.env.LLM_API_KEY;
    const prevFallback = process.env.LLM_FALLBACK_API_KEY;
    process.env.LLM_API_KEY = "sk-primary";
    process.env.LLM_FALLBACK_API_KEY = "sk-fallback";
    process.env.LLM_FALLBACK_BASE_URL = "https://api.openai.com/v1";

    const providers = parseLlmProviders();
    expect(providers.length).toBeGreaterThanOrEqual(2);
    expect(providers[0]?.name).toBe("primary");
    expect(providers[1]?.name).toBe("fallback");

    process.env.LLM_API_KEY = prevPrimary;
    process.env.LLM_FALLBACK_API_KEY = prevFallback;
  });
});

describe("estimateCompletionCostUsd", () => {
  it("returns a positive estimate for non-empty messages", () => {
    const cost = estimateCompletionCostUsd([{ role: "user", content: "hello world" }], 500);
    expect(cost).toBeGreaterThan(0);
  });
});