import { completeChatWithFailover, estimateCompletionCostUsd } from "./provider.js";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmCompletionMeta {
  provider: string;
  model: string;
  estimatedCostUsd: number;
}

let sessionCostUsd = 0;

export function resetSessionLlmCost(): void {
  sessionCostUsd = 0;
}

export function getSessionLlmCostUsd(): number {
  return sessionCostUsd;
}

export function isLlmEnabled(): boolean {
  return Boolean(process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.LLM_FALLBACK_API_KEY);
}

export function getLlmConfig() {
  return {
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    baseUrl: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
  };
}

/** Per-council-model override via LLM_MODEL_ARCHITECTURE_MODEL, etc. */
export function getCouncilModel(councilModel: string): string {
  const envKey = `LLM_MODEL_${councilModel.replace(/\s+/g, "_").toUpperCase()}`;
  return process.env[envKey] ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
}

export async function completeChat(
  messages: LlmMessage[],
  options: LlmCompletionOptions = {},
): Promise<string> {
  const result = await completeChatWithMeta(messages, options);
  return result.content;
}

export async function completeChatWithMeta(
  messages: LlmMessage[],
  options: LlmCompletionOptions = {},
): Promise<LlmCompletionMeta & { content: string }> {
  const maxTokens = options.maxTokens ?? 1200;
  const result = await completeChatWithFailover(messages, options);
  sessionCostUsd += result.estimatedCostUsd;
  return {
    content: result.content,
    provider: result.provider,
    model: result.model,
    estimatedCostUsd: result.estimatedCostUsd,
  };
}

export { estimateCompletionCostUsd };