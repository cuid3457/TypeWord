// Lexicon classification — checks user input against pre-built dictionaries
// (word_lexicon, phrase_lexicon, slang_lexicon, dynamic_lexicon) BEFORE
// calling OpenAI, and produces a hint string the AI can use to disambiguate.
//
// The lexicon is **advisory, not authoritative**: a MISS does not mean reject;
// the AI still owns final judgment. HIT means we can be more confident in the
// classification and skip typo correction logic.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

export type LexiconHitSource =
  | "word"          // single-token static word_lexicon hit
  | "phrase"        // multi-token phrase_lexicon hit
  | "phrase_fuzzy"  // multi-token fuzzy (trigram) phrase_lexicon hit
  | "slang"         // slang/internet_slang/neologism hit
  | "dynamic"       // dynamic_lexicon (organic AI-resolved)
  | null;           // no static-lexicon evidence

export interface LexiconClassification {
  isMultiToken: boolean;
  hit: LexiconHitSource;          // strongest evidence found
  matchedForm?: string;            // canonical form from lexicon
  category?: string;               // slang category, phrasebook category, etc.
  // For Latin scripts on a MISS, suggestions found via pg_trgm similarity.
  // Capped at 5. May be empty.
  suggestions: string[];
  // Composed hint to inject into the user prompt.
  hint: string;
}

/** Normalize: NFKC + lowercase + trim. Mirrors what the lexicon ingest used. */
export function normalizeForLookup(s: string): string {
  return s.normalize("NFKC").trim().toLowerCase();
}

/**
 * Decide if an input is multi-token. CJK languages have no whitespace within
 * a word, so the criterion is "input contains an ASCII space or any Unicode
 * whitespace". Punctuation alone (e.g., "don't") does NOT split into tokens.
 */
export function isMultiToken(input: string): boolean {
  return /\s/.test(input.trim());
}

/** Detect whether the input language uses Latin-style whitespace tokenization. */
export function usesWhitespaceTokenization(language: string): boolean {
  // CJK languages use no whitespace; everything else does.
  return !["ja", "ko", "zh-CN", "zh-TW"].includes(language);
}

/**
 * Run lexicon classification on the input. Cheap (1–2 SQL round trips) — safe
 * to call before every OpenAI invocation.
 */
export async function classifyInput(
  supabase: SupabaseClient,
  language: string,
  input: string,
): Promise<LexiconClassification> {
  const normalized = normalizeForLookup(input);
  const multi = isMultiToken(input);

  if (multi) {
    const { data, error } = await supabase.rpc("lexicon_classify_phrase", {
      p_language: language,
      p_normalized: normalized,
    });
    if (error) {
      console.error("lexicon_classify_phrase error:", error.message);
      return emptyClassification(true);
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const hit = (row?.source ?? null) as LexiconHitSource;
    return {
      isMultiToken: true,
      hit,
      matchedForm: row?.matched_form ?? undefined,
      category: row?.category ?? undefined,
      suggestions: [],
      hint: buildHint(hit, true, row?.category, row?.matched_form, []),
    };
  }

  const { data, error } = await supabase.rpc("lexicon_classify_single", {
    p_language: language,
    p_normalized: normalized,
  });
  if (error) {
    console.error("lexicon_classify_single error:", error.message);
    return emptyClassification(false);
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  const hit = (row?.source ?? null) as LexiconHitSource;
  const suggestions: string[] = Array.isArray(row?.suggestions) ? row.suggestions : [];
  return {
    isMultiToken: false,
    hit,
    matchedForm: row?.matched_form ?? undefined,
    category: row?.category ?? undefined,
    suggestions,
    hint: buildHint(hit, false, row?.category, row?.matched_form, suggestions),
  };
}

function emptyClassification(multi: boolean): LexiconClassification {
  return { isMultiToken: multi, hit: null, suggestions: [], hint: "" };
}

/**
 * Fire-and-forget: record a successful AI lookup into dynamic_lexicon for
 * organic growth. Caller must gate on confidence/note/headword-match.
 */
export async function recordDynamicLexicon(
  supabase: SupabaseClient,
  params: {
    language: string;
    input: string;
    isPhrase: boolean;
    aiConfidence: number;
  },
): Promise<void> {
  const { language, input, isPhrase, aiConfidence } = params;
  const normalized = normalizeForLookup(input);
  if (!normalized) return;
  const { error } = await supabase.rpc("dynamic_lexicon_record", {
    p_language: language,
    p_normalized_input: normalized,
    p_input: input,
    p_is_phrase: isPhrase,
    p_ai_confidence: Math.max(0, Math.min(100, Math.round(aiConfidence))),
  });
  if (error) {
    console.error("dynamic_lexicon_record error:", error.message);
  }
}

/**
 * Build a short prompt hint based on lexicon evidence. Empty string means
 * "no useful hint" (AI runs as before). The hint is intentionally short to
 * avoid token bloat.
 *
 * Suggest hints are **only included when the suggestion is high-confidence**
 * (single dominant candidate, edit distance heuristic) — otherwise we pass the
 * raw input without bias so the AI can recognize neologisms.
 */
function buildHint(
  hit: LexiconHitSource,
  isMulti: boolean,
  category: string | null | undefined,
  matchedForm: string | null | undefined,
  suggestions: string[],
): string {
  if (hit === "word") {
    return "LEXICON HIT — this input is an attested word in the WORD LANGUAGE. Provide meanings normally; do NOT mark non_word or wrong_language.";
  }
  if (hit === "phrase") {
    const cat = category ? ` (${category})` : "";
    return `LEXICON HIT — this input is an attested fixed expression${cat} in the WORD LANGUAGE, conventionalized for use as a single unit. It IS in scope. Do NOT mark this as a sentence; provide its meaning as a phrasebook entry.`;
  }
  if (hit === "phrase_fuzzy") {
    const canonical = matchedForm ? ` "${matchedForm}"` : "";
    const cat = category ? ` (${category})` : "";
    return `LEXICON FUZZY CANDIDATE — the input has TRIGRAM SIMILARITY to a known fixed expression${cat}:${canonical}. This is ADVISORY only, not a confirmation. Compare the input and the candidate token-by-token before normalizing:
- If they differ ONLY in spacing, particles, conjugation, punctuation, or a single one-character typo within otherwise-matching content words → normalize to the candidate (set headword to candidate, provide its meaning).
- If they differ by a CONTENT WORD substitution (the input uses a noun/verb/adjective that is NOT a one-character typo of the corresponding word in the candidate — i.e. a different word entirely) → REJECT. Set meanings=[], note="non_word". Do NOT output the candidate's meaning. Do NOT invent a new meaning by literally interpreting the input's words.
- The candidate is the closest match in the lexicon, but "closest" can still be too far. Apply the litmus test: would a fluent native speaker confidently say "ah, you obviously meant <candidate>"? If they would hesitate, REJECT.`;
  }
  if (hit === "slang") {
    const cat = category ? ` (${category})` : "";
    return `LEXICON HIT — this input is an attested slang / informal entry${cat} in the WORD LANGUAGE. Define with its current colloquial meaning; do NOT mark non_word.`;
  }
  if (hit === "dynamic") {
    return "LEXICON HIT — this input has been recognized previously by users in the WORD LANGUAGE; treat it as a real entry and provide meanings.";
  }

  // MISS branch
  if (isMulti) {
    // Multi-token MISS: let SCOPE_POLICY decide expression-vs-sentence.
    return "";
  }
  // Single-token MISS: emit close-suggestion hints. Important framing — the
  // lexicon is incomplete (covers only ~10K core words per language), so a
  // miss does NOT mean the input is non-existent. Most real words will not
  // be in the lexicon. The hint must NOT bias the AI toward "non_word".
  const note =
    "Note: our lexicon is intentionally small (core vocabulary only) and a miss says NOTHING about whether the input is a real word. Use your own knowledge to decide. If the input is a real attested word/name in the WORD LANGUAGE — including proper nouns and any word not in our small lexicon — recognize it normally and provide its meanings; do NOT mark non_word.";
  if (suggestions.length === 1) {
    return `Lexicon hint: a close trigram-similar attested word is "${suggestions[0]}". If the input is clearly a typo of this, correct it; otherwise treat the input as the user's intended form. ${note}`;
  }
  if (suggestions.length >= 2 && suggestions.length <= 3) {
    return `Lexicon hint: close trigram-similar attested words: ${suggestions.map((s) => `"${s}"`).join(", ")}. Use these only as candidates if the input is clearly a typo of one of them; otherwise treat the input as the user's intended form. ${note}`;
  }
  return "";
}
