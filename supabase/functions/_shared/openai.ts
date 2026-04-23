import type { WordLookupResult } from "./types.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// gpt-4.1-mini pricing (per 1M tokens, USD).
const PRICE_INPUT_PER_1M = 0.40;
const PRICE_OUTPUT_PER_1M = 1.60;
const PRICE_INPUT_CACHED_PER_1M = 0.04;

export interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface OpenAiCallResult {
  result: WordLookupResult;
  usage: OpenAiUsage;
  costUsd: number;
  durationMs: number;
}

export async function callOpenAiForWordLookup(params: {
  systemPrompt: string;
  userPrompt: string;
  apiKey: string;
  model?: string;
}): Promise<OpenAiCallResult> {
  const { systemPrompt, userPrompt, apiKey, model = "gpt-4.1-mini" } = params;
  const started = Date.now();

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  const durationMs = Date.now() - started;

  if (!response.ok) {
    const body = await response.text();
    throw new OpenAiError(
      `OpenAI ${response.status}: ${body.slice(0, 200)}`,
      response.status,
    );
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new OpenAiError("OpenAI returned no content", 500);
  }

  let parsed: WordLookupResult;
  try {
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    parsed = JSON.parse(cleaned);
  } catch {
    throw new OpenAiError("OpenAI returned non-JSON content", 500);
  }

  const rawUsage = json?.usage ?? {};
  const cached = rawUsage.prompt_tokens_details?.cached_tokens ?? 0;
  const usage: OpenAiUsage = {
    prompt_tokens: rawUsage.prompt_tokens ?? 0,
    completion_tokens: rawUsage.completion_tokens ?? 0,
    cached_tokens: cached,
    total_tokens: rawUsage.total_tokens ?? 0,
  };

  const uncachedInput = Math.max(0, usage.prompt_tokens - usage.cached_tokens);
  const costUsd =
    (uncachedInput * PRICE_INPUT_PER_1M +
      usage.cached_tokens * PRICE_INPUT_CACHED_PER_1M +
      usage.completion_tokens * PRICE_OUTPUT_PER_1M) /
    1_000_000;

  return { result: parsed, usage, costUsd, durationMs };
}

export class OpenAiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
