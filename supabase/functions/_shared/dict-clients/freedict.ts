// Free Dictionary API (Wiktionary 기반) client.
// en / es / fr / de / it 5개 라틴 알파벳 언어 cover.
//
// 주의:
// - User-Agent 헤더 필수 (없으면 403)
// - 응답 데이터는 senses[]에 있음 (definitions[] 아님 — 첫 파싱 시 헷갈렸음)
// - 비공식 rate limit (운영 시 self-host 검토)
// - CC BY-SA 4.0 + GFDL — 상업 OK, attribution 필요
//
// ⚠️ api.dictionaryapi.dev 와 혼동 주의 (그쪽은 영어 전용)

import type { DictEntry, DictSense } from "./types.ts";

const BASE = "https://freedictionaryapi.com/api/v1/entries";
const UA = "MoaVoca/1.0 (junesung07@gmail.com; Korean vocab learning app)";

const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
};

interface FreedictResponse {
  word: string;
  entries: Array<{
    language?: { code: string; name: string };
    partOfSpeech?: string;
    pronunciations?: Array<{ type: string; text: string; tags?: string[] }>;
    forms?: Array<{ word: string; tags?: string[] }>;
    senses?: Array<{
      definition: string;
      tags?: string[];
      examples?: Array<{ text: string }>;
    }>;
  }>;
}

/**
 * Free Dictionary API에서 단어 검색.
 * @param lang 우리 lang code (en/es/fr/de/it)
 */
export async function freedictSearch(
  word: string,
  lang: "en" | "es" | "fr" | "de" | "it",
): Promise<DictEntry[]> {
  const url = `${BASE}/${lang}/${encodeURIComponent(word)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) {
    return []; // 단어 미수록
  }
  if (!res.ok) {
    throw new Error(`freedict HTTP ${res.status}`);
  }

  const data = (await res.json()) as FreedictResponse;
  if (!data.entries) return [];

  const entries: DictEntry[] = [];
  // Typo-redirect filter — freedict returns entries like "Misspelling of X"
  // for common typos. Treating these as valid words pollutes canonical with
  // a misspelt headword AND blocks the typo-correction path from firing.
  // Drop senses matching the redirect pattern so the empty result triggers
  // dict-miss → neologism, which surfaces the correctedHeadword.
  const isTypoRedirect = (def: string): boolean =>
    /^(\s*(misspelling|misspelt|misspelled|alternative spelling|alternative form|alternative case form|obsolete spelling|archaic spelling|common misspelling|incorrect spelling|nonstandard spelling)\s+of)\b/i.test(def);

  data.entries.forEach((ent, entIdx) => {
    const senses: DictSense[] = [];
    (ent.senses ?? []).forEach((s, sIdx) => {
      if (isTypoRedirect(s.definition ?? "")) return; // drop typo-redirect sense
      const dictExamples = (s.examples ?? [])
        .map((e) => (e.text ?? "").trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((text) => ({ text }));
      senses.push({
        sense_id: `${entIdx}:${sIdx}`,
        source_def: s.definition,
        en_translation: lang === "en" ? s.definition : undefined,
        pos: ent.partOfSpeech,
        misc_tags: s.tags ?? [],
        homograph_index: String(entIdx),
        ...(dictExamples.length > 0 ? { examples: dictExamples } : {}),
      });
    });
    if (senses.length === 0) return; // every sense was a typo redirect — drop entry
    const ipa = ent.pronunciations?.find((p) => p.type === "ipa")?.text;
    entries.push({
      headword: data.word,
      reading: ipa,
      senses,
      source: "freedict",
    });
  });

  return entries;
}
