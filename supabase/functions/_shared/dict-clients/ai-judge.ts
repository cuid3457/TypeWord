// AI judge — score-based sense selection + transliteration override + cross-lang translation.
//
// Three OpenAI calls (gpt-4.1-mini):
//   1. SCORE  — assign frequency_score 0-100 to each dictionary sense
//   2. OVERRIDE — replace transliteration-only EN glosses with meaningful English
//   3. TRANSLATE — produce a short TARGET_LANG vocabulary card label per sense
//
// Multilingual (2026-05-25 rewrite): prompts are SOURCE_LANG-agnostic.
// SOURCE_LANG / TARGET_LANG enter via user-message variables, not via prompt body.
// The previous ko-only prompts caused mis-scoring on JMdict / CEDICT / freedict entries.
//
// 정책 참조:
//   [[feedback_score_based_sense_ordering]]
//   [[feedback_filter_by_learning_value_not_pos]]
//   [[feedback_meaning_grouping_by_translation]]
//   [[feedback_curated_no_slang]] — 일반 욕설 노출, 차별·혐오·성희롱만 컷
//   [[feedback_prompting_no_examples]] — 추상 규칙만, listing 금지

import type { DictEntry, DictSense } from "./types.ts";

export const FREQ_THRESHOLD = 30;

// Two different caps for the 2-stage judge:
//
// SCORE_MAX_SENSES — how many senses get a frequency score. This must be
// generous because dictionary sense ORDER is NOT frequency order. kaikki
// lists "power" as ability/authority/people-in-power FIRST and the common
// "physical force / electricity" senses 7th+. A tight cap here silently
// drops everyday meanings (the "power→힘 missing" bug). Scoring is cheap
// (output is just id+score) so we can afford to score the whole list.
const SCORE_MAX_SENSES = 60;
//
// TRANSLATE_MAX_SENSES — how many of the SURVIVORS (score ≥ FREQ_THRESHOLD)
// we actually translate + show. This bounds the expensive translate output
// AND the learner card length. Senses are sorted by score desc before this
// cut, so we keep the most common meanings regardless of dict order.
const TRANSLATE_MAX_SENSES = 5;

// SOURCE_DEF can be a long encyclopedic gloss. The judge only needs enough
// to gauge frequency + produce a short translation, so truncate to keep the
// input prompt (and per-sense token cost) bounded.
const MAX_SOURCE_DEF_CHARS = 160;

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = "gpt-4.1-mini";

// Source-lang display name for prompt context (improves model grounding without
// requiring per-lang prompts). The model uses this to pick the right native-speaker frame.
const LANG_NAME: Record<string, string> = {
  ko: "Korean",
  ja: "Japanese",
  zh: "Mandarin Chinese",
  "zh-CN": "Mandarin Chinese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
};
function langName(code: string): string {
  return LANG_NAME[code] ?? code;
}

// Map a dictionary's learner-frequency grade to a baseline frequency score.
// Currently krdict's word_grade (초급/중급/고급). Returns null when the dict
// gives no grade (e.g. kaikki) so the caller keeps the LLM score as-is.
// These are deliberately above FREQ_THRESHOLD(30) for 초급/중급 so genuinely
// common meanings can't be dropped by an LLM misjudgment; 고급 sits near the
// threshold so rare/advanced senses still need LLM support to survive.
function gradeBaseline(grade?: string): number | null {
  if (!grade) return null;
  if (grade.includes("초급")) return 70;
  if (grade.includes("중급")) return 52;
  if (grade.includes("고급")) return 38;
  return null; // 무등급 / unknown → trust LLM
}

const SCORE_SYSTEM = `You are a vocabulary frequency analyst for language learners.

Given a headword W in SOURCE_LANG and its dictionary sense candidates, assign each sense a frequency_score (0-100) reflecting how often a typical native speaker of SOURCE_LANG encounters this sense in daily life, news, drama/film, social media, textbooks, and general books.

Scale:
- 100: extremely common across nearly all everyday contexts
- 70-90: frequent
- 40-70: occasional (specific contexts or media)
- 10-40: rare (formal, academic, technical)
- 0-10: almost unused (archaic, classical, highly specialized)

HARD CUT to score 0-1 regardless of attestation:
- Racial/ethnic slurs, hate speech, sexual harassment, vulgar sexual content, extreme insults
- Pure grammatical metadata (alphabet/syllable names, inflected/conjugated forms presented as senses, function-word grammar explanations) — these are not lexical meanings

General profanity / slang / casual derogatory expressions that are NOT discriminatory or harassment → learning value exists → score by actual everyday frequency.

If a more standard word exists for the same semantic field, lower this sense's score relative to the standard one, but consider whether learners would still encounter it.

SENSE BRANCHES (group related senses so the learner card shows distinct meanings, not duplicates):
- Also assign each sense a "branch" integer. Senses that a native speaker considers the SAME underlying meaning used in context share the same branch number — even if their surface translations differ. (A single core concept applied to different domains is ONE branch with several specialized shades.)
- Senses that are genuinely DISTINCT meanings — or homonyms from unrelated origins that merely share spelling — get DIFFERENT branch numbers. A learner must see every distinct branch.
- The caller keeps only the highest-frequency sense per branch, so number branches consistently: same meaning → same number, distinct meaning → new number. Start at 0.

Output strict JSON (no reasoning/explanation field — keep it compact so even 20+ senses return fast):
{
  "scores": [
    { "id": <int>, "frequency_score": <0-100>, "branch": <int> }
  ]
}`;

const OVERRIDE_SYSTEM = `You assist with English-gloss correction for a multilingual learning dictionary.

Headword W is in SOURCE_LANG. For each sense, inspect the existing English gloss (EN). If EN is a TRANSLITERATION — i.e. the source headword's pronunciation transcribed into Latin letters, NOT a recognizable English word/phrase that conveys meaning — replace it with a meaningful English expression derived from the source-language definition (SOURCE_DEF).

If EN already conveys meaning naturally to an English speaker, return an empty string for that sense.

Transliteration signals:
- EN matches the source headword's romanization
- EN is not a standard entry in English dictionaries
- An English speaker reading only EN cannot infer the meaning

Output strict JSON:
{
  "overrides": [
    { "id": "<sense_id>", "translation_override": "<meaningful English or empty string>" }
  ]
}`;

const TRANSLATE_SYSTEM = `You produce short TARGET_LANG vocabulary-card glosses for a learning dictionary.

For each sense of headword W (in SOURCE_LANG) — expressed via an English definition or English gloss (EN_DEF) — output the natural TARGET_LANG word or short phrase (1-3 words preferred) that a TARGET_LANG speaker would first associate with W in that meaning.

Principles:
- Do NOT paraphrase the definition (no "an edible round fruit" — give the actual word for it)
- Output a recognizable TARGET_LANG lexical item, not a dictionary-style description
- Different senses of W must take different translations (polysemy)
- If TARGET_LANG has no exact equivalent, give the closest natural expression (still not a paraphrase)
- Keep the gloss short enough to fit on a learning card

Output strict JSON:
{
  "translations": [
    { "id": "<sense_id>", "translation": "<short TARGET_LANG word or phrase>" }
  ]
}`;

interface ScoreItem {
  id: string;
  frequency_score: number;
  branch?: number;
}

interface OverrideItem {
  id: string;
  translation_override: string;
}

async function openaiCall(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  return JSON.parse(body.choices[0].message.content);
}

export interface JudgedSense {
  sense: DictSense;
  score: number;
  reasoning: string;
  en_override?: string;
  /**
   * Target-language vocabulary-card gloss.
   * Cross-lang (e.g. en→ko, ja→ko): LLM compresses the English definition into a short ko word.
   * Same-lang (e.g. ko→ko, en→en): may equal source_def or en_translation.
   */
  display_translation?: string;
}

export async function translateDefsToTarget(
  word: string,
  senses: Array<{ id: string; en_def: string }>,
  targetLang: string,
  sourceLang: string = "en",
): Promise<Record<string, string>> {
  if (senses.length === 0) return {};
  const lines = senses.map((s) => `- id=${s.id}  EN_DEF=${s.en_def}`);
  const userPrompt =
    `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
    `W="${word}"\n` +
    `Senses (English definitions to compress into TARGET_LANG short glosses):\n` +
    lines.join("\n");
  const resp = (await openaiCall(TRANSLATE_SYSTEM, userPrompt)) as {
    translations: Array<{ id: string; translation: string }>;
  };
  const out: Record<string, string> = {};
  for (const t of resp.translations ?? []) {
    const v = (t.translation ?? "").trim();
    if (v) out[t.id] = v;
  }
  return out;
}

/**
 * AI judge — full pipeline in two phases (one HTTP round trip + one parallel batch):
 *   Phase A: SCORE — must run first because OVERRIDE and TRANSLATE both operate
 *            on the post-threshold kept set.
 *   Phase B: OVERRIDE and TRANSLATE in parallel — independent of each other.
 *
 * Single combined function (was 3 sequential calls) saves ~1 HTTP round trip
 * versus running judgeAndOverride + translateDefsToTarget back-to-back.
 *
 * TRANSLATE is skipped per-sense when the dict already provides translations_by_lang[targetLang],
 * or when targetLang === 'en' (en_translation / source_def already serves).
 */
export async function judgeAndTranslate(
  word: string,
  entries: DictEntry[],
  sourceLang: string,
  targetLang: string,
): Promise<JudgedSense[]> {
  const allSensesRaw: DictSense[] = entries.flatMap((e) => e.senses);
  if (allSensesRaw.length === 0) return [];
  // Score the WHOLE list (up to SCORE_MAX_SENSES) — dict order isn't
  // frequency order, so we must let the model see every sense to find the
  // common ones (power's "force/electricity" senses sit 7th+). Scoring
  // output is tiny (id+score) so this stays fast even at 24 senses.
  const allSenses = allSensesRaw.slice(0, SCORE_MAX_SENSES);

  // Phase A: SCORE. Use the array INDEX as the id, not sense_id. The model
  // mangles structured ids (it strips the ":0" suffix from "0_3:0" → "0_3",
  // breaking the match and dropping every sense). Plain integers echo back
  // reliably.
  const scoreLines = allSenses.map((s, i) => {
    const en = s.en_translation ?? "";
    return `- id=${i}  POS=${s.pos ?? ""}  GRADE=${s.grade ?? ""}  EN=${(en).slice(0, 80)}  SOURCE_DEF=${(s.source_def ?? "").slice(0, MAX_SOURCE_DEF_CHARS)}`;
  });
  const scoreUserPrompt =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `W="${word}"\n` +
    `Sense candidates:\n${scoreLines.join("\n")}`;
  const scoreResp = (await openaiCall(SCORE_SYSTEM, scoreUserPrompt)) as { scores: ScoreItem[] };

  const scoreByIdx: Record<string, { score: number; branch: number }> = {};
  scoreResp.scores?.forEach((sc, ord) => {
    // branch falls back to a unique number per sense when the model omits it,
    // so a missing branch never accidentally merges distinct senses.
    scoreByIdx[String(sc.id)] = {
      score: sc.frequency_score,
      branch: typeof sc.branch === "number" ? sc.branch : 1000 + ord,
    };
  });

  // Collect survivors with their branch. Where the dictionary provides an
  // authoritative learner-frequency grade (krdict 초급/중급/고급), that grade
  // is the PRIMARY frequency signal and the LLM score only nudges ranking
  // within a grade. The LLM badly misjudges Korean everyday frequency on its
  // own (it scored 과일 "배"/pear at 20 and 잔 "glass" at 10 despite both
  // being 초급), so trusting it alone kept dropping common meanings. Dicts
  // without a grade (kaikki en/es/…) fall back to the pure LLM score.
  const survivors: Array<{ sense: DictSense; score: number; branch: number }> = [];
  allSenses.forEach((s, i) => {
    const r = scoreByIdx[String(i)];
    const llmScore = r?.score ?? 0;
    const base = gradeBaseline(s.grade);
    const score = base !== null
      ? Math.round(base + (llmScore - 50) * 0.3)
      : llmScore;
    if (score < FREQ_THRESHOLD) return;
    survivors.push({ sense: s, score, branch: r!.branch });
  });
  if (survivors.length === 0) return [];

  // Stage 1: one representative per LLM branch (collapses shades of one
  // meaning — e.g. power's authority/control/influence → one 권력).
  const bestPerBranch = new Map<number, { sense: DictSense; score: number }>();
  for (const sv of survivors) {
    const cur = bestPerBranch.get(sv.branch);
    if (!cur || sv.score > cur.score) {
      bestPerBranch.set(sv.branch, { sense: sv.sense, score: sv.score });
    }
  }

  // Stage 2: one representative per dictionary ETYMOLOGY (sense_id prefix).
  // For krdict the prefix is target_code = a distinct etymology/homonym, and
  // its several sub-senses (배 belly/middle/time/uterus) are derivations of
  // ONE word — they must collapse to a single card entry, otherwise belly's
  // minor senses eat the cap and push out a different homonym (pear). For
  // dicts whose sense_id prefix is per-sense (kaikki en: "0_3:0"), every
  // sense has a unique prefix so this stage is a no-op and branch dedup
  // alone governs (power stays correct).
  const bestPerEtymology = new Map<string, { sense: DictSense; score: number }>();
  for (const rep of bestPerBranch.values()) {
    const prefix = rep.sense.sense_id.split(":")[0];
    const cur = bestPerEtymology.get(prefix);
    if (!cur || rep.score > cur.score) bestPerEtymology.set(prefix, rep);
  }

  // Drop etymologies whose representative meaning is a Korean counter /
  // bound-unit noun ("~를 세는 단위", "~를 나타내는 단위" — e.g. 배 "잔을
  // 세는 단위" = a glass-counter). These are measure words, not headword
  // meanings a learner studies, and krdict often mis-grades them as 초급.
  // krdict definitions are Korean, so this pattern is inert for other dicts.
  const isKoCounter = (def?: string) =>
    /(을|를)\s*(세는|나타내는)\s*단위/.test(def ?? "");

  // Sort etymology reps by score, then cap.
  let kept: JudgedSense[] = Array.from(bestPerEtymology.values())
    .filter((r) => !isKoCounter(r.sense.source_def))
    .sort((a, b) => b.score - a.score)
    .slice(0, TRANSLATE_MAX_SENSES)
    .map((r) => ({ sense: r.sense, score: r.score, reasoning: "" }));

  // Pre-fill display_translation for senses that don't need a LLM TRANSLATE call.
  // What's left in needsTranslate is the cross-lang work the model must do.
  const needsTranslate: Array<{ k: JudgedSense; en_def: string }> = [];
  for (const k of kept) {
    const pre = k.sense.translations_by_lang?.[targetLang];
    if (pre) {
      k.display_translation = pre;
      continue;
    }
    if (targetLang === "en") {
      k.display_translation = k.sense.en_translation ?? k.sense.source_def;
      continue;
    }
    // TRANSLATE uses en_translation as anchor; if it's a transliteration, OVERRIDE
    // will improve display_en separately but TRANSLATE's input stays stable —
    // acceptable trade-off to keep these two calls parallel.
    const enDef = k.sense.en_translation ?? k.sense.source_def;
    needsTranslate.push({ k, en_def: enDef });
  }

  // Phase B: OVERRIDE and TRANSLATE in parallel. Index into `kept` is the id
  // (same reliability fix as SCORE).
  const overrideLines = kept.map(
    ({ sense: s }, i) =>
      `- id=${i}  EN=${s.en_translation ?? ""}  SOURCE_DEF=${s.source_def.slice(0, 120)}`,
  );
  const overrideUserPrompt =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `W="${word}"\n` +
    `Senses:\n${overrideLines.join("\n")}`;

  const overridePromise = openaiCall(OVERRIDE_SYSTEM, overrideUserPrompt) as Promise<{
    overrides: OverrideItem[];
  }>;

  // needsTranslate entries carry their index within `kept` so the response
  // maps back correctly.
  const translateTargets: Array<{ keptIdx: number; en_def: string }> = [];
  kept.forEach((k, i) => {
    const nt = needsTranslate.find((n) => n.k === k);
    if (nt) translateTargets.push({ keptIdx: i, en_def: nt.en_def });
  });
  const translatePromise: Promise<{ translations: Array<{ id: string; translation: string }> } | null> =
    translateTargets.length === 0
      ? Promise.resolve(null)
      : (() => {
          const lines = translateTargets.map(
            ({ keptIdx, en_def }) => `- id=${keptIdx}  EN_DEF=${en_def}`,
          );
          const translateUserPrompt =
            `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
            `W="${word}"\n` +
            `Senses (English definitions to compress into TARGET_LANG short glosses):\n` +
            lines.join("\n");
          return openaiCall(TRANSLATE_SYSTEM, translateUserPrompt) as Promise<{
            translations: Array<{ id: string; translation: string }>;
          }>;
        })();

  const [overrideResp, translateResp] = await Promise.all([overridePromise, translatePromise]);

  const overrideByIdx: Record<string, string> = {};
  for (const o of overrideResp.overrides ?? []) {
    const ov = (o.translation_override ?? "").trim();
    if (ov) overrideByIdx[String(o.id)] = ov;
  }
  kept.forEach((k, i) => {
    if (overrideByIdx[String(i)]) k.en_override = overrideByIdx[String(i)];
  });

  if (translateResp) {
    const transByIdx: Record<string, string> = {};
    for (const t of translateResp.translations ?? []) {
      const v = (t.translation ?? "").trim();
      if (v) transByIdx[String(t.id)] = v;
    }
    kept.forEach((k, i) => {
      if (transByIdx[String(i)]) k.display_translation = transByIdx[String(i)];
    });
  }

  return kept;
}

// ────────────────────────────────────────────────────────────────────────
// judgeUnified — Phase 1 prototype pattern: single LLM call combining
// SCORE + OVERRIDE + TRANSLATE. Used by v4 quick mode for ~2s latency.
// ────────────────────────────────────────────────────────────────────────
//
// Source: [[project_dict_first_phase1_verified]] — prototype-end-to-end.py
// used one ai_judge_senses call to produce frequency_score + en_override +
// transl_override in one round trip. Splitting into 2-3 calls (current
// judgeAndTranslate) costs an extra round trip; for quick mode where the
// user is waiting for meanings to render, consolidation is worth it.
//
// TRANSLATE skips per-sense in three conditions:
//   1. sourceLang === targetLang (same-lang lookup — gloss redundant)
//   2. targetLang === 'en' AND existing en_translation is meaningful
//      (the EN gloss already serves as the target gloss)
//   3. sense has translations_by_lang[targetLang] from the dictionary
//      (no LLM needed — use dict)
const UNIFIED_SYSTEM = `You are a vocabulary curator for a multilingual learning dictionary. For each sense candidate of headword W (in SOURCE_LANG), produce three outputs in one pass.

(1) frequency_score (0-100): how often a typical native SOURCE_LANG speaker encounters this sense in everyday life, news, drama/film, social media, textbooks, general books.
Scale: 100 extremely common · 70-90 frequent · 40-70 occasional · 10-40 rare (formal/technical) · 0-10 archaic.
HARD CUT to 0-1: racial/ethnic slurs · hate speech · sexual harassment · vulgar sexual content · extreme insults · pure grammatical metadata (alphabet/syllable names, inflected forms as senses, function-word grammar explanations — not lexical meanings).
General profanity / slang / casual derogatory that is NOT discriminatory or harassment → learning value exists → score by everyday frequency.

(2) en_override (string): inspect existing English gloss (EN). If EN is a TRANSLITERATION (romanization of W, not a recognizable English word/phrase that conveys meaning), replace with meaningful English derived from SOURCE_DEF. If EN already conveys meaning naturally, return empty string "".

(3) target_translation (string): the natural TARGET_LANG short word/phrase (1-3 words STRICT MAX) for this sense.
- Return empty "" when SOURCE_LANG === TARGET_LANG.
- Return empty "" when TARGET_LANG = English AND en_override is empty AND EN is already meaningful.
- Return empty "" when the dictionary already provides translations_by_lang[TARGET_LANG] (passed in as PRE_TARGET).
- Otherwise produce a recognizable TARGET_LANG lexical item, not a paraphrase. Different senses of W must take different translations (polysemy).
- HARD RULE for grammatical particles / function words / bound morphemes (Korean 조사 like 은/는/이/가, Japanese 助詞 like は/が/を, Chinese 助词 like 的/了): never echo the dictionary definition (e.g. "topic particle indicating contrast") — output a SHORT learner-card label like "topic marker", "subject marker", "object marker", "possessive marker", "past tense", etc. 1-3 words MAX. This label will be wrapped in markers on the learning card, so it must read naturally.

Output strict JSON (no other keys — omit any explanation/reasoning to keep the response compact):
{
  "results": [
    { "id": "<sense_id>", "frequency_score": <0-100>, "en_override": "<...>", "target_translation": "<...>" }
  ]
}`;

interface UnifiedItem {
  id: string;
  frequency_score: number;
  en_override: string;
  target_translation: string;
}

// judgeUnified is kept as the public entry point (callers unchanged) but now
// delegates to the 2-stage judgeAndTranslate. The single-call variant was
// fast only with a tight sense cap, and that cap silently dropped common
// meanings whose dict position is late (power's "force/electricity" senses).
// The 2-stage path scores the FULL list cheaply (id+score output) so no
// common sense is missed, then translates only the high-frequency survivors.
export async function judgeUnified(
  word: string,
  entries: DictEntry[],
  sourceLang: string,
  targetLang: string,
): Promise<JudgedSense[]> {
  return judgeAndTranslate(word, entries, sourceLang, targetLang);
}
