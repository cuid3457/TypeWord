// CC-CEDICT 중국어 사전 client.
// Postgres cedict_entries 테이블 (125K rows)에서 조회.
//
// 多音字 (多音字)는 같은 한자 + 다른 pinyin = 별도 row.
//   예) 长 [chang2] (long) / 长 [zhang3] (chief, to grow)
// → 검색 시 같은 한자의 모든 row 반환 → 각 row가 DictEntry 1개.

import type { DictEntry, DictSense } from "./types.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// ────────────────────────────────────────────────────────────────────────
// Pinyin tone-number → tone-mark conversion
// ────────────────────────────────────────────────────────────────────────
//
// CC-CEDICT stores pinyin in numeric form ("niu2 nai3"). The learning card
// expects tone-marked form ("niú nǎi"). Convert at read time.
//
// Mandarin tone-mark placement rules:
//   1. If syllable contains 'a' or 'e', mark that.
//   2. Else if "ou", mark the 'o'.
//   3. Else mark the LAST vowel.
// Tone 5 / 0 = neutral (no mark). u: (= ü) in CEDICT is left as-is for now.
const TONE_VOWELS: Record<string, string[]> = {
  a: ["a", "ā", "á", "ǎ", "à"],
  e: ["e", "ē", "é", "ě", "è"],
  i: ["i", "ī", "í", "ǐ", "ì"],
  o: ["o", "ō", "ó", "ǒ", "ò"],
  u: ["u", "ū", "ú", "ǔ", "ù"],
  ü: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
};

function toneMarkSyllable(syl: string): string {
  // Normalize u: → ü first
  const normalized = syl.replace(/u:/gi, "ü").replace(/v/gi, "ü");
  const m = normalized.match(/^([a-zü]+)([1-5])$/i);
  if (!m) return normalized;
  const [, base, toneStr] = m;
  const tone = parseInt(toneStr, 10);
  if (tone === 5 || tone === 0) return base;
  if (tone < 1 || tone > 4) return base;

  const lower = base.toLowerCase();
  let idx = -1;
  if (lower.includes("a")) idx = lower.indexOf("a");
  else if (lower.includes("e")) idx = lower.indexOf("e");
  else if (lower.includes("ou")) idx = lower.indexOf("o");
  else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ("aeiouü".includes(lower[i])) { idx = i; break; }
    }
  }
  if (idx < 0) return base;
  const vowel = lower[idx];
  const marks = TONE_VOWELS[vowel];
  if (!marks) return base;
  const upper = base[idx] !== lower[idx];
  const marked = marks[tone];
  return base.slice(0, idx) + (upper ? marked.toUpperCase() : marked) + base.slice(idx + 1);
}

function toneMarkPinyin(numeric: string): string {
  if (!numeric) return numeric;
  return numeric.trim().split(/\s+/).map(toneMarkSyllable).join(" ");
}

/**
 * CC-CEDICT에서 단어 검색 (simplified 또는 traditional).
 * 결과는 pinyin별로 다른 entry (多音字 자동 분리).
 */
export async function cedictSearch(
  supabase: SupabaseClient,
  word: string,
): Promise<DictEntry[]> {
  const { data, error } = await supabase
    .from("cedict_entries")
    .select("id, traditional, simplified, pinyin, senses")
    .or(`simplified.eq.${word},traditional.eq.${word}`);

  if (error) {
    throw new Error(`cedict query: ${error.message}`);
  }
  if (!data) return [];

  // CC-CEDICT gloss cleanup — strip dict-style metadata that leaks into card
  // labels: "lit. X (idiom); fig. Y" → "Y", "variant of X[pinyin]" → drop
  // sense, "see X" → drop sense, "abbr. for X" → drop sense. These notations
  // are useful in a lexicographer reference but unusable as learner-card text.
  function cleanCedictGloss(text: string): string {
    let s = text.trim();
    // "lit. X (idiom); fig. Y" — keep the figurative reading only
    const litFigMatch = s.match(/\blit\.\s+[^;]*;\s*fig\.\s+(.+)/i);
    if (litFigMatch) s = litFigMatch[1].trim();
    // Bare "lit. X" without follow-up "fig." — strip the prefix only.
    // CEDICT format for some idioms is just "lit. one action, two gains"
    // with no figurative gloss provided.
    s = s.replace(/^\s*lit\.\s+/i, "");
    // Strip leading "(idiom)" / "(slang)" / "(formal)" tag wrappers
    s = s.replace(/^\s*\((idiom|slang|formal|informal|literary|vulgar|colloquial|coll\.)\)\s*/i, "");
    // Strip leading parenthetical context tags ("(concept of) time",
    // "(of a woman's bearing) graceful", "(bound form) bull's-eye").
    // CEDICT lexicographers add these to disambiguate; on a learner card
    // they read as noise. Cap at 40 chars to avoid eating real content.
    s = s.replace(/^\s*\([^)]{1,40}\)\s+/, "");
    // Strip trailing "(see X)" / "(CL: 个)" / pinyin annotations [...]
    s = s.replace(/\s*\([^)]{0,40}\)\s*$/g, "");
    s = s.replace(/\[[^\]]{0,40}\]/g, "");
    // Strip inline biographical date markers "(1953–)" / "(1953-2024)" /
    // "(1953)" that follow a proper-noun headword. Without this the
    // semicolon/comma reduce step in prefillTranslation lands on
    // "Xi Jinping (1953–)" instead of just "Xi Jinping".
    s = s.replace(/\s*\((1[0-9]{3}|20[0-2][0-9])(\s*[–\-—]\s*(1[0-9]{3}|20[0-2][0-9])?)?\)\s*/g, " ");
    s = s.replace(/\s{2,}/g, " ");
    // Expand CEDICT abbreviations sth → something, sb → someone for natural
    // card text ("to ruin sth superfluous" → "to ruin something superfluous").
    s = s.replace(/\bsth\b/g, "something").replace(/\bsb\b/g, "someone");
    return s.trim();
  }
  function isCedictRedirectGloss(text: string): boolean {
    const t = text.trim();
    // "used in X[pinyin]" — sense exists only as a constituent of a fixed
    // compound (most often a surname or rare proper-noun phrase). Useless
    // on its own as a learner-card meaning.
    if (/^\s*used in\b/i.test(t)) return true;
    if (/^\s*(also pr\.|also written\b|same as\b|equivalent of\b|old form\b|old variant\b|Japanese variant\b)/i.test(t)) return true;
    return /^\s*(variant of|see also|see|abbr\. for|abbreviation of|surname\s)\b/i.test(t);
  }

  const entries: DictEntry[] = [];
  for (const row of data as Array<{
    id: number;
    traditional: string;
    simplified: string;
    pinyin: string;
    senses: string[];
  }>) {
    const senses: DictSense[] = [];
    row.senses.forEach((sense_text, idx) => {
      if (isCedictRedirectGloss(sense_text)) return; // drop pure redirect
      const cleaned = cleanCedictGloss(sense_text);
      if (!cleaned) return;
      senses.push({
        sense_id: `${row.id}:${idx}`,
        source_def: cleaned,
        en_translation: cleaned,
        homograph_index: row.pinyin,
      });
    });
    if (senses.length === 0) continue;

    entries.push({
      headword: row.simplified === word ? row.simplified : row.traditional,
      reading: toneMarkPinyin(row.pinyin),
      senses,
      source: "cedict",
    });
  }
  return entries;
}
