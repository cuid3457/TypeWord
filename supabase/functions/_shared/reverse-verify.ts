// Reverse-lookup candidate verification.
//
// Reverse lookup is LLM-only (gpt-4.1-mini), so it can fabricate plausible-
// looking but wrong candidates — e.g. ko "바" → [bar, bat, spa] where bat/spa
// have no semantic mapping back to "바". This module gates the LLM output
// against the forward dict-first cache: for each candidate, check whether the
// already-translated meanings (word_translations.meanings_translated) for
// (candidate, studyLang → inputLang) contain a token that matches inputWord.
// Candidates with cached translations that *don't* match are dropped.
// Candidates with no cached translation pass through unverified (we don't
// have evidence to reject them).
//
// Failure mode: if verification kills *every* candidate, return the original
// list rather than empty — the LLM might be right about a rare word that
// hasn't been cached yet. We'd rather show borderline candidates than
// surface "no results" for a real word.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { WordMeaning } from "./types.ts";

interface Candidate {
  headword: string;
  hint: string;
}

const LATIN_LANGS = new Set(["en", "es", "fr", "de", "it"]);

// Token boundaries common to CJK definitions across krdict / JMdict gloss
// translations / cedict pinyin gloss / wiktionary multi-lang translations.
const TOKEN_SPLIT_RE = /[\s,，、;；/／·・()（）\[\]【】「」『』|｜.。\.]+/;

const KO_PARTICLES = /(이다|입니다|이|가|은|는|을|를|에서|에게|에|의|도|만|와|과|으로|로|하다|되다|하기|되기|함|됨|했|됐)$/;
const JA_PARTICLES = /(です|ます|だ|である|する|なる|い|な|は|が|を|に|で|と|の|も|や|か|から|まで)$/;

function stripParticle(token: string, inputLang: string): string {
  if (inputLang === "ko") return token.replace(KO_PARTICLES, "");
  if (inputLang === "ja") return token.replace(JA_PARTICLES, "");
  return token;
}

/**
 * Does `definition` (in inputLang) contain `input` as a meaningful token?
 *
 * Latin-script langs use word-boundary regex (case-insensitive).
 * CJK langs tokenize by common delimiters and exact-match after stripping
 * trailing particles (ko 조사, ja particles). zh has no particles, so
 * exact token match only.
 */
export function inputMatchesDefinition(
  input: string,
  definition: string,
  inputLang: string,
): boolean {
  if (!input || !definition) return false;
  const inputNorm = input.toLowerCase().trim().normalize("NFC");
  const defNorm = definition.toLowerCase().normalize("NFC");
  if (!inputNorm || !defNorm) return false;

  if (LATIN_LANGS.has(inputLang)) {
    const escaped = inputNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(defNorm);
  }

  const tokens = defNorm.split(TOKEN_SPLIT_RE).filter(Boolean);
  return tokens.some((t) => {
    if (t === inputNorm) return true;
    const stripped = stripParticle(t, inputLang);
    return stripped === inputNorm;
  });
}

interface VerifyResult {
  candidates: Candidate[];
  /** Diagnostic: which candidates were dropped and why. Not surfaced to user. */
  droppedHeadwords: string[];
}

/**
 * Filter LLM reverse-lookup candidates against the forward dict-first cache.
 *
 * Single batched query fetches every candidate's meanings_translated for
 * (studyLang, inputLang) in one round trip. For each candidate:
 *   - cache hit + at least one meaning matches `inputWord` → keep
 *   - cache hit + no meaning matches → drop (LLM fabrication)
 *   - cache miss (no row yet) → keep unverified (could be a real rare word)
 *
 * If verification leaves zero candidates, return the original list — better
 * to risk a borderline candidate than surface "no results" for a word the
 * LLM might genuinely know but cache hasn't seen yet.
 */
export async function verifyReverseCandidates(
  supabase: SupabaseClient,
  candidates: Candidate[],
  inputWord: string,
  inputLang: string,
  studyLang: string,
): Promise<VerifyResult> {
  if (candidates.length === 0) {
    return { candidates, droppedHeadwords: [] };
  }

  const headwords = Array.from(new Set(candidates.map((c) => c.headword.trim()).filter(Boolean)));
  if (headwords.length === 0) {
    return { candidates, droppedHeadwords: [] };
  }

  const { data, error } = await supabase
    .from("word_entries")
    .select("word, word_translations!inner(meanings_translated, target_lang)")
    .in("word", headwords)
    .eq("word_lang", studyLang)
    .eq("word_translations.target_lang", inputLang);

  if (error) {
    // DB hiccup → fail open. Don't block reverse lookup on verification.
    return { candidates, droppedHeadwords: [] };
  }

  // Build headword → meanings_translated[] map.
  const cacheMap = new Map<string, WordMeaning[]>();
  for (const row of (data ?? []) as Array<{
    word: string;
    word_translations: Array<{ meanings_translated: WordMeaning[] }>;
  }>) {
    const trans = row.word_translations?.[0];
    if (!trans?.meanings_translated) continue;
    cacheMap.set(row.word, trans.meanings_translated);
  }

  const kept: Candidate[] = [];
  const dropped: string[] = [];
  for (const c of candidates) {
    const meanings = cacheMap.get(c.headword.trim());
    if (!meanings) {
      // Cache miss — keep unverified.
      kept.push(c);
      continue;
    }
    const anyMatch = meanings.some((m) =>
      typeof m.definition === "string" &&
      inputMatchesDefinition(inputWord, m.definition, inputLang),
    );
    if (anyMatch) {
      kept.push(c);
    } else {
      dropped.push(c.headword);
    }
  }

  // If verification killed every candidate, fall back to the original list.
  // A "no results" UX is worse than a borderline candidate when we have only
  // negative cache evidence (which might itself be stale).
  if (kept.length === 0) {
    return { candidates, droppedHeadwords: dropped };
  }

  return { candidates: kept, droppedHeadwords: dropped };
}
