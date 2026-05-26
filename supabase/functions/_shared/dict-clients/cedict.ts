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

  const entries: DictEntry[] = [];
  for (const row of data as Array<{
    id: number;
    traditional: string;
    simplified: string;
    pinyin: string;
    senses: string[];
  }>) {
    const senses: DictSense[] = row.senses.map((sense_text, idx) => ({
      sense_id: `${row.id}:${idx}`,
      source_def: sense_text, // CC-CEDICT 의미는 영어로 작성됨
      en_translation: sense_text,
      homograph_index: row.pinyin, // 多音字는 pinyin으로 구분
    }));

    entries.push({
      headword: row.simplified === word ? row.simplified : row.traditional,
      reading: toneMarkPinyin(row.pinyin),
      senses,
      source: "cedict",
    });
  }
  return entries;
}
