export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export function isLlmEnabled(): boolean {
  return Boolean(process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY);
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
  const config = getLlmConfig();
  if (!config.apiKey) {
    throw new Error("LLM_API_KEY or OPENAI_API_KEY is not configured");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? config.model,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1200,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}