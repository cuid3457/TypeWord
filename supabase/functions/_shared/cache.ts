import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import type { WordLookupRequest, WordLookupResult } from "./types.ts";

// gpt-4.1-mini stays the default after a tested-but-failed gpt-5-mini swap:
// at reasoning_effort=minimal it matched 4.1-mini speed but ALSO matched its
// gender field accuracy (~62% on European nouns), so no quality gain to
// justify the move; at reasoning_effort=low it hit ~8s p50 and started
// over-thinking factual lookups (e.g. classifying "casa" as the Spanish
// verb "casar"). 4.1 family wins the speed/quality/stability triangle for
// this workload.
export const DEFAULT_MODEL = "gpt-4.1-mini";
export const HIGH_QUALITY_MODEL = "gpt-4.1";

// Languages whose short words frequently collide in spelling with English (or
// each other) and where the smaller model leaks cross-language meanings.
const LATIN_HOMOGRAPH_PRONE = new Set(["en", "fr", "es", "de", "it", "pt"]);

const CJK_LANGS = new Set(["zh-CN", "zh-TW", "ja", "ko"]);

/**
 * CJK reduplicated form detection: a 2-character input where both characters
 * are identical (奶奶, 妈妈, 爸爸, 哥哥, 弟弟, 妹妹, 爷爷, 姐姐, ぱぱ, 등).
 * gpt-4.1-mini reliably leaks the constituent character's meaning for these
 * (奶奶 → grandmother + milk) so we route them to the larger model where the
 * compositional decomposition rule actually holds.
 */
function isCjkReduplicated(req: WordLookupRequest): boolean {
  if (!CJK_LANGS.has(req.sourceLang)) return false;
  const w = req.word.trim();
  if ([...w].length !== 2) return false;
  const chars = [...w];
  return chars[0] === chars[1];
}

/**
 * Picks the OpenAI model for a quick lookup. Routes to the higher-quality
 * model in two narrow cases where gpt-4.1-mini reliably misbehaves:
 *   1. Short Latin-script words (cross-language homograph leaks).
 *   2. CJK reduplicated 2-char words (compositional-meaning leaks).
 * Everything else uses mini.
 *
 * Only meaningful for `quick` mode. Enrich and translate always use mini.
 */
export function selectModelForLookup(req: WordLookupRequest): string {
  if (req.mode && req.mode !== "quick") return DEFAULT_MODEL;
  const w = req.word.trim();
  if (w.length === 0) return DEFAULT_MODEL;
  if (isCjkReduplicated(req)) return HIGH_QUALITY_MODEL;
  if (w.length > 5) return DEFAULT_MODEL;
  if (!LATIN_HOMOGRAPH_PRONE.has(req.sourceLang)) return DEFAULT_MODEL;
  return HIGH_QUALITY_MODEL;
}

/**
 * Backwards-compat alias retained for non-quick paths (enrich, translate)
 * that don't go through model selection.
 */
export const AI_MODEL = DEFAULT_MODEL;

/**
 * Deterministic cache key that groups semantically-equivalent lookups.
 * Includes the AI model so a model upgrade automatically bypasses stale cache.
 */
export function buildCacheKey(req: WordLookupRequest, model?: string): string {
  const normWord = req.word.trim().toLowerCase();
  const mode = req.mode ?? "quick";
  const m = model ?? selectModelForLookup(req);
  // readingHint is part of the key — polysemous CJK chars need separate caches
  // per reading (e.g. 长 cháng vs 长 zhǎng have completely different results).
  const rh = req.readingHint ? `|rh:${hashShort(req.readingHint)}` : "";
  return `${normWord}|${req.sourceLang}-${req.targetLang}|${mode}|${m}${rh}`;
}

// Cheap deterministic short hash so cache keys stay bounded even when the
// reading hint is a long natural-language description.
function hashShort(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
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
    model?: string;
  },
): Promise<void> {
  const inputWord = params.req.word.trim().toLowerCase();
  const model = params.model ?? selectModelForLookup(params.req);
  const { error } = await supabase.from("global_word_cache").upsert(
    {
      cache_key: params.cacheKey,
      word: inputWord,
      source_lang: params.req.sourceLang,
      target_lang: params.req.targetLang,
      model,
      result: params.result,
      hit_count: 0,
    },
    { onConflict: "cache_key" },
  );
  if (error) console.error("cache save failed:", error.message);

  const headword = params.result.headword?.trim().toLowerCase();
  if (headword && headword !== inputWord) {
    const headwordKey = buildCacheKey({ ...params.req, word: headword }, model);
    if (headwordKey !== params.cacheKey) {
      supabase.from("global_word_cache").upsert(
        {
          cache_key: headwordKey,
          word: headword,
          source_lang: params.req.sourceLang,
          target_lang: params.req.targetLang,
          model,
          result: params.result,
          hit_count: 0,
        },
        { onConflict: "cache_key" },
      ).then(() => {}, (err) => console.error("headword cache save failed:", err));
    }
  }
}
