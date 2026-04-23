// Edge Function: word-lookup
// -----------------------------------------------------------
// Optimized flow:
//   1. Auth — require valid JWT, extract user_id
//   2. Validate input
//   3. Check global cache — if hit, return immediately (cost = 0)
//   4. Rate-limit (single RPC: per-user + system + monthly budget)
//   5. Call OpenAI — parse JSON, compute cost
//   6. Save to cache
//   7. Log to api_calls (both hit and miss)
// -----------------------------------------------------------

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { buildUserPrompt, buildEnrichUserPrompt, buildMarkerFixPrompt, getSystemPrompt, LANG_NAMES } from "../_shared/prompts.ts";
import type { MeaningContext } from "../_shared/prompts.ts";
import { callOpenAiForWordLookup, OpenAiError } from "../_shared/openai.ts";
import { normalizeResult, fixExampleMarkers } from "../_shared/normalize.ts";
import { AI_MODEL, buildCacheKey, getFromCache, saveToCache } from "../_shared/cache.ts";
import {
  BudgetExhaustedError,
  enforceAllLimits,
  RateLimitError,
} from "../_shared/limits.ts";
import { logApiCall } from "../_shared/logging.ts";
import type {
  WordLookupMode,
  WordLookupRequest,
  WordLookupResult,
} from "../_shared/types.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const PRICE_INPUT_PER_1M = 0.40;
const PRICE_OUTPUT_PER_1M = 1.60;
const PRICE_INPUT_CACHED_PER_1M = 0.04;

const ENDPOINT = "word-lookup";

const ALLOWED_ORIGINS = new Set([
  "https://typeword.app",
  "http://localhost:8081",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ── Module-level Supabase singleton (reused across requests) ──
let _admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _admin;
}

let _corsHeaders: Record<string, string> = {};

function setCors(req: Request) {
  _corsHeaders = getCorsHeaders(req);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ..._corsHeaders },
  });
}

function validateInput(body: unknown): WordLookupRequest {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Body must be a JSON object");
  }
  const b = body as Record<string, unknown>;

  let word = typeof b.word === "string" ? b.word.trim() : "";
  // Strip commas from pure numeric input (e.g. "1,000,000" → "1000000")
  const stripped = word.replace(/,/g, "");
  if (/^\d+(\.\d+)?$/.test(stripped)) {
    word = stripped;
    if (word.length > 8) {
      throw new ValidationError("NUMBER_TOO_LONG");
    }
  } else if (/^[\d\s+\-*/^!=<>().%]+$/.test(word)) {
    if (word.length > 8) {
      throw new ValidationError("EXPRESSION_TOO_LONG");
    }
  } else if (!word || word.length > 60) {
    throw new ValidationError("word must be 1..60 chars");
  }
  if (/^\s*$/.test(word)) {
    throw new ValidationError("word must not be empty");
  }

  const SUPPORTED_LANGS = new Set(["en","ko","ja","zh","es","fr","de","it","pt","ru"]);

  const sourceLang = typeof b.sourceLang === "string" ? b.sourceLang : "";
  const targetLang = typeof b.targetLang === "string" ? b.targetLang : "";
  if (!sourceLang || !targetLang) {
    throw new ValidationError("sourceLang and targetLang required");
  }
  if (!SUPPORTED_LANGS.has(sourceLang) || !SUPPORTED_LANGS.has(targetLang)) {
    throw new ValidationError("Unsupported language");
  }

  const mode: WordLookupMode = b.mode === "enrich" ? "enrich" : "quick";

  return {
    word,
    sourceLang,
    targetLang,
    mode,
  };
}

function wantsStream(req: Request, body: Record<string, unknown>): boolean {
  if (body.stream === true) return true;
  const accept = req.headers.get("Accept") ?? "";
  return accept.includes("text/event-stream");
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Return a single SSE result frame (used for cached responses in stream mode). */
function sseResponse(data: unknown): Response {
  return new Response(sseEvent("result", data), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ..._corsHeaders,
    },
  });
}

interface StreamArgs {
  admin: SupabaseClient;
  userId: string;
  request: WordLookupRequest;
  cacheKey: string;
  useCache: boolean;
  openaiKey: string;
  startedAt: number;
  meanings?: MeaningContext[];
}

function streamLookup(args: StreamArgs): Response {
  const encoder = new TextEncoder();
  const {
    admin,
    userId,
    request,
    cacheKey,
    useCache,
    openaiKey,
    startedAt,
    meanings,
  } = args;

  const isEnrich = request.mode === "enrich";
  const userPrompt = isEnrich
    ? buildEnrichUserPrompt(request, meanings)
    : buildUserPrompt(request);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      const fail = (message: string) => {
        enqueue("error", { error: message });
        controller.close();
      };

      try {
        // Cache already checked before entering stream — go straight to OpenAI
        const openaiResp = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: "system", content: getSystemPrompt(request.mode, request.sourceLang, request.targetLang) },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            stream: true,
            stream_options: { include_usage: true },
          }),
        });

        if (!openaiResp.ok || !openaiResp.body) {
          const body = await openaiResp.text();
          fail(`OpenAI ${openaiResp.status}: ${body.slice(0, 200)}`);
          return;
        }

        const reader = openaiResp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let content = "";
        let usage: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        } | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                content += delta;
                enqueue("delta", { accumulated: content });
              }
              if (parsed.usage) usage = parsed.usage;
            } catch {
              // tolerate malformed chunk boundaries
            }
          }
        }

        let result: WordLookupResult;
        try {
          let json = content.trim();
          // Strip markdown code fences if present
          if (json.startsWith("```")) {
            json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
          }
          result = normalizeResult(JSON.parse(json), request.targetLang);
          if (!result.headword) result.headword = request.word;
          if (isEnrich && result.examples?.length) {
            const defs = meanings?.map((m) => m.definition);
            result.examples = fixExampleMarkers(
              result.examples,
              request.word,
              request.sourceLang,
              request.targetLang,
              defs,
            );
          }
        } catch {
          fail("AI returned non-JSON content");
          return;
        }

        enqueue("result", { result, cached: false, cacheKey });
        controller.close();

        const promptTokens = usage?.prompt_tokens ?? 0;
        const completionTokens = usage?.completion_tokens ?? 0;
        const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
        const uncachedInput = Math.max(0, promptTokens - cachedTokens);
        const costUsd =
          (uncachedInput * PRICE_INPUT_PER_1M +
            cachedTokens * PRICE_INPUT_CACHED_PER_1M +
            completionTokens * PRICE_OUTPUT_PER_1M) /
          1_000_000;

        if (useCache) {
          fireAndForget(saveToCache(admin, { cacheKey, req: request, result }));
        }
        fireAndForget(
          logApiCall(admin, {
            userId,
            endpoint: ENDPOINT,
            cacheHit: false,
            tokensInput: promptTokens,
            tokensOutput: completionTokens,
            costUsd,
            durationMs: Date.now() - startedAt,
            status: "ok",
          }),
        );
      } catch (err) {
        fail(err instanceof Error ? err.message : "stream error");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ..._corsHeaders,
    },
  });
}

class ValidationError extends Error {
  status = 400;
}

// Keep background work alive after the response is sent. EdgeRuntime.waitUntil
// is Supabase-specific; fall back to attaching a catch so we don't leak
// unhandled rejections on platforms that don't expose it.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function fireAndForget(p: Promise<unknown>): void {
  const safe = p.catch((err) => console.error("background task failed:", err));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(safe);
  }
}

Deno.serve(async (req: Request) => {
  _corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: _corsHeaders });
  }
  if (req.method === "GET") {
    return new Response("ok", { status: 200, headers: _corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const admin = getAdmin();
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

  // Auth: verify JWT from client
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }
  const userId = userData.user.id;

  let request: WordLookupRequest;
  let stream = false;
  let isTranslate = false;
  let meanings: MeaningContext[] | undefined;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    request = validateInput(body);
    stream = wantsStream(req, body);
    isTranslate = body.translate === true;
    if (Array.isArray(body.meanings)) {
      meanings = (body.meanings as Array<Record<string, unknown>>)
        .filter((m) => typeof m.definition === "string" && typeof m.partOfSpeech === "string")
        .map((m) => ({ definition: m.definition as string, partOfSpeech: m.partOfSpeech as string }));
      if (meanings.length === 0) meanings = undefined;
    }
  } catch (err) {
    const status = err instanceof ValidationError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Bad request";
    return jsonResponse({ error: message }, status);
  }

  const startedAt = Date.now();

  // ── Translate mode: simple word translation for reverse lookup step 1 ──
  if (isTranslate) {
    try {
      await enforceAllLimits(admin, userId);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return jsonResponse({ error: err.message }, err.status);
      }
      if (err instanceof BudgetExhaustedError) {
        return jsonResponse({ error: err.message }, err.status);
      }
      return jsonResponse({ error: "Internal error" }, 500);
    }

    try {
      const fromName = LANG_NAMES[request.targetLang] ?? request.targetLang;
      const toName = LANG_NAMES[request.sourceLang] ?? request.sourceLang;
      const { result, costUsd, durationMs, usage } =
        await callOpenAiForWordLookup({
          systemPrompt: `Translate a word from ${fromName} to ${toName}.\nIf the word has multiple distinct meanings (homonyms/polysemy), return up to 3 candidates.\nReturn ONLY this exact JSON format: {"candidates": [{"headword": "word_in_${toName}", "hint": "short_disambiguation_in_${fromName}"}]}\nExample: "은행" (Korean→English) → {"candidates": [{"headword": "bank", "hint": "금융 기관"}, {"headword": "ginkgo", "hint": "은행나무 열매"}]}\nRules:\n- Each headword MUST be in ${toName}.\n- Each hint MUST be in ${fromName}, max 10 chars.\n- If only one meaning exists, return a single candidate.\n- No other keys, no definitions beyond the hint.`,
          userPrompt: `"${request.word}"`,
          apiKey: openaiKey,
        });
      const raw = result as Record<string, unknown>;
      let candidates: Array<{ headword: string; hint: string }> = [];
      if (Array.isArray(raw.candidates)) {
        candidates = (raw.candidates as Array<Record<string, unknown>>)
          .filter((c) => typeof c.headword === "string")
          .map((c) => ({ headword: String(c.headword), hint: String(c.hint ?? "") }));
      }
      if (candidates.length === 0) {
        const hw = raw.headword ?? Object.values(raw).find((v) => typeof v === "string");
        candidates = [{ headword: String(hw ?? ""), hint: "" }];
      }
      fireAndForget(
        logApiCall(admin, {
          userId,
          endpoint: ENDPOINT,
          cacheHit: false,
          tokensInput: usage.prompt_tokens,
          tokensOutput: usage.completion_tokens,
          costUsd,
          durationMs,
          status: "ok",
        }),
      );
      return jsonResponse({ result: { candidates } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Translation failed";
      return jsonResponse({ error: message }, 500);
    }
  }
  const cacheKey = buildCacheKey(request);
  const useCache = true;

  // ── 1. Cache check FIRST (before rate limits — zero cost, skip everything) ──
  if (useCache) {
    const cached = await getFromCache(admin, cacheKey);
    if (cached) {
      fireAndForget(
        logApiCall(admin, {
          userId,
          endpoint: ENDPOINT,
          cacheHit: true,
          costUsd: 0,
          durationMs: Date.now() - startedAt,
          status: "ok",
        }),
      );
      if (stream) {
        return sseResponse({ result: cached, cached: true, cacheKey });
      }
      return jsonResponse({ result: cached, cached: true, cacheKey });
    }
  }

  // ── 2. Rate limits — single RPC (only reached on cache miss) ──
  try {
    await enforceAllLimits(admin, userId);
  } catch (err) {
    if (err instanceof RateLimitError) {
      await logApiCall(admin, {
        userId,
        endpoint: ENDPOINT,
        cacheHit: false,
        status: "rate_limited",
        errorMessage: err.message,
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse({ error: err.message }, err.status);
    }
    if (err instanceof BudgetExhaustedError) {
      await logApiCall(admin, {
        userId,
        endpoint: ENDPOINT,
        cacheHit: false,
        status: "budget_exhausted",
        errorMessage: err.message,
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse({ error: err.message }, err.status);
    }
    console.error("limit check failed:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }

  // ── 3. OpenAI call ──
  if (stream) {
    return streamLookup({
      admin,
      userId,
      request,
      cacheKey,
      useCache,
      openaiKey,
      startedAt,
      meanings,
    });
  }

  try {
    const isEnrich = request.mode === "enrich";
    const userPrompt = isEnrich
      ? buildEnrichUserPrompt(request, meanings)
      : buildUserPrompt(request);

    const { result: rawResult, usage, costUsd, durationMs } =
      await callOpenAiForWordLookup({
        systemPrompt: getSystemPrompt(request.mode, request.sourceLang, request.targetLang),
        userPrompt,
        apiKey: openaiKey,
      });

    const result = normalizeResult(rawResult, request.targetLang);
    if (!result.headword) result.headword = request.word;

    let totalTokensIn = usage.prompt_tokens;
    let totalTokensOut = usage.completion_tokens;
    let totalCost = costUsd;

    if (isEnrich && result.examples?.length) {
      const defs = meanings?.map((m) => m.definition);
      result.examples = fixExampleMarkers(
        result.examples,
        request.word,
        request.sourceLang,
        request.targetLang,
        defs,
      );

      // AI post-processing: always fix markers and unnatural translations
      {
        try {
          const fixPrompts = buildMarkerFixPrompt(
            request.word,
            request.sourceLang,
            request.targetLang,
            meanings,
            result.examples.map((ex) => ({
              sentence: ex.sentence,
              translation: ex.translation,
              meaning_index: ex.meaningIndex,
            })),
          );
          const fixResp = await callOpenAiForWordLookup({
            systemPrompt: fixPrompts.system,
            userPrompt: fixPrompts.user,
            apiKey: openaiKey,
          });
          const fixedData = fixResp.result as unknown as {
            examples?: Array<{ sentence: string; translation: string; meaning_index?: number }>;
          };
          if (fixedData?.examples?.length) {
            result.examples = fixExampleMarkers(
              fixedData.examples.map((ex) => ({
                sentence: ex.sentence,
                translation: ex.translation,
                meaningIndex: ex.meaning_index,
              })),
              request.word,
              request.sourceLang,
              request.targetLang,
              defs,
            );
          }
          totalTokensIn += fixResp.usage.prompt_tokens;
          totalTokensOut += fixResp.usage.completion_tokens;
          totalCost += fixResp.costUsd;
        } catch {
          // Fix failed — keep original examples
        }
      }
    }

    if (useCache) {
      fireAndForget(saveToCache(admin, { cacheKey, req: request, result }));
    }

    fireAndForget(
      logApiCall(admin, {
        userId,
        endpoint: ENDPOINT,
        cacheHit: false,
        tokensInput: totalTokensIn,
        tokensOutput: totalTokensOut,
        costUsd: totalCost,
        durationMs: Date.now() - startedAt,
        status: "ok",
      }),
    );

    return jsonResponse({ result, cached: false, cacheKey });
  } catch (err) {
    const isOpenAi = err instanceof OpenAiError;
    const message = err instanceof Error ? err.message : "Unknown error";
    await logApiCall(admin, {
      userId,
      endpoint: ENDPOINT,
      cacheHit: false,
      status: "error",
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    });
    return jsonResponse(
      { error: message, code: isOpenAi ? "openai_error" : "internal" },
      isOpenAi ? 502 : 500,
    );
  }
});
