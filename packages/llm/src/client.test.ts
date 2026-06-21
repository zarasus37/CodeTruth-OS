import { describe, expect, it } from "vitest";
import { isLlmEnabled } from "./client.js";

describe("isLlmEnabled", () => {
  it("reflects environment configuration", () => {
    const original = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(isLlmEnabled()).toBe(false);
    process.env.LLM_API_KEY = original;
  });
});