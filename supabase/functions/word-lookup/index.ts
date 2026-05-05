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
import { buildUserPrompt, buildEnrichUserPrompt, buildMarkerFixPrompt, buildMarkerBackfillPrompt, buildIpaOnlyPrompt, getSystemPrompt, LANG_NAMES } from "../_shared/prompts.ts";
import type { MeaningContext } from "../_shared/prompts.ts";
import { callOpenAiForWordLookup, OpenAiError, priceFor } from "../_shared/openai.ts";
import { normalizeResult, fixExampleMarkers } from "../_shared/normalize.ts";
import { AI_MODEL, DEFAULT_MODEL, buildCacheKey, getFromCache, saveToCache, selectModelForLookup } from "../_shared/cache.ts";
import { classifyInput, isMultiToken, normalizeForLookup, recordDynamicLexicon } from "../_shared/lexicon.ts";
import { applyContextualDisputeRewrites, applyDisputeRewrites, getFallbackMeanings, getForceOverrideMeanings, getLookupHint, getTranslateOverride, isInputBlacklisted, redirectDisputedInput, shouldForceEmptyExamples } from "../_shared/disputes.ts";
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

const ENDPOINT = "word-lookup";

const ALLOWED_ORIGINS = new Set([
  "https://typeword.app",
  "http://localhost:8081",
]);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

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

/**
 * Per-language max input length, counted in Unicode code points.
 *
 * Calibrated to admit most fixed expressions / idioms / proverbs while
 * still rejecting full conversational sentences (which the SCOPE_POLICY
 * also enforces). CJK characters are denser per-codepoint so the cap is
 * lower; compounding languages (de, ru) get a looser cap.
 *
 * Re-tune if cover-rate analysis (phrase_lexicon over_limit count) shows
 * meaningful gaps.
 */
const LANG_LENGTH_LIMITS: Record<string, number> = {
  ko: 25, ja: 25, zh: 25, "zh-CN": 25, "zh-TW": 25,
  de: 60, ru: 60,
  // Latin-script and everything else
  en: 50, es: 50, fr: 50, it: 50, pt: 50,
};
const DEFAULT_LENGTH_LIMIT = 50;

function getLangLimit(lang: string): number {
  return LANG_LENGTH_LIMITS[lang] ?? DEFAULT_LENGTH_LIMIT;
}

function codepointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Latin-script European languages where the lookup result should carry IPA. */
const IPA_LANGS = new Set(["en", "es", "fr", "de", "it", "pt"]);

/**
 * True when the request is a single-word lookup in a Latin-script European
 * language and the primary meaning isn't an "expression" (idiom/symbol/number).
 * Mirrors the prompt's "ipa is required" condition so the backfill triggers
 * exactly when the main call should have included IPA but didn't.
 */
function shouldHaveIpa(req: WordLookupRequest, result: WordLookupResult): boolean {
  if (!IPA_LANGS.has(req.sourceLang)) return false;
  const word = (result.headword ?? req.word).trim();
  if (!word || /\s/.test(word)) return false;
  const primaryPos = result.meanings?.[0]?.partOfSpeech?.toLowerCase() ?? "";
  if (primaryPos.includes("expression") || primaryPos === "표현") return false;
  if (result.note) return false;
  if (!result.meanings || result.meanings.length === 0) return false;
  return true;
}

function validateInput(body: unknown): WordLookupRequest {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Body must be a JSON object");
  }
  const b = body as Record<string, unknown>;

  let word = typeof b.word === "string" ? b.word.trim() : "";
  if (!word || /^\s*$/.test(word)) {
    throw new ValidationError("word must not be empty");
  }
  // Strip commas from pure numeric input (e.g. "1,000,000" → "1000000")
  const stripped = word.replace(/,/g, "");
  const isNumeric = /^\d+(\.\d+)?$/.test(stripped);
  const isExpression = !isNumeric && /^[\d\s+\-*/^!=<>().%]+$/.test(word);

  if (isNumeric) {
    word = stripped;
    if (word.length > 8) throw new ValidationError("NUMBER_TOO_LONG");
  } else if (isExpression) {
    if (word.length > 8) throw new ValidationError("EXPRESSION_TOO_LONG");
  }

  const SUPPORTED_LANGS = new Set(["en","ko","ja","zh","zh-CN","zh-TW","es","fr","de","it","pt","ru"]);

  const sourceLang = typeof b.sourceLang === "string" ? b.sourceLang : "";
  const targetLang = typeof b.targetLang === "string" ? b.targetLang : "";
  if (!sourceLang || !targetLang) {
    throw new ValidationError("sourceLang and targetLang required");
  }
  if (!SUPPORTED_LANGS.has(sourceLang) || !SUPPORTED_LANGS.has(targetLang)) {
    throw new ValidationError("Unsupported language");
  }

  // Length cap for ordinary text input. Skipped for numeric/expression inputs
  // (already capped at 8) so simple math doesn't trip the per-language limit.
  if (!isNumeric && !isExpression) {
    const limit = getLangLimit(sourceLang);
    if (codepointLength(word) > limit) {
      throw new ValidationError(`PHRASE_TOO_LONG:${limit}`);
    }
  }

  const mode: WordLookupMode = b.mode === "enrich" ? "enrich" : "quick";

  // Optional reading hint (curation use): constrains polysemous CJK chars to a
  // specific reading. e.g. for 长 with readingHint="cháng (long)", the result
  // covers only the "long/length" sense, not the "grow/elder" zhǎng sense.
  const readingHint = typeof b.readingHint === "string" && b.readingHint.trim().length > 0
    ? b.readingHint.trim().slice(0, 200)
    : undefined;

  return {
    word,
    sourceLang,
    targetLang,
    mode,
    readingHint,
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
  userId: string | null;
  request: WordLookupRequest;
  cacheKey: string;
  useCache: boolean;
  openaiKey: string;
  startedAt: number;
  meanings?: MeaningContext[];
  lexiconHint?: string;
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
    lexiconHint,
  } = args;

  const isEnrich = request.mode === "enrich";
  const userPrompt = isEnrich
    ? buildEnrichUserPrompt(request, meanings)
    : buildUserPrompt(request, lexiconHint);
  // Quick mode for short Latin words gets routed to gpt-4.1; everything else
  // (including enrich) stays on gpt-4.1-mini.
  const model = isEnrich ? DEFAULT_MODEL : selectModelForLookup(request);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      const fail = (message: string) => {
        enqueue("error", { error: message });
        controller.close();
      };

      try {
        // Cache already checked before entering stream — go straight to OpenAI.
        // reasoning_effort: minimal skips gpt-5's internal thinking pass,
        // which is unnecessary for factual word lookup and adds 5-30s of
        // latency. Only sent for gpt-5 family — gpt-4.1 ignores it.
        const streamBody: Record<string, unknown> = {
          model,
          messages: [
            { role: "system", content: getSystemPrompt(request.mode, request.sourceLang, request.targetLang) },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          stream: true,
          stream_options: { include_usage: true },
        };
        if (model.startsWith("gpt-5")) {
          streamBody.reasoning_effort = "low";
        }
        const openaiResp = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify(streamBody),
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
                // Apply dispute rewrites to the accumulated stream BEFORE
                // emitting it. The client renders deltas live (typewriter
                // effect), so without this the user briefly sees disputed
                // forms (일본해 / Sea of Japan / 泡菜 for kimchi etc.) before
                // the final result event swaps them. Contextual rewrites
                // (kimchi/paocai, hanbok) need the lookup word — pass
                // request.word so they fire from the first frame too.
                const rewritten = applyContextualDisputeRewrites(
                  applyDisputeRewrites(content, request.targetLang),
                  request.targetLang,
                  request.word,
                );
                enqueue("delta", { accumulated: rewritten });
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
          result = normalizeResult(JSON.parse(json), request.targetLang, request.sourceLang);
          if (!result.headword) result.headword = request.word;
          if (!result.originalInput) result.originalInput = request.word;
          // Force overrides for politically-disputed status entities
          // (Taiwan / Tibet / Hong Kong / Macau): the AI tends to lean
          // toward PRC framing ("Taiwan = 지역", "Tibet = 중국 자치구") —
          // override unconditionally with neutral geographic phrasing
          // before the fallback path fires.
          const fo = getForceOverrideMeanings(request.sourceLang, request.word, request.targetLang);
          if (fo) {
            result.meanings = fo.map((m) => ({ ...m, relevanceScore: 100 }));
            result.confidence = Math.max(result.confidence ?? 0, 90);
            result.note = undefined;
          }
          // Fallback for Korea-position dispute terms where the model
          // sometimes refuses (e.g. 한복 with target=zh-CN). Inject the
          // canonical definition rather than ship empty meanings to the
          // client, so legitimate Korean cultural lookups are never blank.
          if ((result.meanings?.length ?? 0) === 0 && !result.note) {
            const fb = getFallbackMeanings(request.sourceLang, request.word, request.targetLang);
            if (fb) {
              result.meanings = fb.map((m) => ({ ...m, relevanceScore: 100 }));
              result.confidence = Math.max(result.confidence ?? 0, 90);
            }
          }
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
          // Force-empty examples for slurs / strong profanity / self-harm
          // / eating disorders. Even academic-tone examples for these terms
          // can normalize the act or reproduce harm; the definition alone
          // is sufficient learning material.
          if (isEnrich && shouldForceEmptyExamples(request.sourceLang, request.word)) {
            result.examples = [];
          }
        } catch {
          fail("AI returned non-JSON content");
          return;
        }

        // IPA backfill: same condition as the non-streaming path. Plural-only
        // and inflected forms commonly slip through the verification step on
        // gpt-4.1-mini, so we recover the missing IPA with a small retry call
        // before returning the final result. Streaming clients see this as a
        // slight delay between the last delta and the result event for
        // affected words; the alternative (no IPA) was worse UX.
        if (request.mode === "quick" && shouldHaveIpa(request, result) && !result.ipa) {
          try {
            const ipaPrompts = buildIpaOnlyPrompt(result.headword ?? request.word, request.sourceLang);
            const ipaResp = await callOpenAiForWordLookup({
              systemPrompt: ipaPrompts.system,
              userPrompt: ipaPrompts.user,
              apiKey: openaiKey,
            });
            const rawIpa = (ipaResp.result as { ipa?: unknown }).ipa;
            if (typeof rawIpa === "string" && rawIpa.trim().length > 0) {
              result.ipa = rawIpa.trim();
            }
          } catch (err) {
            console.warn("ipa backfill (stream) failed:", err instanceof Error ? err.message : err);
          }
        }

        enqueue("result", { result, cached: false, cacheKey });

        const promptTokens = usage?.prompt_tokens ?? 0;
        const completionTokens = usage?.completion_tokens ?? 0;
        const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
        const uncachedInput = Math.max(0, promptTokens - cachedTokens);
        const p = priceFor(model);
        const costUsd =
          (uncachedInput * p.input +
            cachedTokens * p.cached +
            completionTokens * p.output) /
          1_000_000;

        // Persist cache + dynamic lexicon BEFORE close so the writes can't be
        // dropped by Supabase's post-response shutdown (observed during deploy
        // cold-start: lighter RPCs survived while heavier upserts died).
        // Guard: skip cache for malformed model output. The malformed signal
        // is mode-specific:
        //   - quick mode returns meanings; an empty meanings array with no
        //     rejection note is a partial output (model forgot the array).
        //   - enrich mode returns synonyms/antonyms/examples — meanings is
        //     NOT in the schema. Treating empty `meanings` as malformed for
        //     enrich silently skipped every enrich cache save (~5s OpenAI
        //     call every search-and-add, even for repeated lookups). For
        //     enrich, malformed = no useful enrichment fields at all.
        const isMalformed = !result.note && (
          isEnrich
            ? !(result.examples?.length || result.synonyms?.length || result.antonyms?.length)
            : (!result.meanings || result.meanings.length === 0)
        );
        if (useCache && !isMalformed) {
          try { await saveToCache(admin, { cacheKey, req: request, result, model }); }
          catch (err) { console.error("cache save failed:", err); }
        }
        const dyn = maybeRecordDynamic(admin, request, result);
        if (dyn) {
          try { await dyn; }
          catch (err) { console.error("dynamic_lexicon save failed:", err); }
        }

        controller.close();

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

/**
 * Decide whether to record the AI result into dynamic_lexicon. Returns the
 * pending RPC promise (await'd by the caller) or null when the gate rejects
 * the call. Skips typo corrections so we don't pollute the lexicon with
 * non-canonical forms.
 */
function maybeRecordDynamic(
  admin: SupabaseClient,
  request: WordLookupRequest,
  result: WordLookupResult,
): Promise<void> | null {
  if (request.mode !== "quick") return null;
  if (result.note) return null;
  const conf = result.confidence ?? 0;
  if (conf < 70) return null;
  if (!result.meanings || result.meanings.length === 0) return null;
  const headword = result.headword ?? request.word;
  if (normalizeForLookup(headword) !== normalizeForLookup(request.word)) return null;
  return recordDynamicLexicon(admin, {
    language: request.sourceLang,
    input: request.word,
    isPhrase: isMultiToken(request.word),
    aiConfidence: conf,
  });
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

  // Auth: verify JWT from client. Service-role calls (curation/admin scripts)
  // bypass user verification and downstream rate limits — they're operator
  // workflows, not user traffic.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }
  const isServiceRole = decodeJwtPayload(jwt)?.role === "service_role";
  // userId is null for service_role/curation calls. The api_calls table
  // accepts null user_id (FK is ON DELETE SET NULL → nullable column);
  // rate-limit code paths are skipped for admin so userId is unused there.
  let userId: string | null;
  if (isServiceRole) {
    userId = null;
  } else {
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }
    userId = userData.user.id;
  }

  let request: WordLookupRequest;
  let stream = false;
  let isTranslate = false;
  let meanings: MeaningContext[] | undefined;
  let forceFresh = false;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    request = validateInput(body);
    stream = wantsStream(req, body);
    isTranslate = body.translate === true;
    // Service-role-only knob: skip the cache lookup so the full pipeline
    // (including newly added post-processing) re-runs and replaces the
    // stale cached entry. Curation scripts use this after prompt changes.
    forceFresh = isServiceRole && body.forceFresh === true;
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

  // ── Input redirect (Korean-position canonical form) ──
  // Silently swap disputed inputs (takeshima → Dokdo, 일본해 → 동해, etc.)
  // BEFORE cache / lexicon / AI work. Result: cache shares one entry per
  // canonical term, and the headword renders as the Korean-position form
  // from the first stream frame instead of momentarily showing the typed
  // variant. Native-script inputs (竹島, 日本海) are NOT redirected — they
  // remain valid vocabulary lookups whose target-language output gets
  // neutralized via applyDisputeRewrites.
  //
  // The "input language" depends on mode: for normal lookups the user's
  // input is in sourceLang; in translate mode (reverse lookup phase 1)
  // the user typed in targetLang. Without this distinction, typing 장백산
  // in a zh→ko wordlist would skip the ko-rule "장백산 → 백두산" because
  // the rules are keyed on the input language.
  const inputLang = isTranslate ? request.targetLang : request.sourceLang;
  const redirected = redirectDisputedInput(inputLang, request.word);
  if (redirected !== request.word) {
    request = { ...request, word: redirected };
  }

  // ── Input blacklist (refuse before any AI / cache work) ──
  // Iconic figures of mass atrocity / contemporary authoritarian leaders.
  // Returns the same shape the AI uses for non_word rejection so the client
  // renders the standard "no result" UI without further branching.
  if (isInputBlacklisted(request.sourceLang, request.word)) {
    fireAndForget(
      logApiCall(admin, {
        userId,
        endpoint: ENDPOINT,
        cacheHit: false,
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        status: "ok",
      }),
    );
    const refused: WordLookupResult = {
      headword: request.word,
      meanings: [],
      note: "non_word",
      confidence: 0,
    };
    if (stream) return sseResponse({ result: refused });
    return jsonResponse({ result: refused });
  }

  // ── Translate mode: simple word translation for reverse lookup step 1 ──
  if (isTranslate) {
    // Korea-position override: hard-redirect Korean cultural terms to the
    // canonical candidate (김치→辛奇, 한복→韩服, 독도→Dokdo/独島, etc.) so
    // the next quick-lookup phase doesn't get steered toward the wrong
    // referent (e.g. 泡菜 instead of 辛奇 for kimchi). targetLang here is
    // the user's input language, sourceLang is the wordlist's source —
    // the candidate we want is in sourceLang.
    const tOverride = getTranslateOverride(request.targetLang, request.word, request.sourceLang);
    if (tOverride) {
      fireAndForget(
        logApiCall(admin, {
          userId,
          endpoint: ENDPOINT,
          cacheHit: false,
          costUsd: 0,
          durationMs: Date.now() - startedAt,
          status: "ok",
        }),
      );
      return jsonResponse({ result: { candidates: tOverride } });
    }
    // Cache check FIRST (zero cost, skip rate limit + OpenAI on hit).
    // The 'translate' tag in the key keeps reverse-translate results from
    // colliding with forward 'quick' results for the same word/pair.
    const tCacheKey = `${request.word.trim().toLowerCase()}|${request.sourceLang}-${request.targetLang}|translate|${DEFAULT_MODEL}`;
    const cachedTranslate = await getFromCache(admin, tCacheKey);
    if (cachedTranslate) {
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
      return jsonResponse({ result: cachedTranslate });
    }

    try {
      if (!isServiceRole) await enforceAllLimits(admin, userId);
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
          systemPrompt: `Translate a word from ${fromName} to ${toName} for a vocabulary-learning app.
Return JSON: {"candidates": [{"headword": "word_in_${toName}", "hint": "short_disambiguation_in_${fromName}"}], "note": "sentence" | "non_word" | "wrong_language" | null}

TOP-PRIORITY RULES (never violate):
1. ANTI-FABRICATION — empty candidates with a "note" is ALWAYS better than a guessed candidate. Never invent a translation just because the input loosely resembles a real expression.
2. SCOPE — a clause-shaped input you cannot identify as a SPECIFIC known fixed expression is "sentence", not a translation. Do not invent a meaning by literally interpreting the input's words.
3. COMPOSITIONAL UNIT — a candidate is valid ONLY IF it is a real attested word/expression in ${toName} that means the input as a whole. Standalone meanings of the input's constituent characters/morphemes/sub-strings are never valid candidates.
4. LANGUAGE PURITY — each "headword" is entirely in ${toName}; each "hint" is entirely in ${fromName}. No mixing within a single field.

Scope policy (apply BEFORE translating):
- This is a vocabulary app: only single words, conventional fixed expressions (idioms, proverbs, set phrases, greetings), and proper nouns (people, places, organizations, brands, works) are in scope.
- Multi-word proper nouns ARE in scope: foreign personal names transliterated into the input language (e.g. "도널드 트럼프" → "Donald Trump", "조 바이든" → "Joe Biden", "일론 머스크" → "Elon Musk"), city/country names, organization names, etc. Treat them as a single lexical unit and translate to the canonical native-script form. Never reject a recognizable transliteration of a real-world proper noun as "non_word".
- If the input is a full sentence, question, or creatively-composed multi-clause text — NOT a fixed expression or proper noun — return {"candidates": [], "note": "sentence"}.
- If the input is gibberish, random characters, or otherwise not a real lexical item — return {"candidates": [], "note": "non_word"}.
- If the input is not in ${fromName} (the expected source-of-translation language) — return {"candidates": [], "note": "wrong_language"}.
- A grammatically-complete clause that is a recognized fixed expression (proverb / idiom / greeting / set phrase) IS in scope — translate it normally. Conventionality is the test, not grammar or length. If unsure whether something is a fixed expression vs a creative sentence, lean toward "sentence".
- Misspelled / lightly-mangled fixed expressions: ONLY treat the input as a known proverb/idiom if you are confident a native speaker would recognize the input as that specific expression with high probability. A SINGLE clearly-wrong content word (a noun/verb/adjective that does not appear in any attested version of the expression) is enough to reject — return note "sentence". Do NOT invent a plausible-sounding translation just because the input vaguely resembles a proverb structure.

Selection rules (when in scope):
- Return the form a native speaker uses in daily conversation. Prefer everyday/colloquial register over formal/literary/written-only equivalents.
- Kinship and daily-life vocabulary rule (CRITICAL): for words referring to family members, body parts, food, weather, common actions, and other high-frequency daily-life concepts, the colloquial spoken form is ALWAYS the right answer — never the formal/written/Sino-Hanja equivalent. This often differs from a literal etymology-faithful translation. Choose the form children and ordinary people use in casual speech, not the dictionary headword that maps morpheme-by-morpheme. If the input is itself a daily-life term, the output must be a daily-life term in the target language at the same register.
- Do NOT include register variants (a formal/literary equivalent of the same meaning). The learner's flow only needs the everyday form; if they want the formal version they will look it up separately.
- When the input has multiple DISTINCT meanings (homonyms/polysemy), include each meaning as its own candidate. Each candidate's hint names the specific sense.
- If only one daily-form is appropriate, return a single candidate. Maximum 4 candidates total.

Gendered noun handling (CRITICAL when ${toName} is one of {de, fr, es, it, pt, ru} AND the concept refers to a person — student, friend, doctor, teacher, neighbor, colleague, child, etc.):

CORE PRINCIPLE: in gendered languages, learners need to know which form to use for which referent. When the input is gender-neutral, the answer is the LEARNER'S CHOICE, not the AI's. Surface every relevant gendered form so the candidate picker can present the choice.

Form classification in ${toName}:
  (a) DISTINCT m/f forms — the concept has separate masculine and feminine surface words (étudiant/étudiante, ami/amie, profesor/profesora, Lehrer/Lehrerin, …).
  (b) EPICENE / common-gender — one surface form used for both genders (French élève, médecin, enfant, collègue, journaliste; Italian collega, insegnante; Russian коллега, врач; Spanish modelo, testigo). Same word, agreement falls on the article.

Candidate emission rules:
- INPUT EXPLICITLY MARKS GENDER (Korean 남-/여- prefix or 남자/여자 modifier, Japanese 男/女 prefix, Chinese 男/女 prefix, English "male"/"female"/"woman"/"man"):
    • Emit ONLY candidate(s) of the matching gender. NEVER include the opposite-gender form.
    • Compound resolution (NON-NEGOTIABLE): when the input is a gender-marked compound (e.g. 여학생, 남학생, 여자친구), identify the BASE concept (학생, 친구, ...). The candidate is the matching-gender member of the base concept's canonical m/f pair (학생 → étudiant/étudiante → for 여학생 emit étudiante; 친구 → ami/amie → for 남자친구 emit ami). The gender marking on the compound is a request for a MORPHOLOGICALLY-GENDERED surface word, so a gendered pair takes priority over an epicene synonym, even when the epicene word would feel more natural in some specific register or setting (school vs university, etc.). Only fall back to the epicene form when the base concept has NO m/f pair in modern usage.
    • For epicene-only emission (no morphologically-gendered alternative exists for the base), omit the gender label — there is nothing to contrast against.
- INPUT IS GENDER-NEUTRAL (just "student", "friend", "doctor", etc.):
    • If type (a) gendered forms exist for this concept, ALWAYS emit BOTH masculine and feminine candidates (masculine first, feminine second).
    • If type (b) epicene forms also exist for the same concept, emit them as ADDITIONAL candidates after the gendered pair. The order is: masculine, feminine, then epicene(s).
    • If ONLY an epicene form exists (no distinct m/f variant in common use, e.g. médecin in modern French where doctoresse is rare/dated, collègue, enfant), emit a single epicene candidate.
    • Never replace gendered alternatives with the epicene single just because the epicene word is "more common" — the learner is studying gendered grammar, the gendered forms must be on offer.

DEDUPLICATION (NON-NEGOTIABLE): if two candidates would have IDENTICAL headword strings, collapse to a single candidate. Do not return the same word twice with different hints (this most often happens for epicene words mistakenly labeled with both genders).

Cap at 4 candidates total. Polysemy and gender variants share that budget.

Hint formatting rules:
- The hint identifies WHICH candidate this is, written in ${fromName}, max 12 chars total.
- For SINGLE candidate: keep the hint empty or a very short clarifier; do NOT add register/style tags.
- For POLYSEMY VARIANTS: hint = the specific sense in ${fromName}, no register tag.
- For GENDER VARIANTS (m/f forms of the same concept): hint = the gender label in ${fromName} (e.g. for Korean: "남성형" / "여성형"; for Japanese: "男性形" / "女性形"; for Chinese: "阳性"/"阴性"; for English: "(m.)" / "(f.)"). Do NOT repeat the meaning in the hint when both candidates share meaning.
- The hint MUST disambiguate when multiple candidates are returned.

Output rules:
- Each "headword" MUST be entirely in ${toName} (every character of every word).
- Each "hint" MUST be entirely in ${fromName} (every character of every word), max 12 chars.
- When emitting a "note", "candidates" MUST be []. When candidates are non-empty, "note" MUST be null.
- No other keys, no definitions beyond the hint.

Final verification (perform silently before emitting JSON):
1. Is each "headword" written ENTIRELY in ${toName}? If any character is in another language, fix it.
2. Is each "hint" written ENTIRELY in ${fromName}?
3. Is each candidate a real attested ${toName} word/expression that means the input as a whole (not just a meaning of one of its constituent parts)?
4. If the input is a clause-shaped phrase you cannot identify as a SPECIFIC known fixed expression in ${fromName}, did you set "note": "sentence" and "candidates": []?`,
          userPrompt: `"${request.word}"`,
          apiKey: openaiKey,
        });
      const raw = result as Record<string, unknown>;
      const noteRaw = typeof raw.note === "string" ? raw.note : null;
      const note = (noteRaw === "sentence" || noteRaw === "non_word" || noteRaw === "wrong_language") ? noteRaw : undefined;
      let candidates: Array<{ headword: string; hint: string }> = [];
      if (Array.isArray(raw.candidates)) {
        candidates = (raw.candidates as Array<Record<string, unknown>>)
          .filter((c) => typeof c.headword === "string" && (c.headword as string).trim().length > 0)
          .map((c) => ({ headword: String(c.headword), hint: String(c.hint ?? "") }));
        // Deduplicate by normalized headword. The AI sometimes returns
        // identical headwords with different gender hints for epicene nouns
        // (médecin, élève, collègue) despite the prompt's explicit dedup
        // rule. Keep the FIRST occurrence and drop subsequent duplicates;
        // strip the gender hint from the survivor since it's no longer
        // disambiguating anything.
        const seen = new Map<string, { headword: string; hint: string }>();
        for (const c of candidates) {
          const key = c.headword.normalize("NFC").trim().toLowerCase();
          if (!seen.has(key)) {
            seen.set(key, c);
          }
        }
        candidates = Array.from(seen.values()).map((c) => {
          // If only one candidate now, drop the gender hint (it's redundant —
          // there's nothing to disambiguate against).
          if (seen.size === 1) return { ...c, hint: "" };
          return c;
        });
      }
      if (note) candidates = [];
      if (candidates.length === 0 && !note) {
        const hw = raw.headword ?? Object.values(raw).find((v) => typeof v === "string");
        if (hw && String(hw).trim().length > 0) {
          candidates = [{ headword: String(hw), hint: "" }];
        }
      }
      const tResult: { candidates: typeof candidates; note?: string } = note
        ? { candidates: [], note }
        : { candidates };
      // Cache the translate result for future hits.
      fireAndForget(
        saveToCache(admin, {
          cacheKey: tCacheKey,
          req: request,
          result: tResult as unknown as WordLookupResult,
          model: DEFAULT_MODEL,
        }),
      );
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
      return jsonResponse({ result: tResult });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Translation failed";
      return jsonResponse({ error: message }, 500);
    }
  }
  // Quick mode for short Latin words is routed to gpt-4.1; everything else
  // uses gpt-4.1-mini. The cache key includes the model so different-model
  // results never collide.
  const isEnrichMode = request.mode === "enrich";
  const lookupModel = isEnrichMode ? DEFAULT_MODEL : selectModelForLookup(request);
  const cacheKey = buildCacheKey(request, lookupModel);
  const useCache = true;

  // ── 1. Cache check FIRST (before rate limits — zero cost, skip everything) ──
  // forceFresh (service-role only) bypasses the lookup so curation scripts
  // can re-process entries through any newly added post-processing.
  if (useCache && !forceFresh) {
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
    if (!isServiceRole) await enforceAllLimits(admin, userId);
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

  // ── 3. Lexicon classification (quick mode only, fire before OpenAI) ──
  // Skip for enrich (which has its own context) and translate (already returned above).
  let lexiconHint: string | undefined;
  if (!isEnrichMode) {
    try {
      const cls = await classifyInput(admin, request.sourceLang, request.word);
      lexiconHint = cls.hint || undefined;
    } catch (err) {
      console.error("lexicon classify failed (non-fatal):", err);
    }
  }
  // Korea-position dispute hints (e.g. 辛奇 → "this is Korean kimchi") get
  // appended to whatever the lexicon produced. Concatenated newline-style
  // since the user prompt builder treats hints as free-form prelude text.
  const disputeHint = getLookupHint(request.sourceLang, request.word);
  if (disputeHint) {
    lexiconHint = lexiconHint ? `${lexiconHint}\n${disputeHint}` : disputeHint;
  }

  // ── 4. OpenAI call ──
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
      lexiconHint,
    });
  }

  try {
    const isEnrich = request.mode === "enrich";
    const userPrompt = isEnrich
      ? buildEnrichUserPrompt(request, meanings)
      : buildUserPrompt(request, lexiconHint);

    const { result: rawResult, usage, costUsd, durationMs } =
      await callOpenAiForWordLookup({
        systemPrompt: getSystemPrompt(request.mode, request.sourceLang, request.targetLang),
        userPrompt,
        apiKey: openaiKey,
        model: lookupModel,
      });

    const result = normalizeResult(rawResult, request.targetLang, request.sourceLang);
    if (!result.headword) result.headword = request.word;
    if (!result.originalInput) result.originalInput = request.word;
    // Force overrides for politically-disputed entities — see streaming path.
    const foNonStream = getForceOverrideMeanings(request.sourceLang, request.word, request.targetLang);
    if (foNonStream) {
      result.meanings = foNonStream.map((m) => ({ ...m, relevanceScore: 100 }));
      result.confidence = Math.max(result.confidence ?? 0, 90);
      result.note = undefined;
    }
    // Fallback for Korea-position dispute terms — see streaming path comment.
    if ((result.meanings?.length ?? 0) === 0 && !result.note) {
      const fb = getFallbackMeanings(request.sourceLang, request.word, request.targetLang);
      if (fb) {
        result.meanings = fb.map((m) => ({ ...m, relevanceScore: 100 }));
        result.confidence = Math.max(result.confidence ?? 0, 90);
      }
    }

    let totalTokensIn = usage.prompt_tokens;
    let totalTokensOut = usage.completion_tokens;
    let totalCost = costUsd;

    // IPA backfill: gpt-4.1-mini sometimes drops the ipa field for plural-only
    // / plurale-tantum nouns and inflected forms even with the prompt's
    // verification step. A focused single-purpose retry recovers the missing
    // value cheaply (~30 tokens). Skipped when the main call already has it.
    if (request.mode === "quick" && shouldHaveIpa(request, result) && !result.ipa) {
      try {
        const ipaPrompts = buildIpaOnlyPrompt(result.headword ?? request.word, request.sourceLang);
        const ipaResp = await callOpenAiForWordLookup({
          systemPrompt: ipaPrompts.system,
          userPrompt: ipaPrompts.user,
          apiKey: openaiKey,
        });
        const rawIpa = (ipaResp.result as { ipa?: unknown }).ipa;
        if (typeof rawIpa === "string" && rawIpa.trim().length > 0) {
          result.ipa = rawIpa.trim();
        }
        totalTokensIn += ipaResp.usage.prompt_tokens;
        totalTokensOut += ipaResp.usage.completion_tokens;
        totalCost += ipaResp.costUsd;
      } catch (err) {
        console.warn("ipa backfill failed:", err instanceof Error ? err.message : err);
      }
    }

    // Force-empty examples for slurs / strong profanity / self-harm —
    // see streaming path for rationale.
    if (isEnrich && shouldForceEmptyExamples(request.sourceLang, request.word)) {
      result.examples = [];
    }

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

      // Final pass — translation marker backfill. The main fix prompt
      // permits omitting markers when no clean equivalent exists, which
      // gpt-4.1-mini sometimes interprets too liberally (especially on
      // inflected target languages like Korean/French where the headword
      // appears with attached particles or in a conjugated form). For any
      // example whose translation STILL has no ** markers, run a tight
      // single-purpose call that only inserts markers — no rewriting, no
      // omission allowance for concrete A1/A2 vocabulary. Cheap (~50ms,
      // ~200 tokens) and covers the residual gap.
      const needBackfill = result.examples.filter((ex) => ex.translation && !ex.translation.includes("**"));
      if (needBackfill.length > 0 && meanings && meanings.length > 0) {
        try {
          const backfillPrompts = buildMarkerBackfillPrompt(
            request.word,
            request.sourceLang,
            request.targetLang,
            meanings,
            needBackfill.map((ex) => ({
              sentence: ex.sentence,
              translation: ex.translation,
              meaning_index: ex.meaningIndex,
            })),
          );
          const backResp = await callOpenAiForWordLookup({
            systemPrompt: backfillPrompts.system,
            userPrompt: backfillPrompts.user,
            apiKey: openaiKey,
          });
          const backData = backResp.result as unknown as {
            translations?: Array<{ translation?: string }>;
          };
          const fixed = backData?.translations ?? [];
          if (fixed.length === needBackfill.length) {
            // Map back into result.examples by reference equality.
            let bi = 0;
            result.examples = result.examples.map((ex) => {
              if (ex.translation && !ex.translation.includes("**")) {
                const t = fixed[bi++]?.translation;
                if (typeof t === "string" && t.length > 0) {
                  return { ...ex, translation: t };
                }
              }
              return ex;
            });
          }
          totalTokensIn += backResp.usage.prompt_tokens;
          totalTokensOut += backResp.usage.completion_tokens;
          totalCost += backResp.costUsd;
        } catch (err) {
          console.warn("marker backfill failed:", err instanceof Error ? err.message : err);
        }
      }
    }

    // Persist cache + dynamic lexicon BEFORE returning so the writes can't be
    // dropped by Supabase's post-response shutdown (observed during deploy
    // cold-start: lighter RPCs survived while heavier upserts died).
    // Mode-specific malformed check — see streaming path comment.
    const isMalformed = !result.note && (
      isEnrichMode
        ? !(result.examples?.length || result.synonyms?.length || result.antonyms?.length)
        : (!result.meanings || result.meanings.length === 0)
    );
    if (useCache && !isMalformed) {
      try { await saveToCache(admin, { cacheKey, req: request, result, model: lookupModel }); }
      catch (err) { console.error("cache save failed:", err); }
    }
    const dyn = maybeRecordDynamic(admin, request, result);
    if (dyn) {
      try { await dyn; }
      catch (err) { console.error("dynamic_lexicon save failed:", err); }
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
