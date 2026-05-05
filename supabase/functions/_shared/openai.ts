import type { WordLookupResult } from "./types.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Per-model pricing (per 1M tokens, USD). Verify against the OpenAI pricing
// page when adding a new model — these values directly drive cost telemetry
// and the monthly budget enforcement in limits.ts.
const PRICING: Record<string, { input: number; output: number; cached: number }> = {
  "gpt-4.1-mini": { input: 0.40, output: 1.60, cached: 0.04 },
  "gpt-4.1": { input: 2.00, output: 8.00, cached: 0.20 },
  "gpt-5-mini": { input: 0.25, output: 2.00, cached: 0.025 },
  "gpt-5": { input: 1.25, output: 10.00, cached: 0.125 },
};
const DEFAULT_MODEL = "gpt-4.1-mini";

export function priceFor(model: string) {
  return PRICING[model] ?? PRICING[DEFAULT_MODEL];
}

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

// Retry transient errors: 408 timeout, 429 rate-limit, 5xx, network failures,
// and one-time JSON parse failures (model hiccup). 4xx other than 408/429 are
// permanent (auth, malformed request) and NOT retried.
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callOpenAiOnce(params: {
  systemPrompt: string;
  userPrompt: string;
  apiKey: string;
  model: string;
}): Promise<OpenAiCallResult> {
  const { systemPrompt, userPrompt, apiKey, model } = params;
  const started = Date.now();

  // gpt-5 family runs an internal "reasoning" pass before output, which can
  // add 5-30s of latency for tasks that don't need it (factual word lookup
  // doesn't). Setting reasoning_effort: "minimal" skips that pass and brings
  // latency in line with gpt-4.1-mini while preserving gpt-5's stronger
  // instruction-following on structured outputs (e.g. gender field).
  // gpt-4.1 family ignores this parameter — safe to send unconditionally for
  // gpt-5 only.
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  };
  if (model.startsWith("gpt-5")) {
    body.reasoning_effort = "low";
  }
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
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
  const p = priceFor(model);
  const costUsd =
    (uncachedInput * p.input +
      usage.cached_tokens * p.cached +
      usage.completion_tokens * p.output) /
    1_000_000;

  return { result: parsed, usage, costUsd, durationMs };
}

export async function callOpenAiForWordLookup(params: {
  systemPrompt: string;
  userPrompt: string;
  apiKey: string;
  model?: string;
}): Promise<OpenAiCallResult> {
  const { model = DEFAULT_MODEL } = params;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callOpenAiOnce({ ...params, model });
    } catch (err) {
      lastErr = err as Error;
      const isOpenAiErr = err instanceof OpenAiError;
      const status = isOpenAiErr ? (err as OpenAiError).status : 0;
      // Permanent failure: don't retry 4xx (except 408/429).
      if (isOpenAiErr && status >= 400 && status < 500 && !isTransientStatus(status)) {
        throw err;
      }
      // Transient or retryable error → backoff and retry, unless out of attempts.
      if (attempt < MAX_ATTEMPTS) {
        const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(`OpenAI attempt ${attempt} failed (${status || "network"}): ${(err as Error).message?.slice(0, 100)}. Retrying in ${backoff}ms.`);
        await sleep(backoff);
        continue;
      }
    }
  }

  throw lastErr ?? new OpenAiError("OpenAI: exhausted retries", 500);
}

export class OpenAiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
