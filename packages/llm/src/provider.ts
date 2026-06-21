import type { LlmCompletionOptions, LlmMessage } from "./client.js";

export interface LlmProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmCompletionResult {
  content: string;
  provider: string;
  model: string;
  estimatedCostUsd: number;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_PROVIDER = 3;

/** Rough token pricing for cost-cap metering (USD per 1K tokens). */
const DEFAULT_COST_PER_1K_TOKENS = 0.002;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(messages: LlmMessage[], maxTokens: number): number {
  const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const inputTokens = Math.ceil(inputChars / 4);
  return inputTokens + maxTokens;
}

export function estimateCompletionCostUsd(
  messages: LlmMessage[],
  maxTokens = 1200,
  costPer1k = DEFAULT_COST_PER_1K_TOKENS,
): number {
  const tokens = estimateTokens(messages, maxTokens);
  return Math.round((tokens / 1000) * costPer1k * 10000) / 10000;
}

export function parseLlmProviders(): LlmProvider[] {
  const providers: LlmProvider[] = [];

  const rawChain = process.env.LLM_PROVIDER_CHAIN?.trim();
  if (rawChain) {
    try {
      const parsed = JSON.parse(rawChain) as LlmProvider[];
      for (const entry of parsed) {
        if (entry.baseUrl && entry.apiKey && entry.model) {
          providers.push({
            name: entry.name ?? "chain",
            baseUrl: entry.baseUrl.replace(/\/$/, ""),
            apiKey: entry.apiKey,
            model: entry.model,
          });
        }
      }
      if (providers.length) return providers;
    } catch {
      // fall through to env defaults
    }
  }

  const primaryKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (primaryKey) {
    providers.push({
      name: "primary",
      baseUrl: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
      apiKey: primaryKey,
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    });
  }

  const fallbackKey = process.env.LLM_FALLBACK_API_KEY;
  if (fallbackKey) {
    providers.push({
      name: process.env.LLM_FALLBACK_NAME ?? "fallback",
      baseUrl: (process.env.LLM_FALLBACK_BASE_URL ?? "https://api.openai.com/v1").replace(
        /\/$/,
        "",
      ),
      apiKey: fallbackKey,
      model: process.env.LLM_FALLBACK_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini",
    });
  }

  return providers;
}

async function requestProvider(
  provider: LlmProvider,
  messages: LlmMessage[],
  options: LlmCompletionOptions,
): Promise<LlmCompletionResult> {
  const maxTokens = options.maxTokens ?? 1200;
  let lastError = "Unknown LLM error";

  for (let attempt = 0; attempt < MAX_RETRIES_PER_PROVIDER; attempt++) {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? provider.model,
        temperature: options.temperature ?? 0.2,
        max_tokens: maxTokens,
        messages,
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
      return {
        content,
        provider: provider.name,
        model: options.model ?? provider.model,
        estimatedCostUsd: estimateCompletionCostUsd(messages, maxTokens),
      };
    }

    const text = await response.text();
    lastError = `LLM request failed (${response.status}): ${text.slice(0, 300)}`;

    if (!RETRYABLE_STATUSES.has(response.status)) {
      throw new Error(lastError);
    }

    const retryAfter = response.headers.get("retry-after");
    const delayMs = retryAfter
      ? Math.min(Number(retryAfter) * 1000, 30_000)
      : Math.min(1000 * 2 ** attempt, 8000);
    await sleep(delayMs);
  }

  throw new Error(lastError);
}

export async function completeChatWithFailover(
  messages: LlmMessage[],
  options: LlmCompletionOptions = {},
): Promise<LlmCompletionResult> {
  const providers = parseLlmProviders();
  if (!providers.length) {
    throw new Error("LLM_API_KEY or OPENAI_API_KEY is not configured");
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      return await requestProvider(provider, messages, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM provider failed";
      errors.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(`All LLM providers failed: ${errors.join(" | ")}`);
}