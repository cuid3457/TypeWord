// Edge Function: word-lookup-v2
// -----------------------------------------------------------
// Split-cache, mode-aware word lookup.
//
// MODE = QUICK (default — lookup screen / search):
//   • Cache miss path: single COMBINED_QUICK LLM call produces canonical
//     analysis (in word_lang) AND target-translated meanings in one shot.
//     Result is split-stored: canonical → word_entries, translated →
//     word_translations.
//   • Cache hit on canonical, miss on translation: TRANSLATE_MEANING only
//     (cheap, fast).
//   • Both cached: zero LLM calls.
//   • Returns: meanings + IPA + reading + headword (NO examples/syn/ant).
//
// MODE = ENRICH (when user adds to wordlist — async, off the hot path):
//   • Cache miss path: ANALYZE_ENRICH (examples + syn/ant in word_lang)
//     + TRANSLATE_SENTENCE (translations).
//   • Cache hit on examples but miss on translation: TRANSLATE_SENTENCE only.
//   • Returns: full result including examples/syn/ant.
//
// Cache tables:
//   word_entries[word, word_lang]            — canonical (meanings always;
//                                              examples/syn/ant once enriched)
//   word_translations[entry_id, target_lang] — meanings_translated +
//                                              examples_translated
// -----------------------------------------------------------

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import {
  buildCombinedQuickSystemPrompt,
  buildCombinedQuickUserPrompt,
  buildIpaOnlySystemPrompt,
  buildIpaOnlyUserPrompt,
  buildPerMeaningExampleSystemPrompt,
  buildPerMeaningExampleUserPrompt,
  buildAllExamplesSystemPrompt,
  buildAllExamplesUserPrompt,
  buildReverseLookupSystemPrompt,
  buildReverseLookupUserPrompt,
  buildTranslateMeaningSystemPrompt,
  buildTranslateMeaningUserPrompt,
  buildTranslateSentenceSystemPrompt,
  buildTranslateSentenceUserPrompt,
  LANG_NAMES,
} from "../_shared/prompts-v3.ts";
import {
  classifyKoInput,
  buildKoSpecializedSystemPrompt,
  buildKoSpecializedUserPrompt,
  buildKoExamplesSystemPrompt,
  getKoMeaningCap,
  type KoCase,
} from "../_shared/prompts-v3-ko.ts";
import {
  classifyEnInput,
  buildEnSpecializedSystemPrompt,
  buildEnSpecializedUserPrompt,
  buildEnExamplesSystemPrompt,
  getEnMeaningCap,
  type EnCase,
} from "../_shared/prompts-v3-en.ts";
import {
  classifyJaInput,
  buildJaSpecializedSystemPrompt,
  buildJaSpecializedUserPrompt,
  buildJaExamplesSystemPrompt,
  getJaMeaningCap,
  type JaCase,
} from "../_shared/prompts-v3-ja.ts";
import {
  classifyZhInput,
  buildZhSpecializedSystemPrompt,
  buildZhSpecializedUserPrompt,
  buildZhExamplesSystemPrompt,
  getZhMeaningCap,
  type ZhCase,
} from "../_shared/prompts-v3-zh.ts";
import {
  classifyLatinInput,
  isLatinSource,
  buildLatinSpecializedSystemPrompt,
  buildLatinSpecializedUserPrompt,
  buildLatinExamplesSystemPrompt,
  getLatinMeaningCap,
  type LatinCase,
  type LatinSourceLang,
} from "../_shared/prompts-v3-latin.ts";

// Route to source-specialized prompt when available (ko, en, ja, zh-CN, es/fr/de/it).
function buildSystemPromptRouted(req: WordLookupRequest): string {
  if (req.sourceLang === "ko") {
    const koCase = classifyKoInput(req.word);
    return buildKoSpecializedSystemPrompt(koCase, req.targetLang);
  }
  if (req.sourceLang === "en") {
    const enCase = classifyEnInput(req.word);
    return buildEnSpecializedSystemPrompt(enCase, req.targetLang);
  }
  if (req.sourceLang === "ja") {
    const jaCase = classifyJaInput(req.word);
    return buildJaSpecializedSystemPrompt(jaCase, req.targetLang);
  }
  if (req.sourceLang === "zh-CN" || req.sourceLang === "zh") {
    const zhCase = classifyZhInput(req.word);
    return buildZhSpecializedSystemPrompt(zhCase, req.targetLang);
  }
  if (isLatinSource(req.sourceLang)) {
    const latinCase = classifyLatinInput(req.word, req.sourceLang as LatinSourceLang);
    return buildLatinSpecializedSystemPrompt(latinCase, req.sourceLang as LatinSourceLang, req.targetLang);
  }
  return buildCombinedQuickSystemPrompt(req.sourceLang, req.targetLang);
}
function buildUserPromptRouted(req: WordLookupRequest, lexiconHint?: string): string {
  if (req.sourceLang === "ko") {
    const koCase = classifyKoInput(req.word);
    return buildKoSpecializedUserPrompt(req, koCase, lexiconHint);
  }
  if (req.sourceLang === "en") {
    const enCase = classifyEnInput(req.word);
    return buildEnSpecializedUserPrompt(req, enCase, lexiconHint);
  }
  if (req.sourceLang === "ja") {
    const jaCase = classifyJaInput(req.word);
    return buildJaSpecializedUserPrompt(req, jaCase, lexiconHint);
  }
  if (req.sourceLang === "zh-CN" || req.sourceLang === "zh") {
    const zhCase = classifyZhInput(req.word);
    return buildZhSpecializedUserPrompt(req, zhCase, lexiconHint);
  }
  if (isLatinSource(req.sourceLang)) {
    const latinCase = classifyLatinInput(req.word, req.sourceLang as LatinSourceLang);
    return buildLatinSpecializedUserPrompt(req, latinCase, lexiconHint);
  }
  return buildCombinedQuickUserPrompt(req, lexiconHint);
}
import {
  getReverseLookup,
  getWordEntry,
  getWordTranslation,
  PROMPT_VERSION_V2,
  patchWordEntryEnrichment,
  patchWordEntryIpa,
  saveReverseLookup,
  saveWordEntry,
  saveWordTranslation,
  type CanonicalExample,
  type CanonicalMeaning,
  type TranslatedExample,
  type TranslatedMeaning,
  type WordEntry,
  type WordTranslation,
} from "../_shared/cache-v2.ts";
import { stitchAndNormalize, stitchResult } from "../_shared/stitch.ts";
import { callOpenAiForWordLookup, OpenAiError, priceFor } from "../_shared/openai.ts";
import { classifyInput, normalizeForLookup, recordDynamicLexicon, isMultiToken } from "../_shared/lexicon.ts";
import {
  applyContextualDisputeRewrites,
  applyDisputeRewrites,
  getFallbackMeanings,
  getForceOverrideMeanings,
  getLookupHint,
  getSensitiveLookupHint,
  isInputBlacklisted,
  isSensitiveLookup,
  getTranslateOverride,
  redirectDisputedInput,
  shouldForceEmptyExamples,
} from "../_shared/disputes.ts";
import { getDualNumeralOverride } from "../_shared/numerals.ts";
import {
  BudgetExhaustedError,
  enforceAllLimits,
  RateLimitError,
} from "../_shared/limits.ts";
import { logApiCall } from "../_shared/logging.ts";
import { DEFAULT_MODEL, selectModelForLookup } from "../_shared/cache.ts";
import type { WordLookupRequest, WordLookupResult } from "../_shared/types.ts";

const ENDPOINT = "word-lookup-v2";
const TRANSLATION_MODEL = DEFAULT_MODEL; // gpt-4.1-mini — user-confirmed (memory: gpt-5-mini not worth it)

const ALLOWED_ORIGINS = new Set([
  "https://moavoca.com",
  "https://www.moavoca.com",
  "https://typeword.app",
  "http://localhost:8081",
  "http://localhost:4173",
]);

const SUPPORTED_LANGS = new Set([
  "en", "ko", "ja", "zh-CN",
  "es", "fr", "de", "it",
]);

const LANG_LENGTH_LIMITS: Record<string, number> = {
  ko: 25, ja: 25, "zh-CN": 25,
  de: 60,
  en: 50, es: 50, fr: 50, it: 50,
};
const DEFAULT_LENGTH_LIMIT = 50;
const IPA_LANGS = new Set(["en", "es", "fr", "de", "it"]);

// ============================================================
// Dispute rewrite helper — applies applyDisputeRewrites +
// applyContextualDisputeRewrites to the final WordLookupResult's
// user-visible text (definitions + example translations). Mirrors
// the streaming SSE rewrite so non-streaming + cache-hit paths get
// the same Korea-position canonical forms (일본해→동해, 김치→辛奇).
// ============================================================

function applyDisputeRewritesToResult(
  result: WordLookupResult,
  sourceLang: string,
  lookupWord: string,
  targetLang: string,
): WordLookupResult {
  if (!result || result.note) return result;
  const rewrite = (text: string) => {
    if (!text) return text;
    return applyContextualDisputeRewrites(
      applyDisputeRewrites(text, targetLang),
      targetLang,
      lookupWord,
    );
  };
  const meanings = result.meanings?.map((m) => ({
    ...m,
    definition: rewrite(m.definition),
  }));
  const examples = result.examples?.map((e) => ({
    ...e,
    translation: rewrite(e.translation),
  }));
  return { ...result, meanings, examples };
}

// ============================================================
// Utilities
// ============================================================

class ValidationError extends Error {
  status = 400;
}

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ..._corsHeaders },
  });
}

// ── SSE helpers ──
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    ..._corsHeaders,
  };
}

/**
 * Single-event SSE response for cache hits / rejection paths.
 * The client expects either a `delta` stream followed by a `result`
 * event OR just a `result` event by itself.
 */
function sseResponse(eventBody: unknown, event = "result"): Response {
  return new Response(sseEvent(event, eventBody), { headers: sseHeaders() });
}

function wantsStream(req: Request, body: Record<string, unknown>): boolean {
  if (body.stream === true) return true;
  const accept = req.headers.get("Accept") ?? "";
  return accept.includes("text/event-stream");
}

function codepointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function getLangLimit(lang: string): number {
  return LANG_LENGTH_LIMITS[lang] ?? DEFAULT_LENGTH_LIMIT;
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function fireAndForget(p: Promise<unknown>): void {
  const safe = p.catch((err) => console.error("background task failed:", err));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(safe);
  }
}

// ============================================================
// Input validation
// ============================================================

function validateInput(body: unknown): WordLookupRequest {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Body must be a JSON object");
  }
  const b = body as Record<string, unknown>;

  let word = typeof b.word === "string" ? b.word.trim() : "";
  if (!word) throw new ValidationError("word must not be empty");

  const stripped = word.replace(/,/g, "");
  const isNumeric = /^\d+(\.\d+)?$/.test(stripped);
  const isExpression = !isNumeric && /^[\d\s+\-*/^!=<>().%]+$/.test(word);
  if (isNumeric) {
    word = stripped;
    if (word.length > 8) throw new ValidationError("NUMBER_TOO_LONG");
  } else if (isExpression) {
    if (word.length > 8) throw new ValidationError("EXPRESSION_TOO_LONG");
  }

  const sourceLang = typeof b.sourceLang === "string" ? b.sourceLang : "";
  const targetLang = typeof b.targetLang === "string" ? b.targetLang : "";
  if (!sourceLang || !targetLang) {
    throw new ValidationError("sourceLang and targetLang required");
  }
  if (!SUPPORTED_LANGS.has(sourceLang) || !SUPPORTED_LANGS.has(targetLang)) {
    throw new ValidationError("Unsupported language");
  }

  if (!isNumeric && !isExpression) {
    const limit = getLangLimit(sourceLang);
    if (codepointLength(word) > limit) {
      throw new ValidationError(`PHRASE_TOO_LONG:${limit}`);
    }
  }

  const readingHint = typeof b.readingHint === "string" && b.readingHint.trim().length > 0
    ? b.readingHint.trim().slice(0, 200)
    : undefined;
  const proficiencyHint = typeof b.proficiencyHint === "string" && b.proficiencyHint.trim().length > 0
    ? b.proficiencyHint.trim().slice(0, 300)
    : undefined;
  const mode: "quick" | "enrich" = b.mode === "enrich" ? "enrich" : "quick";

  return {
    word,
    sourceLang,
    targetLang,
    mode,
    readingHint,
    proficiencyHint,
  };
}

// ============================================================
// WORD_ANALYZE
// ============================================================

interface AnalyzeRaw {
  headword?: string;
  ipa?: string;
  reading?: string | string[];
  originalInput?: string;
  confidence?: number;
  note?: string;
  meanings?: Array<Record<string, unknown>>;
  synonyms?: unknown;
  antonyms?: unknown;
  examples?: Array<Record<string, unknown>>;
}

function normalizeAnalyzeOutput(
  raw: AnalyzeRaw,
  req: WordLookupRequest,
): {
  headword: string;
  ipa: string | null;
  reading: string[] | null;
  confidence: number;
  note: string | null;
  originalInput: string;
  meanings: CanonicalMeaning[];
  synonyms: string[];
  antonyms: string[];
  examples: CanonicalExample[];
} {
  const headword = typeof raw.headword === "string" && raw.headword.trim()
    ? raw.headword.trim()
    : req.word;
  const originalInput = typeof raw.originalInput === "string" && raw.originalInput.trim()
    ? raw.originalInput.trim()
    : req.word;

  let ipa: string | null = null;
  if (typeof raw.ipa === "string" && raw.ipa.trim().length > 0) {
    ipa = raw.ipa.trim();
  }

  let reading: string[] | null = null;
  if (typeof raw.reading === "string" && raw.reading.trim()) {
    reading = [raw.reading.trim()];
  } else if (Array.isArray(raw.reading)) {
    const items = raw.reading.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (items.length > 0) reading = items;
  }

  const confidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
    : 80;

  const VALID_NOTES = new Set(["sentence", "non_word", "wrong_language"]);
  const note = typeof raw.note === "string" && VALID_NOTES.has(raw.note) ? raw.note : null;

  // Gender only applies to languages with grammatical gender; the AI
  // sometimes leaks gender: "n" for Korean / Japanese / Chinese / English
  // nouns, which is meaningless there. Filter at parse time.
  const GENDERED_LANGS = new Set(["de", "fr", "es", "it", "pt", "ru"]);
  const sourceHasGender = GENDERED_LANGS.has(req.sourceLang);
  // Per-source meaning cap. KO + EN + JA + ZH + Latin (es/fr/de/it):
  // case-aware. Other sources keep the legacy slice(0, 4) hard cap;
  // normalize.ts further constrains to MAX_MEANINGS=3.
  let meaningHardCap = 4;
  if (req.sourceLang === "ko") {
    meaningHardCap = getKoMeaningCap(classifyKoInput(req.word));
  } else if (req.sourceLang === "en") {
    meaningHardCap = getEnMeaningCap(classifyEnInput(req.word));
  } else if (req.sourceLang === "ja") {
    meaningHardCap = getJaMeaningCap(classifyJaInput(req.word));
  } else if (req.sourceLang === "zh-CN" || req.sourceLang === "zh") {
    meaningHardCap = getZhMeaningCap(classifyZhInput(req.word));
  } else if (isLatinSource(req.sourceLang)) {
    meaningHardCap = getLatinMeaningCap(
      classifyLatinInput(req.word, req.sourceLang as LatinSourceLang),
    );
  }
  const meanings: CanonicalMeaning[] = Array.isArray(raw.meanings)
    ? raw.meanings
        .filter((m) => typeof m.definition === "string" && typeof m.partOfSpeech === "string")
        .map((m) => ({
          definition: String(m.definition),
          partOfSpeech: String(m.partOfSpeech),
          relevanceScore: typeof m.relevanceScore === "number"
            ? Math.max(0, Math.min(100, Math.round(m.relevanceScore)))
            : 80,
          ...(sourceHasGender && typeof m.gender === "string" && ["m", "f", "n", "mf"].includes(m.gender)
            ? { gender: m.gender as "m" | "f" | "n" | "mf" }
            : {}),
        }))
        .slice(0, meaningHardCap)
    : [];

  // Example count = meaning count (1:1). meanings was already sliced
  // to meaningHardCap above, so its length is the natural ceiling here.
  const examples: CanonicalExample[] = Array.isArray(raw.examples)
    ? raw.examples
        .filter((e) => typeof e.sentence === "string" && e.sentence.includes("**"))
        .map((e) => ({
          sentence: String(e.sentence),
          meaning_index: typeof e.meaning_index === "number"
            ? Math.max(0, Math.round(e.meaning_index))
            : 0,
        }))
        .slice(0, meanings.length)
    : [];

  // syn/ant feature removed — always empty.
  const synonyms: string[] = [];
  const antonyms: string[] = [];

  return {
    headword,
    ipa,
    reading,
    confidence,
    note,
    originalInput,
    meanings,
    synonyms,
    antonyms,
    examples,
  };
}

// ============================================================
// IPA-only retry — backfills mandatory IPA when COMBINED_QUICK omits it
// ============================================================
// COMBINED_QUICK occasionally violates the mandatory-IPA rule on
// inflected verb forms (-ed/-ing/conjugated). This focused follow-up
// asks for ONLY the IPA so canonical meanings cannot shift on retry.

function requiresIpa(
  sourceLang: string,
  headword: string,
  primaryPos: string | undefined,
): boolean {
  if (!IPA_LANGS.has(sourceLang)) return false;
  if (!headword || headword.includes(" ")) return false;
  if ((primaryPos ?? "").toLowerCase() === "expression") return false;
  return true;
}

async function runIpaOnlyRetry(
  sourceLang: string,
  headword: string,
  primaryPos: string,
  openaiKey: string,
): Promise<{ ipa: string | null; tokensIn: number; tokensOut: number; cost: number }> {
  try {
    const systemPrompt = buildIpaOnlySystemPrompt(sourceLang);
    const userPrompt = buildIpaOnlyUserPrompt(headword, sourceLang, primaryPos);
    const { result, usage, costUsd } = await callOpenAiForWordLookup({
      systemPrompt,
      userPrompt,
      apiKey: openaiKey,
      model: TRANSLATION_MODEL,
    });
    const raw = result as { ipa?: unknown };
    const ipa = typeof raw.ipa === "string" && raw.ipa.trim().length > 0
      ? raw.ipa.trim()
      : null;
    return { ipa, tokensIn: usage.prompt_tokens, tokensOut: usage.completion_tokens, cost: costUsd };
  } catch (err) {
    console.error("runIpaOnlyRetry failed:", err);
    return { ipa: null, tokensIn: 0, tokensOut: 0, cost: 0 };
  }
}

// ============================================================
// COMBINED_QUICK runner (canonical + translation in 1 LLM call)
// ============================================================

interface CombinedQuickRaw extends AnalyzeRaw {
  meanings_translated?: Array<{ definition?: unknown; partOfSpeech?: unknown }>;
}

async function runCombinedQuick(
  req: WordLookupRequest,
  lexiconHint: string | undefined,
  openaiKey: string,
): Promise<{
  entry: Omit<WordEntry, "id">;
  translatedMeanings: TranslatedMeaning[];
  tokensIn: number;
  tokensOut: number;
  cost: number;
  durationMs: number;
}> {
  const model = selectModelForLookup(req);
  const systemPrompt = buildSystemPromptRouted(req);
  const userPrompt = buildUserPromptRouted(req, lexiconHint);

  const { result: raw, usage, costUsd, durationMs } = await callOpenAiForWordLookup({
    systemPrompt,
    userPrompt,
    apiKey: openaiKey,
    model,
  });

  const combined = raw as unknown as CombinedQuickRaw;
  const normalized = normalizeAnalyzeOutput(combined, req);

  // IPA backfill — focused retry when COMBINED_QUICK violated the
  // mandatory-IPA rule. Only the ipa field is touched; meanings stay
  // frozen because the retry call has no meanings in input or output.
  let ipa = normalized.ipa;
  let extraTokensIn = 0;
  let extraTokensOut = 0;
  let extraCost = 0;
  const primaryPos = normalized.meanings[0]?.partOfSpeech ?? "";
  if (!ipa && requiresIpa(req.sourceLang, normalized.headword, primaryPos)) {
    const retry = await runIpaOnlyRetry(req.sourceLang, normalized.headword, primaryPos, openaiKey);
    if (retry.ipa) ipa = retry.ipa;
    extraTokensIn = retry.tokensIn;
    extraTokensOut = retry.tokensOut;
    extraCost = retry.cost;
  }

  // Canonical entry — examples/syn/ant intentionally empty at this stage;
  // ENRICH will fill them later when the user adds the word.
  const entry: Omit<WordEntry, "id"> = {
    word: req.word,
    word_lang: req.sourceLang,
    headword: normalized.headword,
    ipa,
    reading: normalized.reading,
    confidence: normalized.confidence,
    note: normalized.note,
    original_input: normalized.originalInput,
    meanings: normalized.meanings,
    synonyms: [],
    antonyms: [],
    examples: [],
    has_enrich: false,
    model,
    prompt_version: PROMPT_VERSION_V2,
  };

  // Parse translated meanings (in target_lang). Pad/trim to match canonical count.
  const translatedMeanings: TranslatedMeaning[] = Array.isArray(combined.meanings_translated)
    ? combined.meanings_translated.map((m, i) => ({
        definition: typeof m.definition === "string"
          ? m.definition.trim()
          : normalized.meanings[i]?.definition ?? "",
        partOfSpeech: typeof m.partOfSpeech === "string"
          ? m.partOfSpeech.trim()
          : normalized.meanings[i]?.partOfSpeech ?? "",
      }))
    : [];
  while (translatedMeanings.length < normalized.meanings.length) {
    translatedMeanings.push({
      definition: normalized.meanings[translatedMeanings.length].definition,
      partOfSpeech: normalized.meanings[translatedMeanings.length].partOfSpeech,
    });
  }
  translatedMeanings.length = normalized.meanings.length;

  return {
    entry,
    translatedMeanings,
    tokensIn: usage.prompt_tokens + extraTokensIn,
    tokensOut: usage.completion_tokens + extraTokensOut,
    cost: costUsd + extraCost,
    durationMs,
  };
}

// ============================================================
// COMBINED_QUICK streaming runner
// ============================================================
// Streams OpenAI's COMBINED_QUICK response to the client as SSE so the
// user sees content from ~500ms instead of waiting silently for ~3s.
// Only fires for QUICK mode cold-canonical case — the highest-value
// stream path. Cache hits return a single `result` event via sseResponse.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function streamCombinedQuick(args: {
  admin: SupabaseClient;
  userId: string | null;
  request: WordLookupRequest;
  lexiconHint: string | undefined;
  openaiKey: string;
  startedAt: number;
}): Response {
  const { admin, userId, request, lexiconHint, openaiKey, startedAt } = args;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      const fail = (message: string) => {
        enqueue("error", { error: message });
        controller.close();
      };

      try {
        const model = selectModelForLookup(request);
        const systemPrompt = buildSystemPromptRouted(request);
        const userPrompt = buildUserPromptRouted(request, lexiconHint);

        const streamBody: Record<string, unknown> = {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          stream: true,
          stream_options: { include_usage: true },
        };

        const openaiResp = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify(streamBody),
        });

        if (!openaiResp.ok || !openaiResp.body) {
          const errBody = await openaiResp.text();
          fail(`OpenAI ${openaiResp.status}: ${errBody.slice(0, 200)}`);
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
                // forwarding so the user never briefly sees the disputed
                // form (e.g. Sea of Japan / 일본해 in zh-CN target) before
                // the final post-processing fixes it.
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

        // Parse the final JSON.
        let combinedRaw: CombinedQuickRaw;
        try {
          let json = content.trim();
          if (json.startsWith("```")) {
            json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
          }
          combinedRaw = JSON.parse(json) as CombinedQuickRaw;
        } catch {
          fail("AI returned non-JSON content");
          return;
        }

        // Build canonical entry + translated meanings (same logic as runCombinedQuick).
        const normalized = normalizeAnalyzeOutput(combinedRaw, request);

        // IPA backfill — focused retry when COMBINED_QUICK violated the
        // mandatory-IPA rule. Adds 300-800ms to the result event timing
        // when triggered, but the user has been watching deltas stream
        // so this is hidden by the streaming UX itself.
        let ipa = normalized.ipa;
        let ipaTokensIn = 0;
        let ipaTokensOut = 0;
        let ipaCost = 0;
        const primaryPos = normalized.meanings[0]?.partOfSpeech ?? "";
        if (!ipa && requiresIpa(request.sourceLang, normalized.headword, primaryPos)) {
          const retry = await runIpaOnlyRetry(request.sourceLang, normalized.headword, primaryPos, openaiKey);
          if (retry.ipa) ipa = retry.ipa;
          ipaTokensIn = retry.tokensIn;
          ipaTokensOut = retry.tokensOut;
          ipaCost = retry.cost;
        }

        const entry: Omit<WordEntry, "id"> = {
          word: request.word,
          word_lang: request.sourceLang,
          headword: normalized.headword,
          ipa,
          reading: normalized.reading,
          confidence: normalized.confidence,
          note: normalized.note,
          original_input: normalized.originalInput,
          meanings: normalized.meanings,
          synonyms: [],
          antonyms: [],
          examples: [],
          has_enrich: false,
          model,
          prompt_version: PROMPT_VERSION_V2,
        };
        if (shouldForceEmptyExamples(request.sourceLang, request.word)) {
          entry.examples = [];
        }

        const translatedMeanings: TranslatedMeaning[] = Array.isArray(combinedRaw.meanings_translated)
          ? combinedRaw.meanings_translated.map((m, i) => ({
              definition: typeof m.definition === "string"
                ? m.definition.trim()
                : normalized.meanings[i]?.definition ?? "",
              partOfSpeech: typeof m.partOfSpeech === "string"
                ? m.partOfSpeech.trim()
                : normalized.meanings[i]?.partOfSpeech ?? "",
            }))
          : [];
        while (translatedMeanings.length < normalized.meanings.length) {
          translatedMeanings.push({
            definition: normalized.meanings[translatedMeanings.length].definition,
            partOfSpeech: normalized.meanings[translatedMeanings.length].partOfSpeech,
          });
        }
        translatedMeanings.length = normalized.meanings.length;

        // Persist BEFORE close so Supabase post-response shutdown can't
        // drop the writes (same pattern as v1 streaming).
        const isMalformed = !entry.note && entry.meanings.length === 0;
        let wordEntry: WordEntry | null = null;
        if (!isMalformed) {
          wordEntry = await saveWordEntry(admin, entry);
        }
        if (!wordEntry) wordEntry = { id: "", ...entry };

        let translation: WordTranslation | null = {
          id: "", word_entry_id: wordEntry.id, target_lang: request.targetLang,
          meanings_translated: translatedMeanings,
          examples_translated: [],
          model, prompt_version: PROMPT_VERSION_V2,
        };
        if (wordEntry.id) {
          try {
            await saveWordTranslation(admin, {
              word_entry_id: wordEntry.id,
              target_lang: request.targetLang,
              meanings_translated: translatedMeanings,
              examples_translated: [],
              model, prompt_version: PROMPT_VERSION_V2,
            });
          } catch (err) {
            console.error("saveWordTranslation (stream) failed:", err);
          }
        }

        // Rejection path: emit empty result.
        if (wordEntry.note) {
          enqueue("result", {
            result: stitchResult(wordEntry, null, request.targetLang),
            cached: false,
            cacheLevel: { canonical: false, translation: false, enriched: false },
          });
        } else {
          // QUICK mode: strip examples/syn/ant before stitching.
          const finalEntry = { ...wordEntry, examples: [], synonyms: [], antonyms: [] };
          const finalTrans = { ...translation, examples_translated: [] };
          const stitchedQuick = stitchAndNormalize(finalEntry, finalTrans, request.targetLang);
          const { filterVulgarMeanings: _fvmQ } = await import("../_shared/blocklist.ts");
          const finalResult = _fvmQ(stitchedQuick, request.targetLang);
          enqueue("result", {
            result: finalResult,
            cached: false,
            cacheLevel: { canonical: false, translation: false, enriched: false },
          });
        }

        // Log + dynamic lexicon (fire-and-forget after close).
        const promptTokens = usage?.prompt_tokens ?? 0;
        const completionTokens = usage?.completion_tokens ?? 0;
        const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
        const uncachedInput = Math.max(0, promptTokens - cachedTokens);
        const p = priceFor(model);
        const costUsd = (uncachedInput * p.input + cachedTokens * p.cached + completionTokens * p.output) / 1_000_000;

        controller.close();

        fireAndForget(logApiCall(admin, {
          userId, endpoint: ENDPOINT, cacheHit: false,
          tokensInput: promptTokens + ipaTokensIn,
          tokensOutput: completionTokens + ipaTokensOut,
          costUsd: costUsd + ipaCost,
          durationMs: Date.now() - startedAt, status: "ok",
        }));
        if (!entry.note && entry.confidence >= 70 && entry.meanings.length > 0 &&
            normalizeForLookup(entry.headword) === normalizeForLookup(request.word)) {
          fireAndForget(recordDynamicLexicon(admin, {
            language: request.sourceLang, input: request.word,
            isPhrase: isMultiToken(request.word), aiConfidence: entry.confidence,
          }));
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : "stream error");
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

// ============================================================
// ENRICH runner: per-meaning EXAMPLE (N parallel) + SYN_ANT (1 call)
// ============================================================
// Architectural shift from the single-call ENRICH: each meaning gets
// its own focused call that produces exactly one example. meaning_index
// is assigned by the server based on which slot fired the call, so
// cross-tagging (the dominant alignment bug) is impossible by
// construction. The prompt for each call is tiny (single sense in
// context) and the LLM has nothing to count or align.
//
// Cost: 1 SYN_ANT + N EXAMPLE calls instead of 1 ENRICH call. ENRICH
// calls are cheap (small prompt + tiny output), so the bump is
// approximately +20% for 3-meaning words, neutral for 1-meaning.
// Latency: all calls fired in parallel — wall time matches the slowest
// single call, no penalty vs the old single ENRICH.

interface PerMeaningExampleRaw {
  sentence?: unknown;
}

interface AllExamplesRaw {
  examples?: Array<{ sentence?: unknown; meaning_index?: unknown }>;
}

async function runEnrich(
  req: WordLookupRequest,
  headword: string,
  meanings: CanonicalMeaning[],
  translatedMeanings: TranslatedMeaning[] | null,
  lexiconHint: string | undefined,
  openaiKey: string,
): Promise<{
  examples: CanonicalExample[];
  synonyms: string[];
  antonyms: string[];
  tokensIn: number;
  tokensOut: number;
  cost: number;
}> {
  if (meanings.length === 0) {
    return { examples: [], synonyms: [], antonyms: [], tokensIn: 0, tokensOut: 0, cost: 0 };
  }
  if (shouldForceEmptyExamples(req.sourceLang, req.word)) {
    // Slurs / strongest profanity / self-harm — skip LLM entirely.
    return { examples: [], synonyms: [], antonyms: [], tokensIn: 0, tokensOut: 0, cost: 0 };
  }

  // 2026-05-20: For polysemous lookups (meanings.length >= 2), generate
  // examples via N PARALLEL per-meaning calls. Each call sees only one
  // meaning, so meaning_index ↔ sentence-content misalignment becomes
  // impossible (the call's slot is fixed). Trades ~Nx OpenAI cost on
  // polysemous words for reliable alignment — same-POS polysemy (배 belly/
  // pear/ship/times) was the failure mode that single-call ALL_EXAMPLES
  // could not solve via prompt rules alone.
  //
  // For monosemous (1 meaning), keep the case-specialized ALL_EXAMPLES
  // path — single-call quality is fine when there's only one slot.
  const normalizeKey = (s: string): string => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const seen = new Set<string>();
  let examples: CanonicalExample[] = [];
  let mainTokensIn = 0;
  let mainTokensOut = 0;
  let mainCost = 0;
  const fallbackSystemPrompt = buildPerMeaningExampleSystemPrompt(req.sourceLang);

  // Ensure translatedMeanings covers every canonical slot. When the upstream
  // COMBINED_QUICK call only produced a partial translated set (or none, on
  // cache-hit canonical), fire TRANSLATE_MEANING once here so the per-meaning
  // example calls below can use the unambiguous TARGET_LANG label.
  let effectiveTranslated: TranslatedMeaning[] | null = translatedMeanings;
  if (meanings.length >= 2 && (!effectiveTranslated || effectiveTranslated.length < meanings.length)) {
    try {
      const tm = await runTranslateMeaning(req, headword, meanings, openaiKey);
      mainTokensIn += tm.tokensIn;
      mainTokensOut += tm.tokensOut;
      mainCost += tm.cost;
      effectiveTranslated = tm.translated;
    } catch { /* fall through with partial / null */ }
  }

  if (meanings.length >= 2) {
    // Polysemy path: parallel per-meaning calls.
    const perMeaningResults = await Promise.all(
      meanings.map(async (m, idx) => {
        try {
          const translatedDef = effectiveTranslated?.[idx]?.definition;
          const userPrompt = buildPerMeaningExampleUserPrompt(
            { ...req, word: headword },
            headword,
            {
              definition: m.definition,
              partOfSpeech: m.partOfSpeech,
              ...(translatedDef ? { translatedDefinition: translatedDef } : {}),
            },
            lexiconHint,
          );
          const { result: raw, usage, costUsd } = await callOpenAiForWordLookup({
            systemPrompt: fallbackSystemPrompt,
            userPrompt,
            apiKey: openaiKey,
            model: TRANSLATION_MODEL,
          });
          const parsed = raw as unknown as PerMeaningExampleRaw;
          const sentence = typeof parsed.sentence === "string" ? parsed.sentence.trim() : "";
          return {
            example: sentence && sentence.includes("**") ? { sentence, meaning_index: idx } : null,
            tokensIn: usage.prompt_tokens,
            tokensOut: usage.completion_tokens,
            cost: costUsd,
          };
        } catch {
          return { example: null as CanonicalExample | null, tokensIn: 0, tokensOut: 0, cost: 0 };
        }
      }),
    );
    for (const r of perMeaningResults) {
      mainTokensIn += r.tokensIn;
      mainTokensOut += r.tokensOut;
      mainCost += r.cost;
      if (!r.example) continue;
      const k = normalizeKey(r.example.sentence);
      if (seen.has(k)) continue;
      seen.add(k);
      examples.push(r.example);
    }
  } else {
    // Monosemous path: case-specialized ALL_EXAMPLES (single call).
    const koExamplesPrompt = req.sourceLang === "ko"
      ? buildKoExamplesSystemPrompt(classifyKoInput(req.word))
      : "";
    const enExamplesPrompt = req.sourceLang === "en"
      ? buildEnExamplesSystemPrompt(classifyEnInput(req.word))
      : "";
    const jaExamplesPrompt = req.sourceLang === "ja"
      ? buildJaExamplesSystemPrompt(classifyJaInput(req.word))
      : "";
    const zhExamplesPrompt = (req.sourceLang === "zh-CN" || req.sourceLang === "zh")
      ? buildZhExamplesSystemPrompt(classifyZhInput(req.word))
      : "";
    const latinExamplesPrompt = isLatinSource(req.sourceLang)
      ? buildLatinExamplesSystemPrompt(
          classifyLatinInput(req.word, req.sourceLang as LatinSourceLang),
          req.sourceLang as LatinSourceLang,
        )
      : "";
    const exampleSystemPrompt = koExamplesPrompt
      || enExamplesPrompt
      || jaExamplesPrompt
      || zhExamplesPrompt
      || latinExamplesPrompt
      || buildAllExamplesSystemPrompt(req.sourceLang);
    const exampleUserPrompt = buildAllExamplesUserPrompt(
      { ...req, word: headword },
      headword,
      meanings.map((m) => ({ definition: m.definition, partOfSpeech: m.partOfSpeech })),
      lexiconHint,
    );
    try {
      const { result: raw, usage, costUsd } = await callOpenAiForWordLookup({
        systemPrompt: exampleSystemPrompt,
        userPrompt: exampleUserPrompt,
        apiKey: openaiKey,
        model: TRANSLATION_MODEL,
      });
      mainTokensIn = usage.prompt_tokens;
      mainTokensOut = usage.completion_tokens;
      mainCost = costUsd;
      const parsed = raw as unknown as AllExamplesRaw;
      const rawList = Array.isArray(parsed.examples) ? parsed.examples : [];
      for (const e of rawList) {
        const sentence = typeof e.sentence === "string" ? e.sentence.trim() : "";
        const mi = typeof e.meaning_index === "number" ? e.meaning_index : NaN;
        if (!sentence || !sentence.includes("**")) continue;
        if (!Number.isInteger(mi) || mi < 0 || mi >= meanings.length) continue;
        const k = normalizeKey(sentence);
        if (seen.has(k)) continue;
        seen.add(k);
        examples.push({ sentence, meaning_index: mi });
      }
    } catch { /* best-effort — leave examples empty */ }
  }

  // Coverage check: which meaning_index slots are missing examples?
  // For polysemy path (parallel per-meaning), every call already targeted
  // its specific slot — gaps mean the model returned empty. For monosemous,
  // there's only one slot. Either way, fire a focused per-meaning retry
  // when slots are missing.
  let extraTokensIn = 0;
  let extraTokensOut = 0;
  let extraCost = 0;
  const filledCounts = new Map<number, number>();
  for (const e of examples) filledCounts.set(e.meaning_index, (filledCounts.get(e.meaning_index) || 0) + 1);
  for (let idx = 0; idx < meanings.length; idx++) {
    if ((filledCounts.get(idx) || 0) >= 1) continue;
    const translatedDef = effectiveTranslated?.[idx]?.definition;
    const basePrompt = buildPerMeaningExampleUserPrompt(
      { ...req, word: headword },
      headword,
      {
        definition: meanings[idx].definition,
        partOfSpeech: meanings[idx].partOfSpeech,
        ...(translatedDef ? { translatedDefinition: translatedDef } : {}),
      },
      lexiconHint,
    );
    const nudge = `\n\nThe initial call did not produce an example for this meaning slot. Produce ANY natural example sentence demonstrating this specific meaning. Marker rules apply (mark the headword in its inflected form, not adjacent words).`;
    try {
      const { result: raw, usage, costUsd } = await callOpenAiForWordLookup({
        systemPrompt: fallbackSystemPrompt,
        userPrompt: basePrompt + nudge,
        apiKey: openaiKey,
        model: TRANSLATION_MODEL,
      });
      extraTokensIn += usage.prompt_tokens;
      extraTokensOut += usage.completion_tokens;
      extraCost += costUsd;
      const parsed = raw as unknown as PerMeaningExampleRaw;
      const sentence = typeof parsed.sentence === "string" ? parsed.sentence.trim() : "";
      if (sentence && sentence.includes("**")) {
        const k = normalizeKey(sentence);
        if (!seen.has(k)) {
          seen.add(k);
          examples.push({ sentence, meaning_index: idx });
        }
      }
    } catch {
      // best-effort
    }
  }

  // KO noun headword fallback regen: D validate's dropNounVerbFormExamples
  // strips examples whose marker is on the X하다 verb form rather than the
  // bare noun. Without a regen pass, the user sees an empty examples array.
  // Detect post-hoc here (mirror of the D filter) and regen via PerMeaning
  // until each meaning_index has a bare-noun-marked example.
  if (req.sourceLang === "ko" && !headword.endsWith("다") && headword.length > 1) {
    const isBareNoun = (sentence: string): boolean => {
      const m = sentence.match(/\*\*([^*]+)\*\*/);
      if (!m) return false;
      const marked = m[1].trim();
      return marked === headword || marked === headword + "들";
    };
    const kept = examples.filter((ex) => isBareNoun(ex.sentence));
    const survivingIndices = new Set(kept.map((e) => e.meaning_index));
    const missing: number[] = [];
    for (let i = 0; i < meanings.length; i++) {
      if (!survivingIndices.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      for (const idx of missing) {
        try {
          const translatedDef = effectiveTranslated?.[idx]?.definition;
          const basePrompt = buildPerMeaningExampleUserPrompt(
            { ...req, word: headword },
            headword,
            {
              definition: meanings[idx].definition,
              partOfSpeech: meanings[idx].partOfSpeech,
              ...(translatedDef ? { translatedDefinition: translatedDef } : {}),
            },
            lexiconHint,
          );
          const nudge = `\n\nThe headword "${headword}" is a NOUN. Produce ONE example using the BARE NOUN with the ** marker on the EXACT bare noun. The marker MUST equal "${headword}" verbatim (or "${headword}들" for plural). NEVER mark a verb form like "${headword}하다" or "${headword}했다". Pattern: subject + **${headword}** + particle + verb.`;
          const { result: raw, usage, costUsd } = await callOpenAiForWordLookup({
            systemPrompt: fallbackSystemPrompt,
            userPrompt: basePrompt + nudge,
            apiKey: openaiKey,
            model: TRANSLATION_MODEL,
          });
          extraTokensIn += usage.prompt_tokens;
          extraTokensOut += usage.completion_tokens;
          extraCost += costUsd;
          const parsed = raw as unknown as PerMeaningExampleRaw;
          const sentence = typeof parsed.sentence === "string" ? parsed.sentence.trim() : "";
          if (sentence && sentence.includes("**")) {
            // Accept bare-noun OR verb-form. Empty array hurts the learner
            // more than a minor marker imprecision; D validate downstream
            // (dropNounVerbFormExamples) will prefer bare-noun and keep
            // verb-form as fallback when no bare-noun exists.
            const k = normalizeKey(sentence);
            if (!seen.has(k)) {
              seen.add(k);
              kept.push({ sentence, meaning_index: idx });
            }
          }
        } catch { /* best-effort */ }
      }
      // Replace examples with cleaned set (kept survivors + regenerated).
      examples = kept;
    }
  }

  const tokensIn = mainTokensIn + extraTokensIn;
  const tokensOut = mainTokensOut + extraTokensOut;
  const cost = mainCost + extraCost;

  return {
    examples,
    synonyms: [],
    antonyms: [],
    tokensIn,
    tokensOut,
    cost,
  };
}

// Backward-compat shim — old call sites kept working.
const runAnalyzeEnrich = runEnrich;

// ============================================================
// TRANSLATE_MEANING
// ============================================================

interface TranslateMeaningRaw {
  meanings?: Array<{ definition?: unknown; partOfSpeech?: unknown }>;
}

async function runTranslateMeaning(
  req: WordLookupRequest,
  headword: string,
  meanings: CanonicalMeaning[],
  openaiKey: string,
  examples?: CanonicalExample[],
): Promise<{
  translated: TranslatedMeaning[];
  tokensIn: number;
  tokensOut: number;
  cost: number;
}> {
  if (meanings.length === 0) {
    return { translated: [], tokensIn: 0, tokensOut: 0, cost: 0 };
  }

  const systemPrompt = buildTranslateMeaningSystemPrompt(req.sourceLang, req.targetLang);
  const userPrompt = buildTranslateMeaningUserPrompt(
    headword,
    req.sourceLang,
    req.targetLang,
    meanings,
    examples,
  );

  const { result: raw, usage, costUsd } = await callOpenAiForWordLookup({
    systemPrompt,
    userPrompt,
    apiKey: openaiKey,
    model: TRANSLATION_MODEL,
  });

  const rawT = raw as unknown as TranslateMeaningRaw;
  const translated: TranslatedMeaning[] = Array.isArray(rawT.meanings)
    ? rawT.meanings.map((m, i) => ({
        definition: typeof m.definition === "string"
          ? m.definition.trim()
          : meanings[i]?.definition ?? "",
        partOfSpeech: typeof m.partOfSpeech === "string"
          ? m.partOfSpeech.trim()
          : meanings[i]?.partOfSpeech ?? "",
      }))
    : [];

  // Defensive: if AI returned wrong count, pad or trim to match input.
  while (translated.length < meanings.length) {
    translated.push({
      definition: meanings[translated.length].definition,
      partOfSpeech: meanings[translated.length].partOfSpeech,
    });
  }
  translated.length = meanings.length;

  return {
    translated,
    tokensIn: usage.prompt_tokens,
    tokensOut: usage.completion_tokens,
    cost: costUsd,
  };
}

// ============================================================
// TRANSLATE_SENTENCE
// ============================================================

interface TranslateSentenceRaw {
  examples?: Array<{ translation?: unknown }>;
}

async function runTranslateSentence(
  req: WordLookupRequest,
  headword: string,
  examples: CanonicalExample[],
  translatedMeanings: TranslatedMeaning[],
  openaiKey: string,
): Promise<{
  translated: TranslatedExample[];
  tokensIn: number;
  tokensOut: number;
  cost: number;
}> {
  if (examples.length === 0) {
    return { translated: [], tokensIn: 0, tokensOut: 0, cost: 0 };
  }

  const systemPrompt = buildTranslateSentenceSystemPrompt(req.sourceLang, req.targetLang);
  const userPrompt = buildTranslateSentenceUserPrompt(
    headword,
    req.sourceLang,
    req.targetLang,
    examples,
    translatedMeanings,
  );

  const callOnce = async () => {
    const { result: raw, usage, costUsd } = await callOpenAiForWordLookup({
      systemPrompt,
      userPrompt,
      apiKey: openaiKey,
      model: TRANSLATION_MODEL,
    });
    const rawT = raw as unknown as TranslateSentenceRaw;
    const translated: TranslatedExample[] = Array.isArray(rawT.examples)
      ? rawT.examples.map((e) => ({
          translation: typeof e.translation === "string"
            ? e.translation.replace(/\*\*/g, "").trim()
            : "",
        }))
      : [];
    while (translated.length < examples.length) {
      translated.push({ translation: "" });
    }
    translated.length = examples.length;
    return { translated, usage, costUsd };
  };

  let { translated, usage, costUsd } = await callOnce();
  let tokensIn = usage.prompt_tokens;
  let tokensOut = usage.completion_tokens;
  let cost = costUsd;

  // Empty-translation guard: the model occasionally returns a blank
  // translation for a valid sentence (observed at v7-2026-05-17 ~1% rate,
  // concentrated on shorter examples). One bounded retry; if still empty,
  // drop the offending example so the learner never sees a sentence with
  // no translation. Better to miss an example than show a half-rendered
  // one.
  const hasEmpty = translated.some((t) => !t.translation || !t.translation.trim());
  if (hasEmpty) {
    const retry = await callOnce();
    tokensIn += retry.usage.prompt_tokens;
    tokensOut += retry.usage.completion_tokens;
    cost += retry.costUsd;
    // Merge: take retry's translation where the first call's was empty;
    // keep the first call's where it succeeded (don't regress good ones).
    translated = translated.map((t, i) => {
      const tr = t.translation?.trim();
      if (tr) return t;
      const r = retry.translated[i]?.translation?.trim();
      return r ? { translation: r } : { translation: "" };
    });
  }

  return {
    translated,
    tokensIn,
    tokensOut,
    cost,
  };
}

// ============================================================
// Helper: build lexiconHint with all signal sources
// ============================================================

async function buildLexiconHint(
  admin: SupabaseClient,
  request: WordLookupRequest,
): Promise<string | undefined> {
  let lexiconHint: string | undefined;
  try {
    const cls = await classifyInput(admin, request.sourceLang, request.word);
    lexiconHint = cls.hint || undefined;
  } catch (err) {
    console.error("lexicon classify failed (non-fatal):", err);
  }
  const disputeHint = getLookupHint(request.sourceLang, request.word);
  if (disputeHint) {
    lexiconHint = lexiconHint ? `${lexiconHint}\n${disputeHint}` : disputeHint;
  }
  if (isSensitiveLookup(request.sourceLang, request.word)) {
    const hint = getSensitiveLookupHint();
    lexiconHint = lexiconHint ? `${lexiconHint}\n${hint}` : hint;
  }
  return lexiconHint;
}

// ============================================================
// Helper: pick translated meanings (override > fallback > AI)
// ============================================================

async function resolveTranslatedMeanings(
  request: WordLookupRequest,
  wordEntry: WordEntry,
  openaiKey: string,
): Promise<{ translated: TranslatedMeaning[]; tokensIn: number; tokensOut: number; cost: number }> {
  // Hard override (e.g. Taiwan → 대만/섬, kimchi → zh 辛奇).
  const fo = getForceOverrideMeanings(request.sourceLang, request.word, request.targetLang);
  if (fo) {
    return {
      translated: fo.map((m) => ({ definition: m.definition, partOfSpeech: m.partOfSpeech })),
      tokensIn: 0, tokensOut: 0, cost: 0,
    };
  }
  // Dual numeral override (en→ko cardinals).
  const dualNum = getDualNumeralOverride(request.sourceLang, request.targetLang, request.word);
  if (dualNum) {
    return {
      translated: dualNum.map((m) => ({ definition: m.definition, partOfSpeech: m.partOfSpeech })),
      tokensIn: 0, tokensOut: 0, cost: 0,
    };
  }
  // Fallback table — AI returned empty canonical for a known Korea-position term.
  if (wordEntry.meanings.length === 0) {
    const fb = getFallbackMeanings(request.sourceLang, request.word, request.targetLang);
    if (fb) {
      return {
        translated: fb.map((m) => ({ definition: m.definition, partOfSpeech: m.partOfSpeech })),
        tokensIn: 0, tokensOut: 0, cost: 0,
      };
    }
    return { translated: [], tokensIn: 0, tokensOut: 0, cost: 0 };
  }
  // Normal path: TRANSLATE_MEANING LLM call. Pass canonical examples so the
  // model can disambiguate same-spelled homonyms (배 belly/pear/ship/×N,
  // 말 horse/speech/language) — without example anchors the model has to
  // guess each slot's sense from a generic "배" / "말" definition.
  return await runTranslateMeaning(
    request, wordEntry.headword, wordEntry.meanings, openaiKey, wordEntry.examples,
  );
}

// ============================================================
// Main handler — mode-aware
// ============================================================

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    // Server-side: full detail goes to Deno logs + Sentry.
    console.error("[word-lookup-v2] uncaught:", err);
    // Client-side: opaque error code only. Stack / module paths / user
    // input fragments must never reach the client (info disclosure).
    const requestId = crypto.randomUUID();
    console.error(`[word-lookup-v2] request_id=${requestId}`);
    return new Response(
      JSON.stringify({ error: "internal_error", request_id: requestId }),
      { status: 500, headers: { "Content-Type": "application/json", ..._corsHeaders } },
    );
  }
});

async function handleRequest(req: Request): Promise<Response> {
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

  // ── Auth ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "Missing Authorization header" }, 401);

  // Peek at body to detect warm-only pings BEFORE doing the user auth check.
  // Warm pings use anon key (cron + clients) but never have a session — so
  // requiring getUser() to succeed would 401 them. We allow anon role for
  // warm_only requests; everything else still requires authenticated user.
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = await req.clone().json();
  } catch {
    /* will surface as parse error below */
  }
  const isWarmOnlyRequest = parsedBody.warm_only === true;

  // Detect service-role / anon role across legacy JWT and new API key formats.
  // Legacy: signed JWT with role claim.
  // New (post-Disable JWT-based API keys): opaque "sb_secret_xxx" / "sb_publishable_xxx"
  //   strings — compare in constant time against the auto-injected env keys.
  const tokenPayload = decodeJwtPayload(jwt);
  const envSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const envAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  function timingSafeEq(a: string, b: string): boolean {
    if (a.length !== b.length || a.length === 0) return false;
    const ae = new TextEncoder().encode(a);
    const be = new TextEncoder().encode(b);
    let diff = 0;
    for (let i = 0; i < ae.byteLength; i++) diff |= ae[i] ^ be[i];
    return diff === 0;
  }
  // SECURITY: do NOT trust tokenPayload.role — the payload is base64-decoded
  // without signature verification, so an attacker can forge `role:"service_role"`
  // / `role:"anon"`. Always verify by constant-time-comparing the raw token
  // against the env-injected secret/anon key.
  const isServiceRole = envSecret.length > 0 && timingSafeEq(jwt, envSecret);
  const isAnonRole = envAnon.length > 0 && timingSafeEq(jwt, envAnon);
  let userId: string | null;
  if (isServiceRole) {
    userId = null;
  } else if (isWarmOnlyRequest && isAnonRole) {
    // Warm-only ping from cron or idle client — no session required.
    userId = null;
  } else {
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }
    userId = userData.user.id;
  }

  // ── Smart warm-check: avoid wasting OpenAI calls when cache is already hot ──
  // The client (and pg_cron) periodically ping with warm_only:true to keep
  // the OpenAI prompt cache warm during idle periods. Self-contained — no
  // word/sourceLang/targetLang validation required. Returns immediately if
  // any real OpenAI call happened in the last 5 minutes; otherwise fires
  // one tiny dummy call to refresh the cache.
  if (isWarmOnlyRequest) {
    try {
      const { data } = await admin
        .from("warm_state")
        .select("last_real_call_at")
        .eq("id", 1)
        .maybeSingle();
      const lastMs = data?.last_real_call_at ? new Date(data.last_real_call_at).getTime() : 0;
      const ageMs = Date.now() - lastMs;
      const WARM_WINDOW_MS = 5 * 60 * 1000;
      if (ageMs >= 0 && ageMs < WARM_WINDOW_MS) {
        return jsonResponse({ status: "warm", ageMs });
      }

      // Stale — fire a tiny OpenAI call to warm the COMBINED_QUICK prompt.
      // Use ko→en for the warm-up (the most common path). max_tokens kept
      // small so the call costs ~$0.001-0.002.
      const sysPrompt = buildCombinedQuickSystemPrompt("ko", "en");
      const userPrompt = buildCombinedQuickUserPrompt({
        word: "안녕", sourceLang: "ko", targetLang: "en", mode: "quick",
      });
      const warmResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + openaiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: TRANSLATION_MODEL,
          temperature: 0,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 200,
          response_format: { type: "json_object" },
        }),
      });
      if (warmResp.ok) {
        await admin.from("warm_state").upsert(
          { id: 1, last_real_call_at: new Date().toISOString() },
          { onConflict: "id" },
        );
        return jsonResponse({ status: "warmed", ageMs });
      }
      return jsonResponse({ status: "warm_failed", ageMs, openaiStatus: warmResp.status });
    } catch (err) {
      return jsonResponse({
        status: "warm_error",
        error: err instanceof Error ? err.message : String(err),
      }, 500);
    }
  }

  // ── Parse + validate ──
  let request: WordLookupRequest;
  let forceFresh = false;
  let forceFreshTranslation = false;
  let isStream = false;
  let isTranslate = false;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    request = validateInput(body);
    forceFresh = isServiceRole && body.forceFresh === true;
    forceFreshTranslation = isServiceRole && body.forceFreshTranslation === true;
    isStream = wantsStream(req, body);
    isTranslate = body.translate === true;
  } catch (err) {
    const status = err instanceof ValidationError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Bad request";
    return jsonResponse({ error: message }, status);
  }

  const startedAt = Date.now();

  // ── Translate mode (reverse lookup: native-lang word → study-lang candidates) ──
  // The user typed `request.word` in `request.targetLang` (their native
  // language). We want candidates in `request.sourceLang` (the study
  // language of their wordlist). Flow: dispute redirect → manual
  // override (Korea-position) → cache lookup → OpenAI fallback → save.
  if (isTranslate) {
    // The "input language" for redirect purposes is the user's typed
    // language (target_lang here, because the request was constructed
    // assuming forward direction).
    const inputLang = request.targetLang;
    const studyLang = request.sourceLang;
    const redirected = redirectDisputedInput(inputLang, request.word);
    const inputWord = redirected;

    // Hard override: Korea-position canonical mappings (김치→辛奇 zh,
    // 한복→韩服 zh, 독도→Dokdo en/独島 ja, etc.) Skip the LLM entirely
    // when a manual override exists.
    const manualOverride = getTranslateOverride(inputLang, inputWord, studyLang);
    if (manualOverride) {
      fireAndForget(logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false, costUsd: 0,
        durationMs: Date.now() - startedAt, status: "ok",
      }));
      return jsonResponse({ result: { candidates: manualOverride } });
    }

    // Cache: reverse_lookups keyed by (input_word, input_lang, target_lang).
    if (!forceFresh) {
      const cached = await getReverseLookup(admin, inputWord, inputLang, studyLang);
      if (cached) {
        fireAndForget(logApiCall(admin, {
          userId, endpoint: ENDPOINT, cacheHit: true, costUsd: 0,
          durationMs: Date.now() - startedAt, status: "ok",
        }));
        const result = cached.note
          ? { candidates: [], note: cached.note }
          : { candidates: cached.candidates };
        return jsonResponse({ result });
      }
    }

    // Cache miss → LLM call.
    try {
      if (!isServiceRole) await enforceAllLimits(admin, userId, "word-lookup");
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
      const systemPrompt = buildReverseLookupSystemPrompt(inputLang, studyLang);
      const userPrompt = buildReverseLookupUserPrompt(inputWord);
      const { result: raw, usage, costUsd, durationMs } = await callOpenAiForWordLookup({
        systemPrompt,
        userPrompt,
        apiKey: openaiKey,
        model: TRANSLATION_MODEL,
      });

      const rawObj = raw as Record<string, unknown>;
      const noteRaw = typeof rawObj.note === "string" ? rawObj.note : null;
      const note = (noteRaw === "sentence" || noteRaw === "non_word" || noteRaw === "wrong_language") ? noteRaw : null;
      let candidates: Array<{ headword: string; hint: string }> = [];
      if (!note && Array.isArray(rawObj.candidates)) {
        candidates = (rawObj.candidates as Array<Record<string, unknown>>)
          .filter((c) => typeof c.headword === "string" && (c.headword as string).trim().length > 0)
          .map((c) => ({ headword: String(c.headword).trim(), hint: String(c.hint ?? "").trim() }))
          .slice(0, 4);

        // Deduplicate by normalized headword (the AI sometimes repeats
        // for epicene nouns despite the prompt's explicit dedup rule).
        const seen = new Map<string, { headword: string; hint: string }>();
        for (const c of candidates) {
          const key = c.headword.normalize("NFC").trim().toLowerCase();
          if (!seen.has(key)) seen.set(key, c);
        }
        candidates = Array.from(seen.values()).map((c) =>
          // Strip redundant single-candidate hints — nothing to disambiguate.
          seen.size === 1 ? { ...c, hint: "" } : c
        );
      }

      // Persist to cache (fire-and-forget). Even empty/note results get
      // cached so a future identical query short-circuits.
      fireAndForget(saveReverseLookup(admin, {
        input_word: inputWord,
        input_lang: inputLang,
        target_lang: studyLang,
        candidates,
        note,
        model: TRANSLATION_MODEL,
        prompt_version: PROMPT_VERSION_V2,
      }));

      fireAndForget(logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false,
        tokensInput: usage.prompt_tokens, tokensOutput: usage.completion_tokens,
        costUsd, durationMs, status: "ok",
      }));

      const result = note ? { candidates: [], note } : { candidates };
      return jsonResponse({ result });
    } catch (err) {
      const isOpenAi = err instanceof OpenAiError;
      const message = err instanceof Error ? err.message : "Unknown error";
      fireAndForget(logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false, status: "error",
        errorMessage: message, durationMs: Date.now() - startedAt,
      }));
      return jsonResponse(
        { error: message, code: isOpenAi ? "openai_error" : "internal" },
        isOpenAi ? 502 : 500,
      );
    }
  }

  const isEnrichMode = request.mode === "enrich";
  // Streaming is only supported for QUICK mode. ENRICH involves multiple
  // sequential LLM calls and runs async after the user adds a word, so
  // perceived-latency streaming wouldn't change UX.
  const useStream = isStream && !isEnrichMode;

  // ── Vocab refusal (vulgar/profanity/slur — learning-tool positioning) ──
  // Hardcoded list of vulgar/slang/slur tokens. Prompt rules also encourage
  // refusal but model is inconsistent; this deterministic check ensures
  // these always refuse with note="non_word" regardless of model output.
  {
    const { isVocabRefusal } = await import("../_shared/blocklist.ts");
    if (isVocabRefusal(request.sourceLang, request.word)) {
      fireAndForget(logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false, costUsd: 0,
        durationMs: Date.now() - startedAt, status: "ok",
      }));
      const refusalResult: WordLookupResult = {
        headword: request.word,
        meanings: [],
        note: "non_word",
        confidence: 0,
      };
      if (useStream) return sseResponse({ result: refusalResult });
      return jsonResponse({ result: refusalResult });
    }
  }

  // ── Input blacklist (atrocity glorification, etc.) ──
  if (isInputBlacklisted(request.sourceLang, request.word)) {
    fireAndForget(logApiCall(admin, {
      userId, endpoint: ENDPOINT, cacheHit: false, costUsd: 0,
      durationMs: Date.now() - startedAt, status: "ok",
    }));
    const blacklistResult: WordLookupResult = {
      headword: request.word,
      meanings: [],
      note: "non_word",
      confidence: 0,
    };
    if (useStream) return sseResponse({ result: blacklistResult });
    return jsonResponse({ result: blacklistResult });
  }

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;

  // ── Stage 1: canonical entry (always required) ──
  let wordEntry: WordEntry | null = forceFresh
    ? null
    : await getWordEntry(admin, request.word, request.sourceLang);
  const canonicalCacheHit = wordEntry !== null;
  let translatedMeaningsFromCombined: TranslatedMeaning[] | null = null;

  // Cache-hit IPA backfill: legacy entries created before the IPA-only
  // retry was wired (or where the retry itself failed) may have null IPA
  // for qualifying headwords. Fire-and-forget — patches the cache so the
  // next lookup serves IPA, but doesn't delay this response.
  if (
    canonicalCacheHit && wordEntry &&
    wordEntry.id && !wordEntry.note && !wordEntry.ipa &&
    wordEntry.meanings.length > 0 &&
    requiresIpa(request.sourceLang, wordEntry.headword, wordEntry.meanings[0].partOfSpeech)
  ) {
    const entryId = wordEntry.id;
    const headword = wordEntry.headword;
    const primaryPos = wordEntry.meanings[0].partOfSpeech;
    fireAndForget((async () => {
      const retry = await runIpaOnlyRetry(request.sourceLang, headword, primaryPos, openaiKey);
      if (retry.ipa) await patchWordEntryIpa(admin, entryId, retry.ipa);
    })());
  }

  // Build lexiconHint only when we'll actually call the LLM (cache miss
  // or enrich without enrichment yet).
  const needLlmForCanonical = !wordEntry;
  const needLlmForEnrich = isEnrichMode && (wordEntry === null || !wordEntry.has_enrich);
  let lexiconHint: string | undefined;
  if (needLlmForCanonical || needLlmForEnrich) {
    lexiconHint = await buildLexiconHint(admin, request);
  }

  if (!wordEntry) {
    // Rate limit only fires on cache miss.
    try {
      if (!isServiceRole) await enforceAllLimits(admin, userId, "word-lookup");
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetExhaustedError) {
        await logApiCall(admin, {
          userId, endpoint: ENDPOINT, cacheHit: false,
          status: err instanceof RateLimitError ? "rate_limited" : "budget_exhausted",
          errorMessage: err.message,
          durationMs: Date.now() - startedAt,
        });
        return jsonResponse({ error: err.message }, err.status);
      }
      console.error("limit check failed:", err);
      return jsonResponse({ error: "Internal error" }, 500);
    }

    // ── Streaming cold-path shortcut ──
    // For QUICK mode + cache miss + stream requested: hand off to the
    // streaming runner. It does its own COMBINED_QUICK call, cache writes,
    // and SSE event emission — then returns directly to the client.
    if (useStream) {
      return streamCombinedQuick({
        admin, userId, request, lexiconHint, openaiKey, startedAt,
      });
    }

    try {
      // Single combined LLM call: canonical + target translation in one shot.
      const combined = await runCombinedQuick(request, lexiconHint, openaiKey);
      totalTokensIn += combined.tokensIn;
      totalTokensOut += combined.tokensOut;
      totalCost += combined.cost;
      translatedMeaningsFromCombined = combined.translatedMeanings;

      const isMalformed = !combined.entry.note && combined.entry.meanings.length === 0;

      // Typo / variant dedup: when the canonical headword differs from the
      // user's input AND an entry for the canonical headword already exists,
      // reuse that entry's enrichment + translation. Avoids regenerating
      // different examples for variant spellings (학굣 → 학교).
      if (
        !isMalformed &&
        !combined.entry.note &&
        normalizeForLookup(combined.entry.headword) !== normalizeForLookup(request.word)
      ) {
        const canonicalEntry = await getWordEntry(admin, combined.entry.headword, request.sourceLang);
        if (canonicalEntry && canonicalEntry.meanings.length > 0 && !canonicalEntry.note) {
          // Copy enrichment from canonical entry. Save the variant entry as a
          // pointer carrying the same content so subsequent variant lookups
          // remain cache-fast.
          const variantEntry: Omit<WordEntry, "id"> = {
            ...combined.entry,
            meanings: canonicalEntry.meanings,
            examples: canonicalEntry.examples,
            synonyms: canonicalEntry.synonyms,
            antonyms: canonicalEntry.antonyms,
            has_enrich: canonicalEntry.has_enrich,
          };
          wordEntry = await saveWordEntry(admin, variantEntry);
          if (!wordEntry) wordEntry = { id: "", ...variantEntry };

          // Also reuse the canonical's translation (if exists for this target_lang)
          // so the per-meaning anchor + final examples_translated are consistent.
          if (canonicalEntry.id) {
            const canonicalTrans = await getWordTranslation(admin, canonicalEntry.id, request.targetLang);
            if (canonicalTrans && canonicalTrans.meanings_translated.length === canonicalEntry.meanings.length) {
              translatedMeaningsFromCombined = canonicalTrans.meanings_translated;
              if (wordEntry.id) {
                fireAndForget(saveWordTranslation(admin, {
                  word_entry_id: wordEntry.id,
                  target_lang: request.targetLang,
                  meanings_translated: canonicalTrans.meanings_translated,
                  examples_translated: canonicalTrans.examples_translated,
                  model: TRANSLATION_MODEL,
                  prompt_version: PROMPT_VERSION_V2,
                }));
              }
            }
          }
        }
      }

      if (!wordEntry) {
        if (!isMalformed) {
          wordEntry = await saveWordEntry(admin, combined.entry);
        }
        if (!wordEntry) {
          wordEntry = { id: "", ...combined.entry };
        }
      }

      if (
        !combined.entry.note &&
        combined.entry.confidence >= 70 &&
        combined.entry.meanings.length > 0 &&
        normalizeForLookup(combined.entry.headword) === normalizeForLookup(request.word)
      ) {
        fireAndForget(recordDynamicLexicon(admin, {
          language: request.sourceLang,
          input: request.word,
          isPhrase: isMultiToken(request.word),
          aiConfidence: combined.entry.confidence,
        }));
      }
    } catch (err) {
      const isOpenAi = err instanceof OpenAiError;
      const message = err instanceof Error ? err.message : "Unknown error";
      await logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false, status: "error",
        errorMessage: message, durationMs: Date.now() - startedAt,
      });
      return jsonResponse(
        { error: message, code: isOpenAi ? "openai_error" : "internal" },
        isOpenAi ? 502 : 500,
      );
    }
  }

  if (!wordEntry) {
    return jsonResponse({ error: "Internal: word entry unavailable" }, 500);
  }

  // ── Rejection path: note set ── (same for both modes)
  if (wordEntry.note) {
    fireAndForget(logApiCall(admin, {
      userId, endpoint: ENDPOINT, cacheHit: canonicalCacheHit,
      tokensInput: totalTokensIn, tokensOutput: totalTokensOut, costUsd: totalCost,
      durationMs: Date.now() - startedAt, status: "ok",
    }));
    const rejectBody = {
      result: stitchResult(wordEntry, null),
      cached: canonicalCacheHit,
    };
    if (useStream) return sseResponse(rejectBody);
    return jsonResponse(rejectBody);
  }

  // ── Stage 2a: ENRICH (only when mode=enrich and not yet enriched) ──
  if (isEnrichMode && !wordEntry.has_enrich) {
    try {
      // Typo / variant dedup at ENRICH stage: when input ≠ canonical headword
      // AND the canonical headword's entry already has enrichment, COPY
      // examples/syn/ant from it instead of generating fresh. This guarantees
      // 학굣 and 학교 produce the same example set even when the dedup at
      // Stage 1 lost a race (canonical entry not yet enriched at that moment).
      let enrichmentCopiedFromCanonical = false;
      if (
        normalizeForLookup(wordEntry.headword) !== normalizeForLookup(request.word)
      ) {
        const canonicalEntry = await getWordEntry(admin, wordEntry.headword, request.sourceLang);
        if (canonicalEntry && canonicalEntry.has_enrich && canonicalEntry.examples.length > 0) {
          wordEntry = {
            ...wordEntry,
            meanings: canonicalEntry.meanings,
            examples: canonicalEntry.examples,
            synonyms: canonicalEntry.synonyms,
            antonyms: canonicalEntry.antonyms,
            has_enrich: true,
          };
          if (wordEntry.id) {
            fireAndForget(patchWordEntryEnrichment(admin, wordEntry.id, {
              examples: canonicalEntry.examples,
              synonyms: canonicalEntry.synonyms,
              antonyms: canonicalEntry.antonyms,
            }));
          }
          // Also reuse canonical's translation so example translations match.
          if (canonicalEntry.id) {
            const canonicalTrans = await getWordTranslation(admin, canonicalEntry.id, request.targetLang);
            if (canonicalTrans) {
              translatedMeaningsFromCombined = canonicalTrans.meanings_translated;
              if (wordEntry.id) {
                fireAndForget(saveWordTranslation(admin, {
                  word_entry_id: wordEntry.id,
                  target_lang: request.targetLang,
                  meanings_translated: canonicalTrans.meanings_translated,
                  examples_translated: canonicalTrans.examples_translated,
                  model: TRANSLATION_MODEL,
                  prompt_version: PROMPT_VERSION_V2,
                }));
              }
            }
          }
          enrichmentCopiedFromCanonical = true;
        }
      }

      if (enrichmentCopiedFromCanonical) {
        // Skip LLM enrichment — content was copied above.
      } else {
      // Make TRANSLATED meanings available to enrich's per-meaning calls so
      // they can disambiguate same-headword homonyms (e.g. 배 → 보트/배/복부)
      // via the unambiguous TARGET_LANG sense label, not just the canonical
      // parenthetical (which the model sometimes leaves ambiguous).
      let translatedMeaningsForEnrich: TranslatedMeaning[] | null = translatedMeaningsFromCombined;
      if (!translatedMeaningsForEnrich && wordEntry.id) {
        const cached = await getWordTranslation(admin, wordEntry.id, request.targetLang);
        if (cached) translatedMeaningsForEnrich = cached.meanings_translated;
      }
      const enrich = await runAnalyzeEnrich(
        request, wordEntry.headword, wordEntry.meanings, translatedMeaningsForEnrich, lexiconHint, openaiKey,
      );
      totalTokensIn += enrich.tokensIn;
      totalTokensOut += enrich.tokensOut;
      totalCost += enrich.cost;

      // Patch the canonical row.
      wordEntry = {
        ...wordEntry,
        examples: enrich.examples,
        synonyms: enrich.synonyms,
        antonyms: enrich.antonyms,
        has_enrich: true,
      };
      if (wordEntry.id) {
        fireAndForget(patchWordEntryEnrichment(admin, wordEntry.id, {
          examples: enrich.examples,
          synonyms: enrich.synonyms,
          antonyms: enrich.antonyms,
        }));
      }
      }
    } catch (err) {
      const isOpenAi = err instanceof OpenAiError;
      const message = err instanceof Error ? err.message : "Unknown error";
      await logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false, status: "error",
        errorMessage: message, durationMs: Date.now() - startedAt,
      });
      return jsonResponse(
        { error: message, code: isOpenAi ? "openai_error" : "internal" },
        isOpenAi ? 502 : 500,
      );
    }
  }

  // ── Stage 2b: translation layer ──
  // forceFresh (service-role curation use) skips both canonical and
  // translation caches. forceFreshTranslation skips ONLY the translation
  // cache — used when curating multiple target_langs for the same word:
  // first iteration uses forceFresh (regenerates canonical), subsequent
  // iterations use forceFreshTranslation (canonical preserved, translation
  // refreshed).
  let translation: WordTranslation | null =
    wordEntry.id && !forceFresh && !forceFreshTranslation
      ? await getWordTranslation(admin, wordEntry.id, request.targetLang)
      : null;
  let translationCacheHit = translation !== null;

  // For quick mode, only meanings_translated matter. For enrich, both matter.
  // Decide what's still needed.
  const needMeaningsTranslation =
    !translation || (translation.meanings_translated?.length ?? 0) === 0;
  const needSentenceTranslation = isEnrichMode &&
    wordEntry.examples.length > 0 &&
    (!translation || (translation.examples_translated?.length ?? 0) < wordEntry.examples.length);

  // If COMBINED_QUICK already produced translated meanings, reuse them.
  if (needMeaningsTranslation && translatedMeaningsFromCombined) {
    translation = {
      id: "", word_entry_id: wordEntry.id, target_lang: request.targetLang,
      meanings_translated: translatedMeaningsFromCombined,
      examples_translated: translation?.examples_translated ?? [],
      model: TRANSLATION_MODEL, prompt_version: PROMPT_VERSION_V2,
    };
    if (wordEntry.id) {
      fireAndForget(saveWordTranslation(admin, {
        word_entry_id: wordEntry.id,
        target_lang: request.targetLang,
        meanings_translated: translation.meanings_translated,
        examples_translated: translation.examples_translated,
        model: TRANSLATION_MODEL,
        prompt_version: PROMPT_VERSION_V2,
      }));
    }
    translationCacheHit = false;
  } else if (needMeaningsTranslation) {
    // Cache had canonical but no translation — TRANSLATE_MEANING only call.
    try {
      const resolved = await resolveTranslatedMeanings(request, wordEntry, openaiKey);
      totalTokensIn += resolved.tokensIn;
      totalTokensOut += resolved.tokensOut;
      totalCost += resolved.cost;

      translation = {
        id: "", word_entry_id: wordEntry.id, target_lang: request.targetLang,
        meanings_translated: resolved.translated,
        examples_translated: translation?.examples_translated ?? [],
        model: TRANSLATION_MODEL, prompt_version: PROMPT_VERSION_V2,
      };
      if (wordEntry.id) {
        fireAndForget(saveWordTranslation(admin, {
          word_entry_id: wordEntry.id,
          target_lang: request.targetLang,
          meanings_translated: translation.meanings_translated,
          examples_translated: translation.examples_translated,
          model: TRANSLATION_MODEL,
          prompt_version: PROMPT_VERSION_V2,
        }));
      }
      translationCacheHit = false;
    } catch (err) {
      const isOpenAi = err instanceof OpenAiError;
      const message = err instanceof Error ? err.message : "Unknown error";
      await logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false, status: "error",
        errorMessage: message, durationMs: Date.now() - startedAt,
      });
      return jsonResponse(
        { error: message, code: isOpenAi ? "openai_error" : "internal" },
        isOpenAi ? 502 : 500,
      );
    }
  }

  // Sentence translation (enrich only).
  if (needSentenceTranslation && translation) {
    try {
      const sent = await runTranslateSentence(
        request, wordEntry.headword, wordEntry.examples,
        translation.meanings_translated, openaiKey,
      );
      totalTokensIn += sent.tokensIn;
      totalTokensOut += sent.tokensOut;
      totalCost += sent.cost;

      translation = {
        ...translation,
        examples_translated: sent.translated,
      };
      if (wordEntry.id) {
        fireAndForget(saveWordTranslation(admin, {
          word_entry_id: wordEntry.id,
          target_lang: request.targetLang,
          meanings_translated: translation.meanings_translated,
          examples_translated: translation.examples_translated,
          model: TRANSLATION_MODEL,
          prompt_version: PROMPT_VERSION_V2,
        }));
      }
      translationCacheHit = false;
    } catch (err) {
      const isOpenAi = err instanceof OpenAiError;
      const message = err instanceof Error ? err.message : "Unknown error";
      await logApiCall(admin, {
        userId, endpoint: ENDPOINT, cacheHit: false, status: "error",
        errorMessage: message, durationMs: Date.now() - startedAt,
      });
      return jsonResponse(
        { error: message, code: isOpenAi ? "openai_error" : "internal" },
        isOpenAi ? 502 : 500,
      );
    }
  }

  // ── Stitch + return ──
  // For QUICK mode, strip examples/syn/ant from the response (they exist
  // in cache but the user is on the search screen, not the wordlist).
  // For ENRICH mode, include everything.
  if (!isEnrichMode) {
    wordEntry = {
      ...wordEntry,
      examples: [],
      synonyms: [],
      antonyms: [],
    };
    if (translation) {
      translation = { ...translation, examples_translated: [] };
    }
  }

  const stitchedResult = stitchAndNormalize(wordEntry, translation, request.targetLang);

  // Apply dispute rewrites to definitions + example translations (Korea-
  // position canonical forms: 일본해→동해, 다케시마→독도, 김치→辛奇 etc.).
  // The streaming SSE path already rewrites; this is the non-streaming +
  // cache-hit code path so the same rewrites apply universally.
  const disputeRewritten = applyDisputeRewritesToResult(
    stitchedResult, request.sourceLang, request.word, request.targetLang,
  );

  // Post-process: drop slang/vulgar/derogatory secondary meanings + their
  // corresponding example slots, with meaning_index renumbering. Learning-
  // tool positioning — prompt rules also encourage this but model is
  // inconsistent, so a deterministic output filter is needed.
  const { filterVulgarMeanings } = await import("../_shared/blocklist.ts");
  const finalResult = filterVulgarMeanings(disputeRewritten, request.targetLang);

  fireAndForget(logApiCall(admin, {
    userId, endpoint: ENDPOINT,
    cacheHit: canonicalCacheHit && translationCacheHit,
    tokensInput: totalTokensIn,
    tokensOutput: totalTokensOut,
    costUsd: totalCost,
    durationMs: Date.now() - startedAt,
    status: "ok",
  }));

  const finalBody = {
    result: finalResult,
    cached: canonicalCacheHit && translationCacheHit,
    cacheLevel: {
      canonical: canonicalCacheHit,
      translation: translationCacheHit,
      enriched: wordEntry.has_enrich,
    },
  };
  if (useStream) return sseResponse(finalBody);
  return jsonResponse(finalBody);
}
