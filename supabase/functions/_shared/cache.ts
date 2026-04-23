import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import type { WordLookupRequest, WordLookupResult } from "./types.ts";

export const AI_MODEL = "gpt-4.1-mini";

/**
 * Deterministic cache key that groups semantically-equivalent lookups.
 * Includes the AI model so a model upgrade automatically bypasses stale cache.
 */
export function buildCacheKey(req: WordLookupRequest): string {
  const normWord = req.word.trim().toLowerCase();
  const mode = req.mode ?? "quick";
  return `${normWord}|${req.sourceLang}-${req.targetLang}|${mode}|${AI_MODEL}`;
}

export async function getFromCache(
  supabase: SupabaseClient,
  cacheKey: string,
): Promise<WordLookupResult | null> {
  const { data, error } = await supabase
    .from("global_word_cache")
    .select("result")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  // Fire-and-forget hit counter bump (no need to await).
  supabase.rpc("increment_cache_hit", { p_cache_key: cacheKey }).then(
    () => {},
    () => {},
  );

  return data.result as WordLookupResult;
}

export async function saveToCache(
  supabase: SupabaseClient,
  params: {
    cacheKey: string;
    req: WordLookupRequest;
    result: WordLookupResult;
  },
): Promise<void> {
  const inputWord = params.req.word.trim().toLowerCase();
  const { error } = await supabase.from("global_word_cache").upsert(
    {
      cache_key: params.cacheKey,
      word: inputWord,
      source_lang: params.req.sourceLang,
      target_lang: params.req.targetLang,
      model: AI_MODEL,
      result: params.result,
      hit_count: 0,
    },
    { onConflict: "cache_key" },
  );
  if (error) console.error("cache save failed:", error.message);

  const headword = params.result.headword?.trim().toLowerCase();
  if (headword && headword !== inputWord) {
    const headwordKey = buildCacheKey({ ...params.req, word: headword });
    if (headwordKey !== params.cacheKey) {
      supabase.from("global_word_cache").upsert(
        {
          cache_key: headwordKey,
          word: headword,
          source_lang: params.req.sourceLang,
          target_lang: params.req.targetLang,
          model: AI_MODEL,
          result: params.result,
          hit_count: 0,
        },
        { onConflict: "cache_key" },
      ).then(() => {}, (err) => console.error("headword cache save failed:", err));
    }
  }
}
