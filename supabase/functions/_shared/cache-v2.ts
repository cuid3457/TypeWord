// cache-v2.ts
// -----------------------------------------------------------
// Cache layer for the split architecture:
//   word_entries        — canonical, target-agnostic
//   word_translations   — per-pair translation layer
// -----------------------------------------------------------

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

// Bump this whenever a meaningful change lands in the prompts or in the
// post-processing pipeline. The lookups (getWordEntry / getWordTranslation)
// filter by this constant so old rows produced by stale logic are ignored
// — they get lazily overwritten on next lookup (saveWordEntry upserts).
// History:
//   v1: initial v2 release (single-call ENRICH, no POS realign).
//   v2: per-meaning ENRICH + dedup + diversity retry + POS realign.
//   v3: example distribution changed from 2/1 → 1/1 for 2-meaning
//       words (eliminates template-similar duplicates on m0).
//   v4: definition specificity-uniformity rule (no hypernym pairing
//       inside a comma-separated near-synonym list).
//   v5: ENRICH coverage guarantee — narrow "" returns to sensitive
//       cases only + escalating retry budget so multi-word / idiom
//       lemmas reliably get at least 1 example.
//   v6: always 1 example per meaning (was 2 for monosemous). Removes
//       LLM-convergence duplicates on hard idioms.
//   v7-2026-05-17: ALL_EXAMPLES replaces PER_MEANING_EXAMPLE — all
//       examples in one call with full meaning context (v1-style), with
//       explicit meaning_index per example AND a pre-emit coherence
//       check that addresses the model's habit of defaulting to the
//       more familiar sense regardless of which slot it is filling
//       (e.g. 아침 m[0]=morning slot got a "I eat breakfast" example).
//       Quantity schedule from v1 (2 ex for 1 meaning, 3 ex for 2-3).
//       Also flips slang policy: PRIMARY clean + SECONDARY slang words
//       now drop the slang sense entirely (year/dog/pepper); PRIMARY
//       slang words return empty meanings + note="non_word"
//       (out-of-scope per learning-tool positioning, not dictionary).
export const PROMPT_VERSION_V2 = "v7-2026-05-17";

export interface CanonicalMeaning {
  definition: string;
  partOfSpeech: string;
  relevanceScore?: number;
  gender?: "m" | "f" | "n" | "mf";
}

export interface CanonicalExample {
  sentence: string;
  meaning_index: number;
}

export interface WordEntry {
  id: string;
  word: string;
  word_lang: string;
  headword: string;
  ipa?: string | null;
  reading?: string[] | null;
  confidence: number;
  note?: string | null;
  original_input?: string | null;
  meanings: CanonicalMeaning[];
  synonyms: string[];
  antonyms: string[];
  examples: CanonicalExample[];
  /** True once ANALYZE_ENRICH has run (examples + syn/ant populated).
   *  False after QUICK only. Used to decide whether to call ENRICH
   *  on a "add to wordlist" request. */
  has_enrich: boolean;
  model: string;
  prompt_version: string;
}

export interface TranslatedMeaning {
  definition: string;
  partOfSpeech: string;
}

export interface TranslatedExample {
  translation: string;
}

export interface WordTranslation {
  id: string;
  word_entry_id: string;
  target_lang: string;
  meanings_translated: TranslatedMeaning[];
  examples_translated: TranslatedExample[];
  model: string;
  prompt_version: string;
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

// ---- word_entries ----

export async function getWordEntry(
  supabase: SupabaseClient,
  word: string,
  wordLang: string,
): Promise<WordEntry | null> {
  // Filter by current PROMPT_VERSION_V2 so cached rows produced by an
  // older logic version are treated as a cache miss. The caller will
  // regenerate and saveWordEntry will upsert over the stale row.
  const { data, error } = await supabase
    .from("word_entries")
    .select(
      "id, word, word_lang, headword, ipa, reading, confidence, note, original_input, meanings, synonyms, antonyms, examples, has_enrich, model, prompt_version",
    )
    .eq("word", normalizeWord(word))
    .eq("word_lang", wordLang)
    .eq("prompt_version", PROMPT_VERSION_V2)
    .maybeSingle();

  if (error || !data) return null;

  // Fire-and-forget hit bump.
  supabase.rpc("increment_word_entry_hit", { p_id: data.id }).then(
    () => {},
    () => {},
  );

  return data as WordEntry;
}

// Languages where IPA is meaningless (phonemic scripts / reading-based
// pronunciation): Hangul is phonemic, ja uses furigana, zh uses pinyin.
// IPA for these is redundant and visually noisy — force null at save time
// regardless of what the LLM emits.
const NO_IPA_LANGS = new Set(["ko", "ja", "zh-CN", "zh-TW", "zh"]);

export async function saveWordEntry(
  supabase: SupabaseClient,
  entry: Omit<WordEntry, "id">,
): Promise<WordEntry | null> {
  const ipa = NO_IPA_LANGS.has(entry.word_lang) ? null : (entry.ipa ?? null);
  const row = {
    word: normalizeWord(entry.word),
    word_lang: entry.word_lang,
    headword: entry.headword,
    ipa,
    reading: entry.reading ?? null,
    confidence: entry.confidence,
    note: entry.note ?? null,
    original_input: entry.original_input ?? null,
    meanings: entry.meanings,
    synonyms: entry.synonyms,
    antonyms: entry.antonyms,
    examples: entry.examples,
    has_enrich: entry.has_enrich,
    model: entry.model,
    prompt_version: entry.prompt_version,
  };
  const { data, error } = await supabase
    .from("word_entries")
    .upsert(row, { onConflict: "word,word_lang" })
    .select(
      "id, word, word_lang, headword, ipa, reading, confidence, note, original_input, meanings, synonyms, antonyms, examples, has_enrich, model, prompt_version",
    )
    .maybeSingle();
  if (error) {
    console.error("saveWordEntry failed:", error.message);
    return null;
  }
  return data as WordEntry;
}

/**
 * Patch the enrichment fields onto an existing word_entries row.
 * Used after ANALYZE_ENRICH completes. Sets has_enrich=true.
 */
export async function patchWordEntryEnrichment(
  supabase: SupabaseClient,
  entryId: string,
  patch: {
    examples: CanonicalExample[];
    synonyms: string[];
    antonyms: string[];
  },
): Promise<void> {
  const { error } = await supabase
    .from("word_entries")
    .update({
      examples: patch.examples,
      synonyms: patch.synonyms,
      antonyms: patch.antonyms,
      has_enrich: true,
    })
    .eq("id", entryId);
  if (error) console.error("patchWordEntryEnrichment failed:", error.message);
}

/**
 * Patch only the IPA field onto an existing word_entries row.
 * Used by the IPA-only retry when COMBINED_QUICK violated the
 * mandatory-IPA rule and we backfilled via a focused follow-up call.
 */
export async function patchWordEntryIpa(
  supabase: SupabaseClient,
  entryId: string,
  ipa: string,
): Promise<void> {
  const { error } = await supabase
    .from("word_entries")
    .update({ ipa })
    .eq("id", entryId);
  if (error) console.error("patchWordEntryIpa failed:", error.message);
}

// ---- word_translations ----

export async function getWordTranslation(
  supabase: SupabaseClient,
  wordEntryId: string,
  targetLang: string,
): Promise<WordTranslation | null> {
  const { data, error } = await supabase
    .from("word_translations")
    .select(
      "id, word_entry_id, target_lang, meanings_translated, examples_translated, model, prompt_version",
    )
    .eq("word_entry_id", wordEntryId)
    .eq("target_lang", targetLang)
    .eq("prompt_version", PROMPT_VERSION_V2)
    .maybeSingle();
  if (error || !data) return null;

  supabase.rpc("increment_word_translation_hit", { p_id: data.id }).then(
    () => {},
    () => {},
  );

  return data as WordTranslation;
}

export async function saveWordTranslation(
  supabase: SupabaseClient,
  t: Omit<WordTranslation, "id">,
): Promise<void> {
  const { error } = await supabase
    .from("word_translations")
    .upsert(
      {
        word_entry_id: t.word_entry_id,
        target_lang: t.target_lang,
        meanings_translated: t.meanings_translated,
        examples_translated: t.examples_translated,
        model: t.model,
        prompt_version: t.prompt_version,
      },
      { onConflict: "word_entry_id,target_lang" },
    );
  if (error) console.error("saveWordTranslation failed:", error.message);
}

// ---- reverse_lookups ----

export interface ReverseLookupRow {
  id?: string;
  input_word: string;
  input_lang: string;
  target_lang: string;
  candidates: Array<{ headword: string; hint: string }>;
  note: string | null;
  model: string;
  prompt_version: string;
}

export async function getReverseLookup(
  supabase: SupabaseClient,
  inputWord: string,
  inputLang: string,
  targetLang: string,
): Promise<ReverseLookupRow | null> {
  const { data, error } = await supabase
    .from("reverse_lookups")
    .select("id, input_word, input_lang, target_lang, candidates, note, model, prompt_version")
    .eq("input_word", normalizeWord(inputWord))
    .eq("input_lang", inputLang)
    .eq("target_lang", targetLang)
    .eq("prompt_version", PROMPT_VERSION_V2)
    .maybeSingle();
  if (error || !data) return null;
  // Fire-and-forget hit bump.
  supabase.rpc("increment_reverse_lookup_hit", { p_id: data.id }).then(() => {}, () => {});
  return data as ReverseLookupRow;
}

export async function saveReverseLookup(
  supabase: SupabaseClient,
  row: Omit<ReverseLookupRow, "id">,
): Promise<void> {
  const { error } = await supabase
    .from("reverse_lookups")
    .upsert(
      {
        input_word: normalizeWord(row.input_word),
        input_lang: row.input_lang,
        target_lang: row.target_lang,
        candidates: row.candidates,
        note: row.note,
        model: row.model,
        prompt_version: row.prompt_version,
      },
      { onConflict: "input_word,input_lang,target_lang" },
    );
  if (error) console.error("saveReverseLookup failed:", error.message);
}
