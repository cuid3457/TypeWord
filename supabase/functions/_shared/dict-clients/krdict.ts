// krdict (한국어기초사전) REST API client.
//
// 주의:
// - WAF 우회: User-Agent + Referer 헤더 필수 (없으면 400 "Request Blocked")
// - num 파라미터는 10, 20 등 standard 값만 (1·5는 error_code 103)
// - method=exact + advanced=y 로 정확일치 (default는 prefix match)
// - trans_lang 코드: 1=en 2=ja 3=fr 4=es 5=ar 6=mn 7=vi 8=th 9=id 10=ru 11=zh
//   ※ de/it 미지원 → 그 두 언어는 LLM 번역 의존
// - CC BY-SA 2.0 KR — 상업 사용 가능, attribution 필요

import type { DictEntry, DictExample, DictSense } from "./types.ts";

const BASE = "https://krdict.korean.go.kr/api";

// ──────────────────────────────────────────────────────────────────────
// Minimal XML extractor — krdict 응답 구조가 정형화되어 regex 충분.
// 의존성 0 (외부 모듈 import 안 함 → cold start 빠름).
// ──────────────────────────────────────────────────────────────────────
function extractCdata(s: string): string {
  // <![CDATA[...]]> 제거
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  if (!m) return "";
  return extractCdata(m[1]);
}

function tagBlocks(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "g");
  return block.match(re) ?? [];
}
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Referer: "https://krdict.korean.go.kr/",
  Accept: "*/*",
};

// trans_lang 코드 매핑 (우리 8개 언어 기준)
export const KRDICT_TRANS_LANG: Record<string, number> = {
  en: 1,
  ja: 2,
  fr: 3,
  es: 4,
  // de, it: krdict 미지원
  "zh-CN": 11,
};

const KRDICT_KEY = Deno.env.get("KRDICT_API_KEY") ?? "";
if (!KRDICT_KEY) {
  console.warn("[krdict] KRDICT_API_KEY missing — API calls will fail");
}


/**
 * krdict search — 단어와 trans_lang(번역 언어)을 받아 해당 단어의 모든 동음이의 entries 반환.
 * 정확일치 모드 (method=exact). 여러 sup_no entry가 있는 경우 모두 반환.
 */
export async function krdictSearch(
  word: string,
  trans_lang: number = KRDICT_TRANS_LANG.en,
  num: 10 | 20 = 10,
): Promise<DictEntry[]> {
  const url =
    `${BASE}/search?key=${KRDICT_KEY}&q=${encodeURIComponent(word)}` +
    `&part=word&num=${num}&advanced=y&method=exact` +
    `&translated=y&trans_lang=${trans_lang}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`krdict search HTTP ${res.status}`);
  }
  const xml = await res.text();
  const itemBlocks = tagBlocks(xml, "item");

  const entries: DictEntry[] = [];
  for (const item of itemBlocks) {
    const w = tagText(item, "word");
    if (w !== word) continue;
    const target_code = tagText(item, "target_code");
    const sup_no = tagText(item, "sup_no");
    const pos = tagText(item, "pos");
    const grade = tagText(item, "word_grade") || "(no grade)";
    const pronunciation = tagText(item, "pronunciation");

    const senses: DictSense[] = [];
    for (const s of tagBlocks(item, "sense")) {
      const sense_order = tagText(s, "sense_order");
      const definition = tagText(s, "definition");
      const transBlock = tagBlocks(s, "translation")[0];
      const en_translation = transBlock ? tagText(transBlock, "trans_word") || undefined : undefined;
      senses.push({
        sense_id: `${target_code}:${sense_order}`,
        source_def: definition,
        en_translation,
        pos,
        grade,
        homograph_index: sup_no,
      });
    }
    entries.push({
      headword: w,
      reading: pronunciation || undefined,
      senses,
      source: "krdict",
    });
  }
  return entries;
}

/**
 * krdict view — target_code로 상세 정보 (예문 포함) 조회.
 * 사전 예문 가져오기에 사용. (search 응답엔 예문 없음.)
 */
export async function krdictView(
  target_code: string,
  trans_lang: number = KRDICT_TRANS_LANG.en,
): Promise<DictExample[]> {
  const url =
    `${BASE}/view?key=${KRDICT_KEY}&method=target_code&q=${encodeURIComponent(target_code)}` +
    `&translated=y&trans_lang=${trans_lang}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`krdict view HTTP ${res.status}`);
  }
  const xml = await res.text();
  const item = tagBlocks(xml, "item")[0];
  if (!item) return [];

  const examples: DictExample[] = [];
  const sentenceExs: string[] = [];
  const phraseExs: string[] = [];
  for (const sense_info of tagBlocks(item, "sense_info")) {
    for (const ex of tagBlocks(sense_info, "example_info")) {
      const etype = tagText(ex, "type");
      const etext = tagText(ex, "example");
      if (!etext) continue;
      if (etype === "문장") sentenceExs.push(etext);
      else if (etype === "구") phraseExs.push(etext);
    }
  }
  if (sentenceExs.length) examples.push({ text: sentenceExs[0] });
  if (phraseExs.length) examples.push({ text: phraseExs[0] });
  return examples;
}
