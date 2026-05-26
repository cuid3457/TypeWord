// Edge Function: word-lookup-v4 (Dict-first)
// -----------------------------------------------------------
// Phase 2 결과물. 흐름:
//   1. 캐시 확인 (word_entries + word_translations)
//   2. miss → 사전 호출 (krdict / jmdict / cedict / freedict)
//   3. AI judge (score + 음역 보강) — gpt-4.1-mini 2 calls
//   4. 같은 영어 번역끼리 그룹화 + score 내림차순 정렬
//   5. 사전 예문 fetch (사용 가능한 source만)
//   6. WordLookupResult 변환 + 캐시 저장
//   7. 응답
//
// v2 응답 형식 (WordLookupResult) 그대로 유지 — 클라이언트 변경 최소화.
// -----------------------------------------------------------

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import type {
  WordLookupRequest,
  WordLookupResult,
  WordMeaning,
  WordExample,
} from "../_shared/types.ts";
import type { DictEntry, DictSense } from "../_shared/dict-clients/types.ts";
import { krdictSearch, krdictView, KRDICT_TRANS_LANG } from "../_shared/dict-clients/krdict.ts";
import { jmdictSearch } from "../_shared/dict-clients/jmdict.ts";
import { cedictSearch } from "../_shared/dict-clients/cedict.ts";
import { freedictSearch } from "../_shared/dict-clients/freedict.ts";
import { judgeAndTranslate, judgeUnified, type JudgedSense } from "../_shared/dict-clients/ai-judge.ts";
import {
  generateExamples,
  translateCanonicalSentences,
  type ExampleRequest,
  type CanonicalTranslateRequest,
} from "../_shared/dict-clients/example-generator.ts";
import { validateNeologism, type NeologismSense } from "../_shared/dict-clients/neologism.ts";
import {
  enforceAllLimits,
  RateLimitError,
  BudgetExhaustedError,
} from "../_shared/limits.ts";
import { logApiCall } from "../_shared/logging.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const PROMPT_VERSION = "dict-first-v4";
const ENDPOINT = "word-lookup-v4";

// Validation guards. Match v2 caps so an attacker can't smuggle a 1 MB
// payload through v4 to drain OpenAI cost.
const SUPPORTED_LANGS = new Set([
  "ko", "ja", "en", "es", "fr", "de", "it", "zh-CN",
]);
const LANG_LENGTH_LIMITS: Record<string, number> = {
  ko: 40, ja: 40, "zh-CN": 40, en: 60, es: 60, fr: 60, de: 60, it: 60,
};
const DEFAULT_LENGTH_LIMIT = 50;

function validateLookupInput(body: unknown): WordLookupRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  const word = typeof b.word === "string" ? b.word.trim() : "";
  const sourceLang = typeof b.sourceLang === "string" ? b.sourceLang : "";
  const targetLang = typeof b.targetLang === "string" ? b.targetLang : "";
  if (!word) throw new Error("word must not be empty");
  if (!sourceLang || !targetLang) throw new Error("sourceLang and targetLang required");
  if (!SUPPORTED_LANGS.has(sourceLang) || !SUPPORTED_LANGS.has(targetLang)) {
    throw new Error("Unsupported language");
  }
  const limit = LANG_LENGTH_LIMITS[sourceLang] ?? DEFAULT_LENGTH_LIMIT;
  if (word.length > limit) throw new Error("PHRASE_TOO_LONG");
  const mode = b.mode === "enrich" ? "enrich" : "quick";
  return { word, sourceLang, targetLang, mode } as WordLookupRequest;
}

function fireAndForget<T>(p: Promise<T>): void {
  p.catch(() => {});
}

// ────────────────────────────────────────────────────────────────────────
// 사전 호출 — source language별 dispatch
// ────────────────────────────────────────────────────────────────────────
async function callDictionary(word: string, sourceLang: string, targetLang: string): Promise<DictEntry[]> {
  if (sourceLang === "ko") {
    const trans_lang = KRDICT_TRANS_LANG[targetLang] ?? KRDICT_TRANS_LANG.en;
    return await krdictSearch(word, trans_lang);
  }
  if (sourceLang === "ja") {
    return await jmdictSearch(supabase, word);
  }
  if (sourceLang === "zh-CN" || sourceLang === "zh") {
    return await cedictSearch(supabase, word);
  }
  if (["en", "es", "fr", "de", "it"].includes(sourceLang)) {
    return await freedictSearch(word, sourceLang as "en" | "es" | "fr" | "de" | "it");
  }
  throw new Error(`Unsupported sourceLang: ${sourceLang}`);
}

// ────────────────────────────────────────────────────────────────────────
// JudgedSense → 그룹화 + 정렬 + WordMeaning 변환
// ────────────────────────────────────────────────────────────────────────
interface SenseGroup {
  en_key: string;          // 그룹 키 (영어 번역 lowercase)
  display_en: string;      // 표시용 영어 (음역 보강 적용)
  max_score: number;       // 그룹 내 max score
  senses: JudgedSense[];   // 같은 영어 번역끼리 묶인 senses (score desc)
}

/**
 * 그룹화 정책 (2026-05-24, 대표님 결정):
 *
 * 사전이 이미 etymology를 분리해서 entry로 제공함 — 그 신호를 신뢰.
 * 같은 entry 안의 여러 senses = 파생 다의 → 1 representative만 노출 (학습자 부담 ↓)
 * 다른 entry = 동음이의 → 별도 카드
 *
 * 예시:
 *   run (1 entry, verb 30+ senses 파생) → 1 카드 "to move swiftly" (best score만)
 *   배 (4 entries 어원 다름) → 4 카드 (belly / boat / pear / double)
 *
 * 또한 entry가 달라도 같은 영어 번역으로 옮겨지는 경우 (예: 이 대명사 + 이 관형사 둘 다 "this")
 * 는 학습자 입장에선 같은 의미이므로 추가로 합침.
 */
function groupByEntryThenTranslation(judged: JudgedSense[]): SenseGroup[] {
  // Layer 1: 사전 entry 기준 그룹화. sense_id 형식 "{entry}:{sub}" — entry prefix 추출.
  const entryGroups = new Map<string, JudgedSense[]>();
  for (const j of judged) {
    const entryKey = j.sense.sense_id.split(":")[0] || j.sense.sense_id;
    if (!entryGroups.has(entryKey)) entryGroups.set(entryKey, []);
    entryGroups.get(entryKey)!.push(j);
  }
  // 각 entry 안에서 best score sense만 representative로
  const entryReps: JudgedSense[] = [];
  for (const senses of entryGroups.values()) {
    senses.sort((a, b) => b.score - a.score);
    entryReps.push(senses[0]);
  }

  // Layer 2: representative끼리 같은 번역이면 합치기.
  //   display_translation(target_lang 짧은 번역)이 있으면 그것이 그룹 키.
  //   없으면 en_translation 사용. 둘 다 없으면 source_def fallback.
  const groups = new Map<string, SenseGroup>();
  for (const j of entryReps) {
    const display =
      j.display_translation ??
      j.en_override ??
      j.sense.en_translation ??
      j.sense.source_def ??
      "";
    const key = display.trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { en_key: key, display_en: display.trim(), max_score: j.score, senses: [j] });
    } else {
      const g = groups.get(key)!;
      g.senses.push(j);
      if (j.score > g.max_score) g.max_score = j.score;
    }
  }
  const arr = Array.from(groups.values()).sort((a, b) => b.max_score - a.max_score);
  for (const g of arr) g.senses.sort((a, b) => b.score - a.score);
  return arr;
}

// ────────────────────────────────────────────────────────────────────────
// 예문 생성 (8개 언어 통합)
// ────────────────────────────────────────────────────────────────────────
//
// 2026-05-25 리워크: 모든 언어에서 LLM 예문 생성으로 통일.
// 이유:
//  - krdict view 예문은 target_lang 번역이 없음 (별도 LLM 번역 필요 → 결국 LLM 의존)
//  - 마커(**W**)·길이·의미 잠금 같은 학습 카드 품질 기준을 사전 raw가 만족 못함
//  - 8개 언어 통일된 품질/스타일 보장
//  - 사전 의미는 dict-first로 유지 (의미=권위, 예문=학습용 생성)
//
// example-generator는 9 품질 요소(per-meaning parallel / dual anchor / scene
// anchor / marker / length / single-call sentence+translation / post-process /
// 2-tier model / source tag) 적용.
interface ExampleResult {
  sentence: string;
  translation: string;
  source: "llm" | "dict";
}

// ────────────────────────────────────────────────────────────────────────
// 사전 예문 fetch (LLM 0 calls — quick mode 전용)
// ────────────────────────────────────────────────────────────────────────
//
// Phase 1 prototype 패턴 복원. 사전이 예문 제공하면 그대로 사용.
// 사전이 예문 안 주면 빈 채로 두고 enrich에서 LLM 보강.
//
// per-source 처리:
//   ko (krdict): senses 안엔 예문 없음 → view API로 group별 1회 추가 호출. translation 없음.
//   ja (jmdict): 현재 DB에 examples 컬럼 없음 → 빈
//   zh (cedict): 사전에 예문 없음 → 빈
//   en/es/fr/de/it (freedict): sense.examples에서 추출됨 (translation 없음)
//
// translation 필드는 비워둠 — quick mode UX 트레이드오프 ([[project_dict_first_phase1_verified]] 패턴).
// 사용자가 단어장 추가 시 enrich가 LLM 예문으로 교체.
async function fetchDictExamples(
  sourceLang: string,
  targetLang: string,
  groups: SenseGroup[],
): Promise<Map<string, ExampleResult>> {
  const out = new Map<string, ExampleResult>();
  if (groups.length === 0) return out;

  if (sourceLang === "ko") {
    const trans_lang = KRDICT_TRANS_LANG[targetLang] ?? KRDICT_TRANS_LANG.en;
    await Promise.all(
      groups.map(async (g) => {
        const target_code = g.senses[0]?.sense.sense_id.split(":")[0];
        if (!target_code) return;
        try {
          const exs = await krdictView(target_code, trans_lang);
          if (exs.length > 0) {
            out.set(g.en_key, { sentence: exs[0].text, translation: "", source: "dict" });
          }
        } catch (err) {
          console.warn(`[v4 quick] krdict view fail ${target_code}: ${(err as Error).message}`);
        }
      }),
    );
    return out;
  }

  // freedict (en/es/fr/de/it): examples are already attached to senses via freedict.ts.
  // jmdict/cedict: no dict examples — out stays empty (enrich will fill via LLM).
  for (const g of groups) {
    const firstSense = g.senses[0]?.sense;
    const dictEx = firstSense?.examples?.[0];
    if (dictEx?.text) {
      out.set(g.en_key, {
        sentence: dictEx.text,
        translation: dictEx.translation ?? "",
        source: "dict",
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// fetchExamplesViaCanonical — cross-target 재사용 디자인 (2026-05-25)
// ────────────────────────────────────────────────────────────────────────
//
// canonical(source-lang 예문 + 마커)은 word_entries.examples에 저장. target_lang
// 번역은 word_translations.examples_translated에 저장. 같은 단어를 다른 target_lang으로
// 검색하면 canonical은 재사용, target translation만 LLM 1 call.
//
// 흐름:
//   1. word_entries.examples 조회
//   2a. canonical 없음 → generateExamples로 source+target 같이 생성 (N parallel calls)
//                       → canonical은 sentence만, translation은 그대로 저장
//   2b. canonical 있음 → translateCanonicalSentences로 target_lang 번역만 1 call (batch)
//
// 새 LLM 호출 패턴:
//   - 신규 word: N senses × 1 LLM call (sentence + first-target translation 같이)
//   - 기존 word, 다른 target: 1 LLM call (모든 sentences batch 번역)
//   - cache hit: 0 LLM call
interface CanonicalExampleRow {
  sentence: string;
  meaningIndex: number;
}

async function fetchExamplesViaCanonical(
  word: string,
  headword: string,
  sourceLang: string,
  targetLang: string,
  groups: SenseGroup[],
  readingVariants: string[] = [],
): Promise<Map<string, ExampleResult>> {
  const out = new Map<string, ExampleResult>();
  if (groups.length === 0) return out;

  // 1. canonical 조회
  const { data: entry } = await supabase
    .from("word_entries")
    .select("id, examples")
    .eq("word", word)
    .eq("word_lang", sourceLang)
    .maybeSingle();
  const canonical = (entry?.examples ?? []) as CanonicalExampleRow[];

  if (canonical.length > 0 && canonical.length >= groups.length) {
    // 2b. canonical 재사용 — batch translate only
    const reqs: CanonicalTranslateRequest[] = groups.map((g, idx) => ({
      key: g.en_key,
      sentence: canonical[idx]?.sentence ?? "",
      targetGloss: g.display_en,
    })).filter((r) => r.sentence);

    const tr = await translateCanonicalSentences(reqs, sourceLang, targetLang);
    for (const g of groups) {
      const sentence = canonical[groups.indexOf(g)]?.sentence;
      const translation = tr.get(g.en_key);
      if (sentence && translation) {
        out.set(g.en_key, { sentence, translation, source: "llm" });
      } else if (sentence) {
        // translation failed — surface sentence with empty translation
        out.set(g.en_key, { sentence, translation: "", source: "llm" });
      }
    }
    return out;
  }

  // 2a. canonical 없음 — generate full (sentence + first-target translation)
  const reqs: ExampleRequest[] = groups.map((g) => ({
    key: g.en_key,
    word: headword,
    surfaceForms: readingVariants,
    senseDef:
      g.senses[0]?.en_override ??
      g.senses[0]?.sense.en_translation ??
      g.senses[0]?.sense.source_def ??
      g.display_en,
    targetGloss: g.display_en,
  }));
  const gen = await generateExamples(reqs, sourceLang, targetLang);
  // Persist canonical (sentence only, target-agnostic) into word_entries.examples.
  // The translation goes into the translation row via the caller's saveCacheTranslation.
  const canonicalRows: CanonicalExampleRow[] = [];
  groups.forEach((g, idx) => {
    const ex = gen.get(g.en_key);
    if (ex) {
      canonicalRows.push({ sentence: ex.sentence, meaningIndex: idx });
      out.set(g.en_key, { sentence: ex.sentence, translation: ex.translation, source: "llm" });
    }
  });
  if (canonicalRows.length > 0 && entry?.id) {
    await supabase.from("word_entries").update({ examples: canonicalRows }).eq("id", entry.id);
  }
  return out;
}

async function fetchExamples(
  headword: string,
  sourceLang: string,
  targetLang: string,
  groups: SenseGroup[],
  readingVariants: string[] = [],
): Promise<Map<string, ExampleResult>> {
  const out = new Map<string, ExampleResult>();
  if (groups.length === 0) return out;

  const reqs: ExampleRequest[] = groups.map((g) => {
    const firstSense = g.senses[0];
    // Anchor 1: English definition (prefer en_override > en_translation > source_def)
    const senseDef =
      firstSense?.en_override ??
      firstSense?.sense.en_translation ??
      firstSense?.sense.source_def ??
      g.display_en;
    // Anchor 2: TARGET_LANG vocabulary-card gloss
    const targetGloss = g.display_en;
    return {
      key: g.en_key,
      word: headword,
      surfaceForms: readingVariants,
      senseDef,
      targetGloss,
    };
  });

  const gen = await generateExamples(reqs, sourceLang, targetLang);
  for (const [key, ex] of gen.entries()) {
    out.set(key, { sentence: ex.sentence, translation: ex.translation, source: "llm" });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// SenseGroup → WordMeaning 변환 (v2 응답 형식 호환)
// ────────────────────────────────────────────────────────────────────────
function toWordMeanings(groups: SenseGroup[]): WordMeaning[] {
  return groups.map((g) => {
    const firstSense = g.senses[0];
    const pos = firstSense?.sense.pos ?? "";
    return {
      definition: g.display_en,     // 사용자 카드에 표시될 번역
      partOfSpeech: pos,
      relevanceScore: g.max_score,   // frequency_score (0-100)
    } as WordMeaning;
  });
}

function toWordExamples(groups: SenseGroup[], examples: Map<string, ExampleResult>): WordExample[] {
  const out: WordExample[] = [];
  groups.forEach((g, idx) => {
    const ex = examples.get(g.en_key);
    if (ex) {
      out.push({
        sentence: ex.sentence,
        translation: ex.translation,
        meaningIndex: idx,
        source: ex.source,
      });
    }
  });
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// 캐시 — word_entries + word_translations 활용
// ────────────────────────────────────────────────────────────────────────
interface CachedHit {
  result: WordLookupResult;
  entryId: string;
  /** True when examples_translated array is empty OR none of its entries are LLM-sourced.
   * Used to decide whether an enrich request must regenerate examples. */
  exampleslessEnrichNeeded: boolean;
}

async function getCached(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<CachedHit | null> {
  // Source filter intentionally absent — both 'dictionary' and 'llm' (신조어 fallback)
  // entries are valid cache hits. The source field is tracked for analytics, not gating.
  const { data: entry } = await supabase
    .from("word_entries")
    .select("id, headword, reading, ipa, meanings, source")
    .eq("word", word)
    .eq("word_lang", sourceLang)
    .maybeSingle();
  if (!entry) return null;

  const { data: trans } = await supabase
    .from("word_translations")
    .select("meanings_translated, examples_translated")
    .eq("word_entry_id", entry.id)
    .eq("target_lang", targetLang)
    .maybeSingle();
  if (!trans) return null;

  const examples = (trans.examples_translated ?? []) as WordExample[];
  // "enrich needed" = no examples at all, OR all examples are dict-sourced (no translation).
  // enrich's job is to produce LLM examples with full translation for the learning card.
  const hasLlmExample = examples.some((ex) => ex.source === "llm" && ex.translation);
  return {
    result: {
      headword: entry.headword ?? word,
      reading: entry.reading ?? undefined,
      ipa: entry.ipa ?? undefined,
      meanings: trans.meanings_translated ?? [],
      examples,
    },
    entryId: entry.id as string,
    exampleslessEnrichNeeded: !hasLlmExample,
  };
}

async function saveCacheCanonical(
  word: string,
  sourceLang: string,
  entries: DictEntry[],
  judged: JudgedSense[],
): Promise<string> {
  const reading = entries[0]?.reading;
  const headword = entries[0]?.headword ?? word;
  // canonical meanings JSONB — sense 단위 + score 보존
  const meanings = judged.map((j) => ({
    sense_id: j.sense.sense_id,
    source_def: j.sense.source_def,
    en_translation: j.en_override ?? j.sense.en_translation,
    pos: j.sense.pos,
    grade: j.sense.grade,
    frequency_score: j.score,
    reasoning: j.reasoning,
    source: entries[0]?.source ?? "dictionary",
  }));

  const { data, error } = await supabase
    .from("word_entries")
    .upsert(
      {
        word,
        word_lang: sourceLang,
        headword,
        reading,
        meanings,
        source: "dictionary",
        model: "gpt-4.1-mini",
        prompt_version: PROMPT_VERSION,
      },
      { onConflict: "word,word_lang" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`save canonical: ${error.message}`);
  return data.id;
}

/**
 * 신조어/사전 miss용 canonical 저장. source='llm' 마킹.
 * NeologismSense를 사전 entry 없이 직접 canonical meanings JSONB로 변환.
 */
async function saveCacheCanonicalLlm(
  word: string,
  sourceLang: string,
  senses: NeologismSense[],
): Promise<string> {
  const meanings = senses.map((s, idx) => ({
    sense_id: `llm:${idx}`,
    source_def: s.en_def,
    en_translation: s.en_def,
    pos: s.pos,
    grade: null,
    frequency_score: s.frequency_score,
    reasoning: "llm fallback",
    source: "llm",
  }));
  const { data, error } = await supabase
    .from("word_entries")
    .upsert(
      {
        word,
        word_lang: sourceLang,
        headword: word,
        meanings,
        source: "llm",
        model: "gpt-4.1-mini",
        prompt_version: PROMPT_VERSION,
      },
      { onConflict: "word,word_lang" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`save canonical (llm): ${error.message}`);
  return data.id;
}

async function saveCacheTranslation(
  entryId: string,
  targetLang: string,
  meanings: WordMeaning[],
  examples: WordExample[],
): Promise<void> {
  await supabase.from("word_translations").upsert(
    {
      word_entry_id: entryId,
      target_lang: targetLang,
      meanings_translated: meanings,
      examples_translated: examples,
      model: "gpt-4.1-mini",
      prompt_version: PROMPT_VERSION,
    },
    { onConflict: "word_entry_id,target_lang" },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 사전 miss — 2-stage LLM fallback
// ────────────────────────────────────────────────────────────────────────
//
// Stage 1: validateNeologism — verdict + (if valid_word) senses with EN/TARGET glosses
// Stage 2: example-generator — per sense, identical to dict path
//
// 결과는 word_entries.source='llm'로 저장하여 dict-sourced 엔트리와 구분됨.
// process-report가 신고를 받으면 source='llm' 엔트리는 더 자유롭게 regen 가능.
async function handleDictMiss(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ result: WordLookupResult; cached: boolean }> {
  let verdict;
  try {
    verdict = await validateNeologism(word, sourceLang, targetLang);
  } catch (err) {
    console.warn(`[v4] neologism validate failed: ${(err as Error).message}`);
    return {
      result: { headword: word, meanings: [], note: "non_word" },
      cached: false,
    };
  }

  if (verdict.verdict === "non_word") {
    return { result: { headword: word, meanings: [], note: "non_word" }, cached: false };
  }
  if (verdict.verdict === "wrong_language") {
    return { result: { headword: word, meanings: [], note: "wrong_language" }, cached: false };
  }
  if (verdict.verdict === "typo") {
    // Surface correction so the client can re-query the corrected form.
    return {
      result: {
        headword: word,
        meanings: [],
        note: "non_word",
        correctedHeadword: verdict.correction || undefined,
      },
      cached: false,
    };
  }

  // verdict === "valid_word" — synthesize groups and continue.
  if (verdict.senses.length === 0) {
    // valid_word with no senses (rare model failure) — treat as non_word.
    return { result: { headword: word, meanings: [], note: "non_word" }, cached: false };
  }

  // Build synthetic SenseGroups (one group per sense — neologisms aren't typically
  // multi-sense in our 1-4 cap, and we want to surface all listed meanings).
  const groups: SenseGroup[] = verdict.senses.map((s, idx) => ({
    en_key: `llm:${idx}`,
    display_en: s.target_gloss,
    max_score: s.frequency_score,
    senses: [
      {
        sense: {
          sense_id: `llm:${idx}`,
          source_def: s.en_def,
          en_translation: s.en_def,
          pos: s.pos,
          grade: undefined,
        },
        score: s.frequency_score,
        reasoning: "llm fallback",
        display_translation: s.target_gloss,
      },
    ],
  }));

  // Stage 2: example generation per sense (identical to dict path).
  const exampleMap = await fetchExamples(word, sourceLang, targetLang, groups, []);

  const meanings = toWordMeanings(groups);
  const examples = toWordExamples(groups, exampleMap);
  const result: WordLookupResult = {
    headword: word,
    meanings,
    examples,
    confidence: groups[0]?.max_score ?? 0,
  };

  // Cache as source='llm'
  try {
    const entryId = await saveCacheCanonicalLlm(word, sourceLang, verdict.senses);
    await saveCacheTranslation(entryId, targetLang, meanings, examples);
  } catch (err) {
    console.warn(`[v4] llm cache save failed: ${(err as Error).message}`);
  }

  return { result, cached: false };
}

// ────────────────────────────────────────────────────────────────────────
// enrichExistingCache — quick으로 저장된 entry에 enrich 호출이 들어왔을 때
// meanings는 유지하고 examples만 LLM으로 채워 update.
// ────────────────────────────────────────────────────────────────────────
async function enrichExistingCache(
  cached: CachedHit,
  sourceLang: string,
  targetLang: string,
): Promise<{ result: WordLookupResult; cached: boolean }> {
  const meanings = cached.result.meanings;
  if (meanings.length === 0) {
    return { result: cached.result, cached: true };
  }

  // Check word_entries.examples for canonical reuse (cross-target hit).
  const { data: entry } = await supabase
    .from("word_entries")
    .select("examples")
    .eq("id", cached.entryId)
    .maybeSingle();
  const canonical = (entry?.examples ?? []) as Array<{ sentence: string; meaningIndex: number }>;

  let examples: WordExample[] = [];

  if (canonical.length > 0 && canonical.length >= meanings.length) {
    // Canonical reuse — only translate to target_lang (1 LLM call).
    const reqs: CanonicalTranslateRequest[] = meanings.map((m, idx) => ({
      key: `m:${idx}`,
      sentence: canonical[idx]?.sentence ?? "",
      targetGloss: m.definition,
    })).filter((r) => r.sentence);
    const tr = await translateCanonicalSentences(reqs, sourceLang, targetLang);
    examples = meanings.map((m, idx) => {
      const sentence = canonical[idx]?.sentence ?? "";
      const translation = tr.get(`m:${idx}`) ?? "";
      if (!sentence) return { sentence: "", translation: "", meaningIndex: idx, source: "llm" as const };
      return { sentence, translation, meaningIndex: idx, source: "llm" as const };
    }).filter((e) => e.sentence);
  } else {
    // No canonical — generate sentence + first-target translation in one shot.
    const reqs: ExampleRequest[] = meanings.map((m, idx) => ({
      key: `m:${idx}`,
      word: cached.result.headword ?? "",
      surfaceForms: [],
      senseDef: m.definition,
      targetGloss: m.definition,
    }));
    const gen = await generateExamples(reqs, sourceLang, targetLang);
    const canonicalRows: Array<{ sentence: string; meaningIndex: number }> = [];
    examples = meanings.map((_, idx) => {
      const ex = gen.get(`m:${idx}`);
      if (!ex) return { sentence: "", translation: "", meaningIndex: idx, source: "llm" as const };
      canonicalRows.push({ sentence: ex.sentence, meaningIndex: idx });
      return {
        sentence: ex.sentence,
        translation: ex.translation,
        meaningIndex: idx,
        source: "llm" as const,
      };
    }).filter((e) => e.sentence);
    if (canonicalRows.length > 0) {
      await supabase.from("word_entries").update({ examples: canonicalRows }).eq("id", cached.entryId);
    }
  }

  // Persist target-specific translation row.
  await supabase.from("word_translations").update({
    examples_translated: examples,
  }).eq("word_entry_id", cached.entryId).eq("target_lang", targetLang);

  return {
    result: { ...cached.result, examples },
    cached: false,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────────
async function handle(req: WordLookupRequest): Promise<{ result: WordLookupResult; cached: boolean }> {
  const { word, sourceLang, targetLang } = req;
  if (!word || !sourceLang || !targetLang) {
    throw new Error("word, sourceLang, targetLang are required");
  }
  // Default 'quick' (faster). Clients explicitly request 'enrich' on save.
  const mode: "quick" | "enrich" = req.mode === "enrich" ? "enrich" : "quick";

  // 1. 캐시 — quick은 examples 비어있어도 hit, enrich는 LLM 예문 확보돼야 hit
  const cached = await getCached(word, sourceLang, targetLang);
  if (cached) {
    if (mode === "quick") return { result: cached.result, cached: true };
    if (mode === "enrich" && !cached.exampleslessEnrichNeeded) {
      return { result: cached.result, cached: true };
    }
    // enrich + examples 부족 → cache의 meanings은 유지하고 examples만 LLM 보강
    return await enrichExistingCache(cached, sourceLang, targetLang);
  }

  // 2. 사전 호출
  const entries = await callDictionary(word, sourceLang, targetLang);
  if (entries.length === 0) {
    // 사전 miss — 2-stage LLM fallback
    return await handleDictMiss(word, sourceLang, targetLang);
  }

  // 3. AI judge — unified single LLM call (Phase 1 prototype 패턴): SCORE + OVERRIDE + TRANSLATE.
  //    Saves 1-2 round trips vs judgeAndTranslate. Used for both quick and enrich modes;
  //    the per-mode difference is only the example generation step below.
  const judged = await judgeUnified(word, entries, sourceLang, targetLang);
  if (judged.length === 0) {
    return {
      result: {
        headword: word,
        meanings: [],
        note: "non_word",
      },
      cached: false,
    };
  }

  // 4. 그룹화 + 정렬 (entry × 번역 동일성, 학습자 부담 ↓)
  const groups = groupByEntryThenTranslation(judged);

  // 5. canonical entry 먼저 upsert — fetchExamplesViaCanonical이 examples 업데이트할
  //    대상이 존재해야 하므로 순서 중요. quick mode도 동일 (examples는 빈 채로 둠).
  const meanings = toWordMeanings(groups);
  try {
    const entryId = await saveCacheCanonical(word, sourceLang, entries, judged);

    // 6. 예문 — quick은 생략 (검색 화면이 표시 안 함). enrich은 canonical 재사용 path.
    const headwordForGen = entries[0]?.headword ?? word;
    const readingVariants: string[] = [];
    if (entries[0]?.reading) readingVariants.push(entries[0].reading);
    const exampleMap = mode === "quick"
      ? new Map<string, ExampleResult>()
      : await fetchExamplesViaCanonical(word, headwordForGen, sourceLang, targetLang, groups, readingVariants);
    const examples = toWordExamples(groups, exampleMap);

    // 7. translation 저장 (best effort)
    await saveCacheTranslation(entryId, targetLang, meanings, examples);

    const result: WordLookupResult = {
      headword: entries[0]?.headword ?? word,
      reading: entries[0]?.reading,
      meanings,
      examples,
      confidence: groups[0]?.max_score ?? 0,
    };
    return { result, cached: false };
  } catch (err) {
    console.warn(`[v4] save/example pipeline failed: ${(err as Error).message}`);
    // Degrade gracefully — return meanings only, no examples.
    const result: WordLookupResult = {
      headword: entries[0]?.headword ?? word,
      reading: entries[0]?.reading,
      meanings,
      examples: [],
      confidence: groups[0]?.max_score ?? 0,
    };
    return { result, cached: false };
  }
}

// ────────────────────────────────────────────────────────────────────────
// HTTP serve
// ────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Auth ──
  // config.toml sets verify_jwt = false for this function (ES256 cutover),
  // so we MUST verify the JWT in-function. No anon path: every caller is a
  // user. (Word lookups don't have warm-only pings on v4.)
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId: string = userData.user.id;

  // ── Validate ──
  let request: WordLookupRequest;
  try {
    const body = await req.json();
    request = validateLookupInput(body);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Bad request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Rate limit ──
  try {
    await enforceAllLimits(supabase, userId, "word-lookup");
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof BudgetExhaustedError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  try {
    const out = await handle(request);
    fireAndForget(logApiCall(supabase, {
      userId,
      endpoint: ENDPOINT,
      cacheHit: out.cached,
      costUsd: 0,
      durationMs: Date.now() - startedAt,
      status: "ok",
    }));
    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[v4] error: ${(err as Error).message}`);
    fireAndForget(logApiCall(supabase, {
      userId,
      endpoint: ENDPOINT,
      cacheHit: false,
      costUsd: 0,
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: (err as Error).message?.slice(0, 120),
    }));
    return new Response(
      // Do not echo internal error messages to the client (info leak).
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
