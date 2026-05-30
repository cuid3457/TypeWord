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
import { wiktionarySearch } from "../_shared/dict-clients/wiktionary.ts";
import { judgeUnified, type JudgedSense } from "../_shared/dict-clients/ai-judge.ts";
import { posCanonical } from "../_shared/dict-clients/pos-normalize.ts";
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
import { realignExamplesByTranslation } from "../_shared/realign-examples.ts";
import { verifySenseAssignments } from "../_shared/dict-clients/sense-verifier.ts";
// Reverse-lookup imports (migrated from v2 — native-lang word → study-lang
// candidates). Cache table reverse_lookups + helper modules already lived
// in _shared, so v4 can host the path without touching v2 internals.
import {
  getReverseLookup,
  saveReverseLookup,
  PROMPT_VERSION_V2 as REVERSE_PROMPT_VERSION,
} from "../_shared/cache-v2.ts";
import {
  redirectDisputedInput,
  getTranslateOverride,
} from "../_shared/disputes.ts";
import {
  buildReverseLookupSystemPrompt,
  buildReverseLookupUserPrompt,
} from "../_shared/prompts-v2.ts";
import { callOpenAiForWordLookup, OpenAiError } from "../_shared/openai.ts";

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
  // Strip ASCII / Unicode control chars and zero-width joiners that can
  // break prompt formatting, pollute logs, or spoof what the user sees.
  // C0 (U+0000-U+001F) + DEL (U+007F) + C1 (U+0080-U+009F) +
  // zero-width/bidi (U+200B-U+200F, U+202A-U+202E) +
  // line/para separators (U+2028, U+2029) + word joiner (U+2060) + BOM (U+FEFF).
  const rawWord = typeof b.word === "string" ? b.word : "";
  const word = rawWord
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2028\u2029\u2060\uFEFF]/g, "")
    .trim();
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
  const readingHint = typeof b.readingHint === "string" && b.readingHint.trim().length > 0
    ? b.readingHint.trim().slice(0, 200)
    : undefined;
  const proficiencyHint = typeof b.proficiencyHint === "string" && b.proficiencyHint.trim().length > 0
    ? b.proficiencyHint.trim().slice(0, 300)
    : undefined;
  return { word, sourceLang, targetLang, mode, readingHint, proficiencyHint } as WordLookupRequest;
}

// Run a promise after the response has been sent. Uses Deno's EdgeRuntime.waitUntil
// so the isolate stays alive until the task completes (without it, Supabase may
// tear down the isolate as soon as Response is dispatched, dropping the work).
// Falls back to a bare .catch() in environments without the waitUntil API.
function fireAndForget<T>(p: Promise<T>): void {
  const guarded = p.catch((err) => {
    console.warn("[v4 background]", (err as Error)?.message ?? err);
  });
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(guarded);
}

// ────────────────────────────────────────────────────────────────────────
// 사전 호출 — source language별 dispatch
// ────────────────────────────────────────────────────────────────────────
async function callDictionary(word: string, sourceLang: string, targetLang: string): Promise<DictEntry[]> {
  if (sourceLang === "ko") {
    // ALWAYS query krdict with trans_lang=en. The krdict XML response only
    // ships one translation per sense in the requested language, and the
    // client stores it in DictSense.en_translation. If we asked for fr, the
    // French gloss would land in en_translation (wrong field), polluting
    // every downstream English-vs-other check. By fixing trans_lang=en we
    // keep en_translation truthful; the AI judge handles target_lang
    // translation via target_translation (judgeUnified field).
    return await krdictSearch(word, KRDICT_TRANS_LANG.en);
  }
  if (sourceLang === "ja") {
    return await jmdictSearch(supabase, word);
  }
  if (sourceLang === "zh-CN" || sourceLang === "zh") {
    return await cedictSearch(supabase, word);
  }
  if (["en", "es", "fr", "de", "it"].includes(sourceLang)) {
    const lang = sourceLang as "en" | "es" | "fr" | "de" | "it";
    // Languages imported into wiktionary_entries are served from DB (fast,
    // no external API). Others still hit freedictionaryapi.com live until
    // their data is imported. Fall back to the live API if the DB has no row
    // (e.g. a word missing from the imported snapshot).
    const DB_BACKED = new Set(["en", "es", "fr", "de", "it"]); // all wiktionary langs imported
    if (DB_BACKED.has(lang)) {
      const fromDb = await wiktionarySearch(supabase, word, lang);
      if (fromDb.length > 0) return fromDb;
      // DB miss → fall through to live API so coverage isn't lost.
    }
    return await freedictSearch(word, lang);
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
function groupByEntryThenTranslation(judged: JudgedSense[], targetLang?: string): SenseGroup[] {
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
  //   display_translation(LLM target_lang short translation) > en_override
  //   (transliteration fix) > en_translation (dict's English gloss).
  //   source_def는 SOURCE LANG 정의라서 폴백으로 쓰면 안 됨 — 영어 글로스가
  //   없으면 의미 자체를 drop (cards with Korean/Chinese definitions in a
  //   French slot were the most common audit failure).
  //   en_translation fallback only when target IS English. For non-EN target,
  //   showing the dict's raw English gloss in a French/Italian/etc card is
  //   worse than dropping the sense — drop it.
  const isEnTarget = targetLang === "en" || !targetLang;
  const groups = new Map<string, SenseGroup>();
  for (const j of entryReps) {
    const display =
      j.display_translation ??
      j.en_override ??
      (isEnTarget ? j.sense.en_translation : undefined) ??
      "";
    const trimmed = display.trim();
    if (!trimmed) continue; // no learner-facing label → omit this sense
    const key = trimmed.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { en_key: key, display_en: trimmed, max_score: j.score, senses: [j] });
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
  // Stable per-sense identifier (source-lang dictionary sense_id of the
  // group's representative). Lets cross-target reuse match canonical to
  // current groups by content, not by array position — judge scores can
  // reorder groups per target_lang, so positional reuse causes polysemy
  // mismatch where displayed example demonstrates sense A but the stored
  // meaningIndex points to sense B.
  senseId?: string;
}

async function fetchExamplesViaCanonical(
  word: string,
  headword: string,
  sourceLang: string,
  targetLang: string,
  groups: SenseGroup[],
  readingVariants: string[] = [],
  opts: { proficiencyHint?: string; ignoreCanonical?: boolean } = {},
): Promise<Map<string, ExampleResult>> {
  const out = new Map<string, ExampleResult>();
  if (groups.length === 0) return out;

  // 1. canonical 조회. ignoreCanonical (curation forceFresh) 일 때는 entry id는
  //    여전히 필요하니까 조회하되, examples는 빈 배열로 취급해 miss path만 탄다.
  const { data: entry } = await supabase
    .from("word_entries")
    .select("id, examples")
    .eq("word", word)
    .eq("word_lang", sourceLang)
    .maybeSingle();
  const canonical = opts.ignoreCanonical
    ? ([] as CanonicalExampleRow[])
    : ((entry?.examples ?? []) as CanonicalExampleRow[]);

  // Match canonical to current groups by senseId so cross-target reuse
  // doesn't pair sentence-of-sense-A with meaningIndex-of-sense-B.
  // Older canonical rows (no senseId) fall back to position match.
  const senseIdToCanonical = new Map<string, CanonicalExampleRow>();
  for (const c of canonical) {
    if (c.senseId) senseIdToCanonical.set(c.senseId, c);
  }
  const lookupCanonical = (g: SenseGroup, idx: number): CanonicalExampleRow | undefined => {
    const sid = g.senses[0]?.sense.sense_id;
    if (sid && senseIdToCanonical.has(sid)) return senseIdToCanonical.get(sid);
    // Legacy fallback only when ALL canonical rows lack senseId — otherwise
    // a partial-coverage reuse would silently misalign the rest.
    if (senseIdToCanonical.size === 0) return canonical[idx];
    return undefined;
  };

  const matched = groups.map((g, idx) => ({ g, idx, row: lookupCanonical(g, idx) }));
  const hits = matched.filter((m) => m.row?.sentence);
  const misses = matched.filter((m) => !m.row?.sentence);

  // Hit path: batch translate the matched canonical sentences for target_lang.
  if (hits.length > 0) {
    const reqs: CanonicalTranslateRequest[] = hits.map(({ g, row }) => ({
      key: g.en_key,
      sentence: row!.sentence,
      targetGloss: g.display_en,
    }));
    const tr = await translateCanonicalSentences(reqs, sourceLang, targetLang);
    for (const { g, row } of hits) {
      const sentence = row!.sentence;
      const translation = tr.get(g.en_key) ?? "";
      out.set(g.en_key, { sentence, translation, source: "llm" });
    }
  }

  // Miss path: generate sentence + translation for groups without canonical
  // coverage. Append the new canonical rows to the existing list so future
  // lookups see them. With ignoreCanonical (curation forceFresh) every group
  // is a miss and the new rows REPLACE the previous canonical list.
  if (misses.length > 0) {
    const reqs: ExampleRequest[] = misses.map(({ g }) => ({
      key: g.en_key,
      word: headword,
      surfaceForms: readingVariants,
      senseDef:
        g.senses[0]?.en_override ??
        g.senses[0]?.sense.en_translation ??
        g.senses[0]?.sense.source_def ??
        g.display_en,
      targetGloss: g.display_en,
      proficiencyHint: opts.proficiencyHint,
    }));
    const gen = await generateExamples(reqs, sourceLang, targetLang);
    const newRows: CanonicalExampleRow[] = [];
    for (const { g, idx } of misses) {
      const ex = gen.get(g.en_key);
      if (!ex) continue;
      out.set(g.en_key, { sentence: ex.sentence, translation: ex.translation, source: "llm" });
      newRows.push({
        sentence: ex.sentence,
        meaningIndex: idx,
        senseId: g.senses[0]?.sense.sense_id,
      });
    }
    if (newRows.length > 0 && entry?.id) {
      // ignoreCanonical: drop the prior list so stale rows from an earlier
      // curation pass don't survive forever. Normal call (no force) appends.
      const merged = opts.ignoreCanonical ? newRows : [...canonical, ...newRows];
      await supabase.from("word_entries").update({ examples: merged }).eq("id", entry.id);
    }
  }

  return out;
}

async function fetchExamples(
  headword: string,
  sourceLang: string,
  targetLang: string,
  groups: SenseGroup[],
  readingVariants: string[] = [],
  proficiencyHint?: string,
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
      proficiencyHint,
    };
  });

  const gen = await generateExamples(reqs, sourceLang, targetLang);
  for (const [key, ex] of gen.entries()) {
    out.set(key, { sentence: ex.sentence, translation: ex.translation, source: "llm" });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// LLM-judge re-assignment (final alignment guard)
// ────────────────────────────────────────────────────────────────────────
//
// `realignExamplesByTranslation` scores by example.translation tokens. That
// works when only the sentence drifts but the translation is correct — the
// translation tokens vote for the right slot. It FAILS for the rarer but
// real case where both sentence and translation drift to the same wrong
// sense (e.g. v4 신조어 fallback "야속하다": sense-0 anchor produced a
// sentence + translation that both describe sense 1). The LLM judge reads
// the SOURCE_LANG sentence directly and assigns it to a sense, ignoring
// translation entirely — defeats sentence/translation joint drift.
async function realignExamplesByLlmJudge(
  word: string,
  sourceLang: string,
  meanings: WordMeaning[],
  examples: WordExample[],
): Promise<WordExample[]> {
  if (meanings.length < 2 || examples.length === 0) return examples;
  const senses = meanings.map((m) => ({
    enDef: m.definition,
    targetGloss: m.definition,
  }));
  const sentences = examples.map((e) => e.sentence);
  const assignments = await verifySenseAssignments({
    word,
    sourceLang,
    senses,
    sentences,
  });
  if (!assignments) return examples;
  // Dedup: when two examples land on the same sense, keep the first one
  // (they were already token-realigned upstream so this is rare) and drop
  // duplicates — better than two examples sharing a slot.
  const taken = new Set<number>();
  const out: WordExample[] = [];
  for (let i = 0; i < examples.length; i++) {
    const idx = assignments[i];
    if (taken.has(idx)) continue;
    taken.add(idx);
    out.push({ ...examples[i], meaningIndex: idx });
  }
  out.sort((a, b) => (a.meaningIndex ?? 0) - (b.meaningIndex ?? 0));
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// SenseGroup → WordMeaning 변환 (v2 응답 형식 호환)
// ────────────────────────────────────────────────────────────────────────
function toWordMeanings(
  groups: SenseGroup[],
  source: string | undefined,
): WordMeaning[] {
  return groups.map((g) => {
    const firstSense = g.senses[0]?.sense;
    // Store POS in CANONICAL ENGLISH ("noun"/"verb"/...). The client localizes
    // to the user's UI language at render time so a Korean user sees "명사"
    // regardless of whether the lookup target is ko or en.
    // Source routing: cedict + neologism path return English POS strings the
    // LLM produced (judge inferred them); both use the "llm" POS_MAP rather
    // than the dict-specific maps. dict-supplied POS (krdict/jmdict/wiktionary)
    // still routes to its native map.
    const posSource = source === "cedict" || source === "llm" || !source
      ? "llm"
      : source;
    let pos = posCanonical(firstSense?.pos, posSource);
    // Krdict ships some senses with 조사 / 의존명사 / 어미 / 보조 동사 / 관형사
    // which map to category 9 (expression) or 11 (symbol) — those labels
    // confuse learners. When the LLM inferred a more concrete POS for this
    // sense (e.g. "pronoun" or "noun"), prefer it. The LLM has the full
    // sense context and tends to produce learner-appropriate labels.
    if ((pos === "expression" || pos === "symbol" || !pos) && firstSense?.llm_pos) {
      const fallback = posCanonical(firstSense.llm_pos, "llm");
      if (fallback && fallback !== "expression" && fallback !== "symbol") pos = fallback;
    }
    return {
      definition: g.display_en,
      partOfSpeech: pos,
      relevanceScore: g.max_score,
      gender: firstSense?.gender,         // m/f/n/mf for Latin nouns
      register: firstSense?.register,     // colloquial/slang/literary/honorific...
      senseId: firstSense?.sense_id,      // for cross-target canonical reuse
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
  // Single round-trip: fetch the word_entries row AND its word_translations row
  // for this target_lang via PostgREST's embedded select. (Previous version
  // did two sequential queries — ~100ms wasted on every lookup.) Source filter
  // intentionally absent: both 'dictionary' and 'llm' (신조어 fallback) cache
  // hits are valid.
  const { data: entry } = await supabase
    .from("word_entries")
    .select(
      "id, headword, reading, ipa, meanings, source, " +
      "word_translations!inner(meanings_translated, examples_translated, target_lang)",
    )
    .eq("word", word)
    .eq("word_lang", sourceLang)
    .eq("word_translations.target_lang", targetLang)
    .maybeSingle();
  if (!entry) return null;
  const trans = (entry.word_translations as Array<{
    meanings_translated: WordMeaning[];
    examples_translated: WordExample[];
  }> | undefined)?.[0];
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
// Cheap pre-filter for UNAMBIGUOUS sentence input before paying for a
// neologism LLM call. Only trips on terminal punctuation (. ! ? 。 ！ ？)
// since that's the one signal with near-zero false positives. Token-count
// heuristics catch long idioms ("Tomaten auf den Augen haben" = 5 tokens
// but a fixed idiom), so we let the LLM handle them with the strengthened
// idiom carve-out in the neologism prompt.
function looksLikeSentence(word: string, _sourceLang: string): boolean {
  const trimmed = word.trim();
  if (trimmed.length === 0) return false;
  return /[.!?。！？]$/.test(trimmed);
}

async function handleDictMiss(
  word: string,
  sourceLang: string,
  targetLang: string,
  mode: "quick" | "enrich",
  proficiencyHint?: string,
): Promise<{ result: WordLookupResult; cached: boolean }> {
  // Short-circuit unambiguous sentences before spending an LLM call.
  if (looksLikeSentence(word, sourceLang)) {
    return { result: { headword: word, meanings: [], note: "sentence" }, cached: false };
  }

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

  if (verdict.verdict === "sentence") {
    return { result: { headword: word, meanings: [], note: "sentence" }, cached: false };
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
  // target_gloss occasionally leaks source-script (e.g. "윤석열" returned for
  // an English target on a Korean proper noun); fall back to en_def so the
  // card shows real English instead of the unrenderable source string.
  const safeGloss = (gloss: string, enDef: string): string => {
    const g = (gloss || "").trim();
    const e = (enDef || "").trim();
    if (!g) return e;
    if (targetLang === sourceLang) return g;
    const isLatin = ["en", "es", "fr", "de", "it"].includes(targetLang);
    const cjkU = /[一-鿿]/;
    const hangul = /[가-힣]/;
    const kana = /[぀-ゟ゠-ヿ]/;
    if (isLatin && !/[a-zA-Z]/.test(g)) return e || g;
    if (targetLang === "ko" && !hangul.test(g)) return e || g;
    if (targetLang === "ja" && !kana.test(g) && !cjkU.test(g)) return e || g;
    if (targetLang === "zh-CN" && !cjkU.test(g)) return e || g;
    if (g.trim() === word.trim()) return e || g;
    return g;
  };
  const groups: SenseGroup[] = verdict.senses.map((s, idx) => ({
    en_key: `llm:${idx}`,
    display_en: safeGloss(s.target_gloss, s.en_def),
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

  // Stage 2: example generation per sense (identical to dict path) — but
  // ONLY in enrich mode. Quick mode (search-as-you-type / preview) needs a
  // fast response and the UI doesn't display examples there; examples are
  // generated on-demand when the user saves the word to a wordlist (enrich
  // call hits enrichExistingCache). This matches the dict-path behaviour
  // documented in [[project_v4_quick_enrich_canonical]] and keeps quick
  // mode at the 2.5-3s target instead of stacking N parallel LLM example
  // calls + an LLM judge call on top of validateNeologism.
  // dict-miss path: pass "llm" so POS routes through the LLM POS map and
  // the neologism-supplied English POS strings (noun/verb/...) render.
  const meanings = toWordMeanings(groups, "llm");
  let examples: WordExample[] = [];
  if (mode === "enrich") {
    const exampleMap = await fetchExamples(word, sourceLang, targetLang, groups, [], proficiencyHint);
    const rawExamples = toWordExamples(groups, exampleMap);
    // LLM judge stays only in the dict-miss enrich path. Dict-miss words
    // have no authoritative sense split, so the judge catches the joint
    // sentence+translation drift case (e.g. 야속하다).
    const tokenRealigned = realignExamplesByTranslation(meanings, rawExamples, targetLang);
    examples = await realignExamplesByLlmJudge(word, sourceLang, meanings, tokenRealigned);
  }
  const result: WordLookupResult = {
    headword: word,
    meanings,
    examples,
    confidence: groups[0]?.max_score ?? 0,
  };

  // Cache as source='llm' in the background — doesn't block the response.
  fireAndForget((async () => {
    const entryId = await saveCacheCanonicalLlm(word, sourceLang, verdict.senses);
    await saveCacheTranslation(entryId, targetLang, meanings, examples);
  })());

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
  proficiencyHint?: string,
): Promise<{ result: WordLookupResult; cached: boolean }> {
  const meanings = cached.result.meanings;
  if (meanings.length === 0) {
    return { result: cached.result, cached: true };
  }

  // meanings_translated entries carry their source-lang senseId hint (written
  // by toWordMeanings). Canonical example rows are tagged with the same
  // senseId so cross-target reuse maps sentence → meaning by sense identity,
  // not by array position (which can shift when judge scores reorder groups
  // across target_langs).
  // entry.source is fetched so we can skip the expensive LLM judge for
  // dict-sourced entries (where per-meaning anchor + token realign suffice)
  // and reserve it for source='llm' (neologism) entries where the LLM can
  // drift sentence+translation jointly to the wrong sense.
  const { data: entry } = await supabase
    .from("word_entries")
    .select("examples, source")
    .eq("id", cached.entryId)
    .maybeSingle();
  const canonical = (entry?.examples ?? []) as CanonicalExampleRow[];
  const isLlmSource = entry?.source === "llm";

  const senseIdToCanonical = new Map<string, CanonicalExampleRow>();
  for (const c of canonical) {
    if (c.senseId) senseIdToCanonical.set(c.senseId, c);
  }
  // Legacy fallback only when ALL canonical rows lack senseId — otherwise a
  // partial-coverage reuse would silently misalign the rest.
  const legacyByIndex = senseIdToCanonical.size === 0;

  const matched = meanings.map((m, idx) => {
    const sid = m.senseId;
    let row: CanonicalExampleRow | undefined;
    if (sid && senseIdToCanonical.has(sid)) row = senseIdToCanonical.get(sid);
    else if (legacyByIndex) row = canonical[idx];
    return { m, idx, sid, row };
  });
  const hits = matched.filter((x) => x.row?.sentence);
  const misses = matched.filter((x) => !x.row?.sentence);

  let examples: WordExample[] = [];

  if (hits.length > 0) {
    const reqs: CanonicalTranslateRequest[] = hits.map(({ m, idx, row }) => ({
      key: `m:${idx}`,
      sentence: row!.sentence,
      targetGloss: m.definition,
    }));
    const tr = await translateCanonicalSentences(reqs, sourceLang, targetLang);
    for (const { m, idx, row } of hits) {
      examples.push({
        sentence: row!.sentence,
        translation: tr.get(`m:${idx}`) ?? "",
        meaningIndex: idx,
        source: "llm",
      });
    }
  }

  const newRows: CanonicalExampleRow[] = [];
  if (misses.length > 0) {
    const reqs: ExampleRequest[] = misses.map(({ m, idx }) => ({
      key: `m:${idx}`,
      word: cached.result.headword ?? "",
      surfaceForms: [],
      senseDef: m.definition,
      targetGloss: m.definition,
      proficiencyHint,
    }));
    const gen = await generateExamples(reqs, sourceLang, targetLang);
    for (const { idx, sid } of misses) {
      const ex = gen.get(`m:${idx}`);
      if (!ex) continue;
      examples.push({
        sentence: ex.sentence,
        translation: ex.translation,
        meaningIndex: idx,
        source: "llm",
      });
      newRows.push({ sentence: ex.sentence, meaningIndex: idx, senseId: sid });
    }
  }
  const canonicalMerged = newRows.length > 0 ? [...canonical, ...newRows] : null;

  examples.sort((a, b) => (a.meaningIndex ?? 0) - (b.meaningIndex ?? 0));

  // Token realign always. LLM judge only for source='llm' (neologism) — see
  // handle() dict path comment. Skipping it here is the main reason post-
  // 2026-05-28 enrich latency came back down.
  const tokenRealigned = realignExamplesByTranslation(meanings, examples, targetLang);
  const word = cached.result.headword ?? "";
  const realigned = isLlmSource && word
    ? await realignExamplesByLlmJudge(word, sourceLang, meanings, tokenRealigned)
    : tokenRealigned;

  // Persist canonical + target translation in the background — the response
  // below doesn't depend on these writes. Saves ~200-400ms of DB latency.
  fireAndForget((async () => {
    if (canonicalMerged) {
      await supabase.from("word_entries").update({ examples: canonicalMerged }).eq("id", cached.entryId);
    }
    await supabase.from("word_translations").update({
      examples_translated: realigned,
    }).eq("word_entry_id", cached.entryId).eq("target_lang", targetLang);
  })());

  return {
    result: { ...cached.result, examples: realigned },
    cached: false,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────────
async function handle(
  req: WordLookupRequest,
  opts: { forceFresh?: boolean; forceFreshTranslation?: boolean } = {},
): Promise<{ result: WordLookupResult; cached: boolean }> {
  const { word, sourceLang, targetLang, readingHint, proficiencyHint } = req;
  if (!word || !sourceLang || !targetLang) {
    throw new Error("word, sourceLang, targetLang are required");
  }
  // Default 'quick' (faster). Clients explicitly request 'enrich' on save.
  const mode: "quick" | "enrich" = req.mode === "enrich" ? "enrich" : "quick";
  const forceFresh = opts.forceFresh === true;
  const forceFreshTranslation = opts.forceFreshTranslation === true;

  // 1. 캐시 — quick은 examples 비어있어도 hit, enrich는 LLM 예문 확보돼야 hit.
  //    force* 플래그가 켜진 curation call은 캐시를 통째로 무시하고 fresh path로.
  if (!forceFresh && !forceFreshTranslation) {
    const cached = await getCached(word, sourceLang, targetLang);
    if (cached) {
      if (mode === "quick") return { result: cached.result, cached: true };
      if (mode === "enrich" && !cached.exampleslessEnrichNeeded) {
        return { result: cached.result, cached: true };
      }
      // enrich + examples 부족 → cache의 meanings은 유지하고 examples만 LLM 보강
      return await enrichExistingCache(cached, sourceLang, targetLang, proficiencyHint);
    }
  }

  // 2. 사전 호출
  let entries = await callDictionary(word, sourceLang, targetLang);
  // readingHint: polysemy disambiguation for CJK polyphones (e.g. zh-CN 长
  // cháng vs zhǎng). Dict entries already split by reading, so we just keep
  // matching entries. Substring match is tolerant of "cháng — long" style
  // hints that include extra prose.
  if (readingHint && entries.length > 1) {
    const matched = entries.filter((e) =>
      typeof e.reading === "string" && e.reading.length > 0 &&
      (readingHint.includes(e.reading) || e.reading.includes(readingHint)),
    );
    if (matched.length > 0) entries = matched;
  }
  if (entries.length === 0) {
    // 사전 miss — 2-stage LLM fallback. mode passed so quick can skip
    // example generation (consistent with dict path's quick behaviour).
    return await handleDictMiss(word, sourceLang, targetLang, mode, proficiencyHint);
  }

  // 3. AI judge — unified single LLM call (Phase 1 prototype 패턴): SCORE + OVERRIDE + TRANSLATE.
  //    Saves 1-2 round trips vs judgeAndTranslate. Used for both quick and enrich modes;
  //    the per-mode difference is only the example generation step below.
  const judged = await judgeUnified(word, entries, sourceLang, targetLang);
  if (judged.length === 0) {
    // Dictionary returned senses but every one was below FREQ_THRESHOLD —
    // typically happens for proper nouns / archaic senses / weak entries
    // (e.g. freedict's "colorado" only carries cigar + fish-species senses,
    // both score <30 → all dropped → empty result). Falling through to
    // handleDictMiss gives the LLM a chance to recognise the real-world
    // sense the dict missed (place name, etc.) instead of telling the user
    // it's not a word.
    return await handleDictMiss(word, sourceLang, targetLang, mode, proficiencyHint);
  }

  // 4. 그룹화 + 정렬 (entry × 번역 동일성, 학습자 부담 ↓)
  const groups = groupByEntryThenTranslation(judged, targetLang);

  // 5. Build the response. For quick mode examples are empty (search screen
  //    skips them); enrich computes examples synchronously via canonical reuse.
  const meanings = toWordMeanings(groups, entries[0]?.source);
  let examples: WordExample[] = [];
  if (mode === "enrich") {
    try {
      const headwordForGen = entries[0]?.headword ?? word;
      const readingVariants = entries[0]?.reading ? [entries[0].reading] : [];
      // forceFresh discards existing canonical examples — the curation
      // operator asked for a complete regeneration. forceFreshTranslation
      // keeps canonical so cross-target iterations share the same source
      // sentence, mirroring v2 semantics.
      const exampleMap = await fetchExamplesViaCanonical(
        word, headwordForGen, sourceLang, targetLang, groups, readingVariants,
        { proficiencyHint, ignoreCanonical: forceFresh },
      );
      const rawExamples = toWordExamples(groups, exampleMap);
      // Dict-sourced: senseDef came from an authoritative dictionary entry,
      // so the per-meaning generator rarely picks the wrong sense. Token
      // realign handles the occasional sentence-only drift; the heavier LLM
      // judge is reserved for handleDictMiss where both sentence + translation
      // can drift (e.g. 야속하다).
      examples = realignExamplesByTranslation(meanings, rawExamples, targetLang);
    } catch (err) {
      console.warn(`[v4] enrich example pipeline failed: ${(err as Error).message}`);
    }
  }

  const result: WordLookupResult = {
    headword: entries[0]?.headword ?? word,
    reading: entries[0]?.reading,
    meanings,
    examples,
    confidence: groups[0]?.max_score ?? 0,
  };

  // 6. Persist to cache in the background — the response above doesn't depend
  //    on these writes completing. Frees the user from ~200-400ms of DB latency
  //    on every miss. EdgeRuntime.waitUntil (inside fireAndForget) keeps the
  //    isolate alive until the chain finishes.
  //
  //    Note: fetchExamplesViaCanonical's inline update is skipped on first
  //    lookup because word_entries doesn't have a row yet (id is null). We
  //    persist canonical examples here AFTER saveCacheCanonical creates the
  //    row, so the second target_lang call can reuse them instead of
  //    regenerating — the 40% cross-target savings that the canonical-reuse
  //    design promised.
  const canonicalExampleRows: CanonicalExampleRow[] = examples
    .map((ex) => {
      const idx = ex.meaningIndex ?? 0;
      const senseId = groups[idx]?.senses[0]?.sense.sense_id;
      return senseId ? { sentence: ex.sentence, meaningIndex: idx, senseId } : null;
    })
    .filter((r): r is CanonicalExampleRow => r !== null);
  fireAndForget((async () => {
    const entryId = await saveCacheCanonical(word, sourceLang, entries, judged);
    if (canonicalExampleRows.length > 0) {
      await supabase.from("word_entries").update({ examples: canonicalExampleRows }).eq("id", entryId);
    }
    await saveCacheTranslation(entryId, targetLang, meanings, examples);
  })());

  return { result, cached: false };
}

// ────────────────────────────────────────────────────────────────────────
// HTTP serve
// ────────────────────────────────────────────────────────────────────────
// SHA-256(ip) first 16 hex chars — short, non-reversible IP key for per-IP
// counting. We never persist raw IPs.
async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// IP daily cap: backup against multi-account bot farms on one IP. Set high so
// shared NAT IPs (Korean mobile carriers can host hundreds of legit users)
// aren't impacted, while still bounding the worst case.
const IP_DAILY_LIMIT = 5000;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── IP rate limit (pre-auth — runs before JWT validation) ──
  // Extract client IP from edge headers. x-forwarded-for first hop is the
  // user; Supabase's edge proxy chain may add more. cf-connecting-ip is a
  // common alt. Falls back to a stable "unknown" so a missing header doesn't
  // mean unlimited.
  //
  // Service-role callers (curation scripts, sweep harness) bypass the IP cap
  // — they share the operator's IP and would otherwise exhaust the daily
  // 5000-call budget after a single bulk run. We probe the Authorization
  // header BEFORE the cap so operator tooling stays unblocked. Detection
  // matches the post-auth path: constant-time compare against the env-injected
  // service-role secret, so a forged "Bearer service_role" token still hits
  // the cap.
  const ipRaw = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const earlyAuth = req.headers.get("Authorization") ?? "";
  const earlyJwt = earlyAuth.replace(/^Bearer\s+/i, "");
  const envSecretEarly = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isServiceRoleEarly = (() => {
    if (envSecretEarly.length === 0 || earlyJwt.length !== envSecretEarly.length) return false;
    const ae = new TextEncoder().encode(earlyJwt);
    const be = new TextEncoder().encode(envSecretEarly);
    let diff = 0;
    for (let i = 0; i < ae.byteLength; i++) diff |= ae[i] ^ be[i];
    return diff === 0;
  })();
  // Operator IP allowlist (comma-separated hashes in IP_HASH_ALLOWLIST env)
  // — operator dev/test rigs that legitimately fire thousands of lookups
  // (prompt sweeps, curation harness from a workstation IP). Bypass the cap
  // entirely so prompt iteration isn't blocked by the per-IP guard.
  const ipHashAllowlist = new Set(
    (Deno.env.get("IP_HASH_ALLOWLIST") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!isServiceRoleEarly) {
    try {
      const ipHash = await hashIp(ipRaw);
      if (!ipHashAllowlist.has(ipHash)) {
        const { data: ipCheck } = await supabase.rpc("check_and_inc_ip_limit", {
          p_ip_hash: ipHash,
          p_limit: IP_DAILY_LIMIT,
        });
        if (ipCheck && typeof ipCheck === "object" && (ipCheck as { over?: boolean }).over) {
          return new Response(
            JSON.stringify({ error: "Daily IP request limit reached. Please try again tomorrow." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (err) {
      // Fail-open if IP table query fails — per-user cap still applies downstream.
      console.warn("[v4 ip-limit] check failed:", (err as Error).message);
    }
  }

  // ── Auth ──
  // config.toml sets verify_jwt = false for this function (ES256 cutover),
  // so we MUST verify the JWT in-function. Most callers are authenticated
  // users; pg_cron / idle clients ping with `{warm_only: true}` + anon key
  // to keep the isolate warm (cold start adds 1-2s to the next real call).
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Peek body to detect warm-only ping before forcing user auth.
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = await req.clone().json();
  } catch {
    /* surfaces as parse error below */
  }
  const isWarmOnlyRequest = parsedBody.warm_only === true;

  // Detect anon / service-role tokens (new sb_publishable_ / sb_secret_ keys
  // or legacy JWTs) against env-injected keys in constant time.
  //   • Anon callers can issue warm-only pings without a session.
  //   • Service-role callers are operator tooling (curation scripts) — skip
  //     user auth + rate limits, and unlock force* regen flags. SECURITY:
  //     never trust a base64-decoded JWT `role` claim — only the raw-token
  //     constant-time compare against the env secret proves service-role.
  const envAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const envSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  function timingSafeEq(a: string, b: string): boolean {
    if (a.length !== b.length || a.length === 0) return false;
    const ae = new TextEncoder().encode(a);
    const be = new TextEncoder().encode(b);
    let diff = 0;
    for (let i = 0; i < ae.byteLength; i++) diff |= ae[i] ^ be[i];
    return diff === 0;
  }
  const isAnonRole = envAnon.length > 0 && timingSafeEq(jwt, envAnon);
  const isServiceRole = envSecret.length > 0 && timingSafeEq(jwt, envSecret);

  let userId: string;
  if (isServiceRole) {
    // Operator tooling (scripts/curation/*). Skip user lookup; rate limit
    // bypass happens later via the isServiceRole flag.
    userId = "";
  } else if (isWarmOnlyRequest && isAnonRole) {
    // Warm ping: skip user auth, fall through to the warm handler below.
    userId = "";
  } else {
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = userData.user.id;
  }

  // ── Warm-only handler ──
  // Cron-triggered ping (every 5 min). Returns immediately if the OpenAI
  // prompt cache was hit by a real request within the last 5 min; otherwise
  // fires one tiny OpenAI call to refresh the cache. Either way, the isolate
  // itself stays warm because just reaching this code path keeps Deno alive.
  if (isWarmOnlyRequest) {
    try {
      const { data } = await supabase
        .from("warm_state")
        .select("last_real_call_at")
        .eq("id", 1)
        .maybeSingle();
      const lastMs = data?.last_real_call_at ? new Date(data.last_real_call_at).getTime() : 0;
      const ageMs = Date.now() - lastMs;
      const WARM_WINDOW_MS = 5 * 60 * 1000;
      if (ageMs >= 0 && ageMs < WARM_WINDOW_MS) {
        return new Response(JSON.stringify({ status: "warm", ageMs }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Stale — burn one tiny OpenAI call on the dominant lang pair to keep
      // (a) the Deno isolate alive (b) the OpenAI prompt cache hot for that
      // pair, and (c) the supabase.auth + DB connections warm. The pair to
      // warm is hinted by `warm_source`/`warm_target` from cron; defaults
      // to en→ko (the primary user path). Other pairs still pay a small
      // first-call cache-miss penalty — accept this in exchange for ~$1/day
      // instead of $5+/day to rotate every pair.
      const warmSource = (parsedBody.warm_source as string) ?? "en";
      const warmTarget = (parsedBody.warm_target as string) ?? "ko";
      const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
      let openaiOk = false;
      if (openaiKey) {
        try {
          const warmResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              temperature: 0,
              messages: [
                { role: "system", content: "Echo back the JSON {\"ok\":true}." },
                { role: "user", content: `warm ${warmSource}->${warmTarget}` },
              ],
              max_tokens: 8,
              response_format: { type: "json_object" },
            }),
          });
          openaiOk = warmResp.ok;
        } catch {
          openaiOk = false;
        }
      }
      // warm_state update gates BOTH the next isolate ping and OpenAI calls
      // — we only mark warm if the OpenAI side actually succeeded, otherwise
      // the next cron tick retries.
      if (openaiOk) {
        await supabase.from("warm_state").upsert(
          { id: 1, last_real_call_at: new Date().toISOString() },
          { onConflict: "id" },
        );
      }
      return new Response(
        JSON.stringify({ status: openaiOk ? "warmed_full" : "warmed_isolate_only", ageMs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ status: "warm_error", error: err instanceof Error ? err.message : String(err) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // ── Validate ──
  let request: WordLookupRequest;
  try {
    request = validateLookupInput(parsedBody);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Bad request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Rate limit ──
  // Service-role tooling bypasses both per-user and per-IP caps — curation
  // runs need to fire hundreds of lookups in a row without tripping the
  // word-lookup limit a normal user would hit.
  try {
    if (!isServiceRole) await enforceAllLimits(supabase, userId, "word-lookup");
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

  // ── Reverse-lookup branch (migrated from v2 word-lookup-v2 — translate mode) ──
  // Triggered when the user typed `word` in their native (target) language and
  // wants study-language candidates. Reuses v2's reverse_lookups cache + the
  // same prompt + dispute redirects so existing cached rows are still valid.
  if ((parsedBody as { translate?: unknown }).translate === true) {
    const inputLang = request.targetLang;
    const studyLang = request.sourceLang;
    const redirected = redirectDisputedInput(inputLang, request.word);
    const inputWord = redirected;

    // Korea-position canonical overrides (김치→辛奇 zh, 한복→韩服 zh,
    // 독도→Dokdo en, etc.) — skip LLM entirely.
    const manualOverride = getTranslateOverride(inputLang, inputWord, studyLang);
    if (manualOverride) {
      fireAndForget(logApiCall(supabase, {
        userId, endpoint: ENDPOINT, cacheHit: false, costUsd: 0,
        durationMs: Date.now() - startedAt, status: "ok",
      }));
      return new Response(
        JSON.stringify({ result: { candidates: manualOverride } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cache lookup (reverse_lookups keyed by input_word/input_lang/target_lang).
    const cached = await getReverseLookup(supabase, inputWord, inputLang, studyLang);
    if (cached) {
      fireAndForget(logApiCall(supabase, {
        userId, endpoint: ENDPOINT, cacheHit: true, costUsd: 0,
        durationMs: Date.now() - startedAt, status: "ok",
      }));
      const result = cached.note
        ? { candidates: [], note: cached.note }
        : { candidates: cached.candidates };
      return new Response(
        JSON.stringify({ result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cache miss → OpenAI.
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    try {
      const systemPrompt = buildReverseLookupSystemPrompt(inputLang, studyLang);
      const userPrompt = buildReverseLookupUserPrompt(inputWord);
      const { result: raw, usage, costUsd, durationMs } = await callOpenAiForWordLookup({
        systemPrompt,
        userPrompt,
        apiKey: openaiKey,
        model: "gpt-4.1-mini",
      });
      const rawObj = raw as Record<string, unknown>;
      const noteRaw = typeof rawObj.note === "string" ? rawObj.note : null;
      const note = (noteRaw === "sentence" || noteRaw === "non_word" || noteRaw === "wrong_language") ? noteRaw : null;
      let candidates: Array<{ headword: string; hint: string }> = [];
      if (!note && Array.isArray(rawObj.candidates)) {
        candidates = (rawObj.candidates as Array<Record<string, unknown>>)
          .filter((c) => typeof c.headword === "string" && (c.headword as string).trim().length > 0)
          .map((c) => ({ headword: String(c.headword).trim(), hint: String(c.hint ?? "").trim() }))
          .slice(0, 4);
        // Dedup by normalized headword (LLM occasionally repeats for epicene nouns).
        const seen = new Map<string, { headword: string; hint: string }>();
        for (const c of candidates) {
          const key = c.headword.normalize("NFC").trim().toLowerCase();
          if (!seen.has(key)) seen.set(key, c);
        }
        candidates = Array.from(seen.values()).map((c) =>
          seen.size === 1 ? { ...c, hint: "" } : c,
        );
      }

      fireAndForget(saveReverseLookup(supabase, {
        input_word: inputWord,
        input_lang: inputLang,
        target_lang: studyLang,
        candidates,
        note,
        model: "gpt-4.1-mini",
        prompt_version: REVERSE_PROMPT_VERSION,
      }));
      fireAndForget(logApiCall(supabase, {
        userId, endpoint: ENDPOINT, cacheHit: false,
        tokensInput: usage.prompt_tokens, tokensOutput: usage.completion_tokens,
        costUsd, durationMs, status: "ok",
      }));

      const result = note ? { candidates: [], note } : { candidates };
      return new Response(
        JSON.stringify({ result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      const isOpenAi = err instanceof OpenAiError;
      const message = err instanceof Error ? err.message : "Unknown error";
      fireAndForget(logApiCall(supabase, {
        userId, endpoint: ENDPOINT, cacheHit: false, costUsd: 0,
        durationMs: Date.now() - startedAt,
        status: isOpenAi ? "openai_error" : "error", errorMessage: message,
      }));
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Curation-only regen flags. Honored only under service-role auth so users
  // can never force a fresh OpenAI run (would let them drain the budget on
  // any cached word). forceFresh skips both the cached translation AND any
  // pre-existing canonical examples (full regen); forceFreshTranslation skips
  // ONLY the translation cache so multi-target curation iterations preserve
  // the canonical example sentence across target_langs.
  const forceFresh = isServiceRole && (parsedBody as { forceFresh?: unknown }).forceFresh === true;
  const forceFreshTranslation = isServiceRole &&
    (parsedBody as { forceFreshTranslation?: unknown }).forceFreshTranslation === true;

  try {
    const out = await handle(request, { forceFresh, forceFreshTranslation });
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
