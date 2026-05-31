// Dict-first reverse lookup.
//
// For each native_lang we know the user is typing in, query the appropriate
// dictionary and extract candidate study-language headwords. This replaces
// the LLM-only path for the cases where we have authoritative data — for
// the rest, the v4 reverse branch falls back to LLM + verification gate.
//
// Coverage matrix (which dict covers which native_lang):
//   ko    → krdict (live API, supports en/ja/zh-CN/fr/es; de/it unsupported)
//   ja    → JMdict (in-DB, supports en/fr/de/es; ko/zh/it unsupported)
//   zh-CN → CC-CEDICT (in-DB, supports en only)
//   en    → English Wiktionary translations (in-DB, supports all 7 study langs)
//   es    → Spanish Wiktionary translations (in-DB, all 7)
//   fr    → French Wiktionary translations (in-DB, all 7)
//   de    → German Wiktionary translations (in-DB, all 7)
//   it    → Italian Wiktionary translations (in-DB, all 7)
//
// Caller gets back a list of {headword, hint} ready to drop into the existing
// candidates response. Empty list = no dict data for this pair; caller should
// fall through to LLM.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { krdictSearch } from "./krdict.ts";
import { KRDICT_TRANS_LANG } from "./krdict.ts";

export interface ReverseCandidate {
  headword: string;
  hint: string;
}

const MAX_CANDIDATES = 8;  // cap per (input, target) — keeps disambiguation UI tractable

// Wiktionary multi-lang translations table covers source_lang in {en,es,fr,de,it}.
// One row per (source_word, target_lang, target_word). Inverse-index on
// (source_lang, source_word, target_lang) makes this O(rows-per-word).
async function wiktionaryReverseLookup(
  supabase: SupabaseClient,
  inputWord: string,
  inputLang: string,
  studyLang: string,
): Promise<ReverseCandidate[]> {
  const wikt = new Set(["en", "es", "fr", "de", "it"]);
  if (!wikt.has(inputLang)) return [];

  const word = inputWord.trim().toLowerCase();
  if (!word) return [];

  const { data, error } = await supabase
    .from("wiktionary_translations")
    .select("target_word, sense_hint")
    .eq("source_lang", inputLang)
    .eq("source_word", word)
    .eq("target_lang", studyLang)
    .limit(MAX_CANDIDATES * 3);  // overfetch — dedup downstream

  if (error || !data) return [];

  return dedupCandidates(
    data.map((r) => ({
      headword: (r as { target_word: string }).target_word,
      hint: ((r as { sense_hint?: string | null }).sense_hint ?? "").trim().slice(0, 80),
    })),
  );
}

// krdict — Korean dictionary live API. The API returns translations only for
// the requested trans_lang per request; krdictSearch stores that translation
// under the (misleadingly-named) en_translation field regardless of which
// language was requested. Read it back from there.
async function krdictReverseLookup(
  inputWord: string,
  studyLang: string,
): Promise<ReverseCandidate[]> {
  const transLangCode = KRDICT_TRANS_LANG[studyLang];
  if (transLangCode === undefined) return [];

  const entries = await krdictSearch(inputWord, transLangCode);
  if (entries.length === 0) return [];

  const out: ReverseCandidate[] = [];
  for (const e of entries) {
    for (const s of e.senses) {
      const trans = s.en_translation;  // krdictSearch reuses this field for whichever trans_lang was requested
      if (!trans || !trans.trim()) continue;
      out.push({ headword: trans.trim(), hint: (s.source_def ?? "").slice(0, 80) });
      if (out.length >= MAX_CANDIDATES * 3) break;
    }
    if (out.length >= MAX_CANDIDATES * 3) break;
  }
  return dedupCandidates(out);
}

// JMdict — Japanese dictionary in-DB. Stored translations_by_lang covers eng/
// fre/ger/spa. The full sense gloss for studyLang is the candidate headword.
async function jmdictReverseLookup(
  supabase: SupabaseClient,
  inputWord: string,
  studyLang: string,
): Promise<ReverseCandidate[]> {
  const supported = new Set(["en", "fr", "de", "es"]);
  if (!supported.has(studyLang)) return [];

  // JMdict stores entries keyed by kanji_forms[]/kana_forms[]. Use array
  // containment (`cs.{X}`) so any matching form returns the row.
  const word = inputWord.trim();
  const { data, error } = await supabase
    .from("jmdict_entries")
    .select("data")
    .or(`kanji_forms.cs.{${word}},kana_forms.cs.{${word}}`)
    .limit(10);
  if (error || !data) return [];

  const JMDICT_LANG = { en: "eng", fr: "fre", de: "ger", es: "spa" } as const;
  const target = JMDICT_LANG[studyLang as keyof typeof JMDICT_LANG];

  const out: ReverseCandidate[] = [];
  for (const row of data as Array<{
    data: {
      sense?: Array<{
        gloss?: Array<{ lang: string; text: string }>;
      }>;
    };
  }>) {
    for (const sense of row.data?.sense ?? []) {
      const gloss = sense.gloss?.find((g) => g.lang === target);
      if (!gloss?.text) continue;
      // Strip scientific-name / parenthetical attributions like
      // "dog (Canis (lupus) familiaris)" → "dog". JMdict glosses bake the
      // Latin name into the same string and may nest parens, so a simple
      // (non-nested) regex pass leaves nested cases untouched. Cut from the
      // FIRST opening paren in the trailing-paren region to the end of the
      // string — the headword always comes first in JMdict glosses.
      let text = gloss.text.trim();
      const parenStart = text.indexOf(" (");
      if (parenStart >= 0 && text.endsWith(")")) {
        text = text.slice(0, parenStart).trim();
      }
      if (!text || text.length > 60) continue;
      out.push({ headword: text, hint: "" });
      if (out.length >= MAX_CANDIDATES * 3) break;
    }
    if (out.length >= MAX_CANDIDATES * 3) break;
  }
  return dedupCandidates(out);
}

// CC-CEDICT — Chinese dictionary in-DB. English glosses only — Chinese natives
// learning anything but English fall through to LLM.
async function cedictReverseLookup(
  supabase: SupabaseClient,
  inputWord: string,
  studyLang: string,
): Promise<ReverseCandidate[]> {
  if (studyLang !== "en") return [];

  const word = inputWord.trim();
  const { data, error } = await supabase
    .from("cedict_entries")
    .select("senses")
    .or(`simplified.eq.${word},traditional.eq.${word}`)
    .limit(10);
  if (error || !data) return [];

  // CC-CEDICT stores senses as a JSONB array of plain English gloss strings:
  //   ["horse", "CL:匹[pi3]", "knight in Western chess", ...]
  // Many glosses are descriptive phrases ("horse or cavalry piece in Chinese
  // chess") rather than English headwords. Those aren't useful as study-lang
  // candidates for a learner — drop them. Keep entries that look like a
  // single word or short noun phrase (≤ 3 tokens), and split multi-gloss
  // strings on common separators.
  const META_PREFIX = /^(CL:|Taiwan pr\.|variant of|see |old variant|abbr\. |surname |used in |used as |also written )/i;

  const out: ReverseCandidate[] = [];
  for (const row of data as Array<{ senses: string[] }>) {
    for (const raw of row.senses ?? []) {
      if (typeof raw !== "string") continue;
      const cleaned = raw.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").trim();
      if (!cleaned || META_PREFIX.test(cleaned)) continue;
      for (const part of cleaned.split(/[;,/]/)) {
        const w = part.trim();
        if (!w || w.length > 40) continue;
        // Phrase filter: glosses with more than 3 tokens are descriptions
        // ("horse or cavalry piece in Chinese chess"), not headwords. Skip.
        if (w.split(/\s+/).length > 3) continue;
        out.push({ headword: w, hint: "" });
        if (out.length >= MAX_CANDIDATES * 3) break;
      }
      if (out.length >= MAX_CANDIDATES * 3) break;
    }
    if (out.length >= MAX_CANDIDATES * 3) break;
  }
  return dedupCandidates(out);
}

// Dispatcher — pick the right dict for the user's native lang. Returns
// dict-first candidates or empty list (= caller should fall back to LLM).
export async function dictFirstReverseLookup(
  supabase: SupabaseClient,
  inputWord: string,
  inputLang: string,
  studyLang: string,
): Promise<ReverseCandidate[]> {
  if (!inputWord || !inputLang || !studyLang) return [];
  if (inputLang === studyLang) return [];

  try {
    if (inputLang === "ko") {
      return await krdictReverseLookup(inputWord, studyLang);
    }
    if (inputLang === "ja") {
      return await jmdictReverseLookup(supabase, inputWord, studyLang);
    }
    if (inputLang === "zh-CN") {
      return await cedictReverseLookup(supabase, inputWord, studyLang);
    }
    if (["en", "es", "fr", "de", "it"].includes(inputLang)) {
      return await wiktionaryReverseLookup(supabase, inputWord, inputLang, studyLang);
    }
  } catch (err) {
    console.warn(`[reverse-lookup] dict path failed: ${(err as Error).message}`);
  }
  return [];
}

// Dedup by headword. Preserve order — first occurrence wins (the dict returns
// senses ranked by frequency for krdict/JMdict; wiktionary order is editorial).
function dedupCandidates(rows: ReverseCandidate[]): ReverseCandidate[] {
  const seen = new Set<string>();
  const out: ReverseCandidate[] = [];
  for (const r of rows) {
    const key = r.headword.normalize("NFC").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, headword: r.headword.trim() });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}
