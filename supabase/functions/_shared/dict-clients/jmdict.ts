// JMdict 일본어 사전 client.
// Postgres jmdict_entries 테이블 (jmdict-simplified all-languages 25MB import)에서 조회.
//
// 데이터 구조 (data JSONB):
//   { id, kanji: [{text, common, tags}], kana: [{text, common, tags}],
//     sense: [{ partOfSpeech, gloss: [{lang, text}], misc, field, ... }] }
//
// gloss 언어 코드: eng / fre / ger / spa / dut / hun / rus / slv / swe
//   ※ 우리 언어 중 ko / zh-CN / it 미지원 → LLM 번역 의존

import type { DictEntry, DictSense } from "./types.ts";

// Supabase client는 함수에서 주입 (테스트 용이성). 빈 모듈에서는 import 안 함.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// JMdict gloss lang → 우리 8개 lang 매핑
const JMDICT_LANG_MAP: Record<string, string> = {
  eng: "en",
  fre: "fr",
  ger: "de",
  spa: "es",
  // dut/hun/rus/slv/swe 등은 우리 target_lang 외 — 무시
};

/**
 * JMdict에서 한자(kanji) 또는 가나(kana)로 단어 검색.
 * 정확 일치 (GIN array contains).
 */
export async function jmdictSearch(
  supabase: SupabaseClient,
  word: string,
): Promise<DictEntry[]> {
  // kanji 또는 kana 배열에 word를 포함하는 row 검색
  const { data, error } = await supabase
    .from("jmdict_entries")
    .select("jmdict_seq, kanji_forms, kana_forms, is_common, data")
    .or(`kanji_forms.cs.{${word}},kana_forms.cs.{${word}}`)
    .limit(20);

  if (error) {
    throw new Error(`jmdict query: ${error.message}`);
  }
  if (!data) return [];

  const entries: DictEntry[] = [];
  for (const row of data as Array<{
    jmdict_seq: number;
    kanji_forms: string[];
    kana_forms: string[];
    is_common: boolean;
    data: {
      kanji?: Array<{ text: string; common?: boolean }>;
      kana?: Array<{ text: string; common?: boolean }>;
      sense?: Array<{
        partOfSpeech?: string[];
        gloss?: Array<{ lang: string; text: string }>;
        misc?: string[];
        field?: string[];
      }>;
    };
  }>) {
    const senses: DictSense[] = [];
    const allSenses = row.data?.sense ?? [];
    allSenses.forEach((s, idx) => {
      const glosses = s.gloss ?? [];
      const en_translation = glosses.find((g) => g.lang === "eng")?.text;
      const translations_by_lang: Record<string, string> = {};
      for (const g of glosses) {
        const mapped = JMDICT_LANG_MAP[g.lang];
        if (mapped) translations_by_lang[mapped] = g.text;
      }
      senses.push({
        sense_id: `${row.jmdict_seq}:${idx}`,
        source_def: en_translation ?? "",
        en_translation,
        translations_by_lang,
        pos: (s.partOfSpeech ?? []).join(","),
        misc_tags: [...(s.misc ?? []), ...(s.field ?? [])],
        homograph_index: String(row.jmdict_seq),
      });
    });

    // 표제어는 입력된 word로 (kanji 또는 kana 중 하나)
    const headword = row.kanji_forms.includes(word) ? word : (row.kana_forms[0] ?? word);
    const reading = row.kana_forms[0];

    entries.push({
      headword,
      reading,
      senses,
      source: "jmdict",
    });
  }
  return entries;
}
