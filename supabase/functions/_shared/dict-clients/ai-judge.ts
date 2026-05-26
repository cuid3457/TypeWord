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

Output strict JSON:
{
  "scores": [
    { "id": "<sense_id>", "frequency_score": <0-100>, "reasoning": "<one-line rationale>" }
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
  reasoning: string;
}

interface OverrideItem {
  id: string;
  translation_override: string;
}

async function openaiCall(systemPrompt: string, userPrompt: string): Promise<any> {
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
  const allSenses: DictSense[] = entries.flatMap((e) => e.senses);
  if (allSenses.length === 0) return [];

  // Phase A: SCORE
  const scoreLines = allSenses.map((s) => {
    const en = s.en_translation ?? "";
    return `- id=${s.sense_id}  POS=${s.pos ?? ""}  GRADE=${s.grade ?? ""}  EN=${en}  SOURCE_DEF=${s.source_def}`;
  });
  const scoreUserPrompt =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `W="${word}"\n` +
    `Sense candidates:\n${scoreLines.join("\n")}`;
  const scoreResp = (await openaiCall(SCORE_SYSTEM, scoreUserPrompt)) as { scores: ScoreItem[] };

  const scoreById: Record<string, ScoreItem> = {};
  for (const sc of scoreResp.scores ?? []) {
    scoreById[sc.id] = sc;
  }

  const kept: JudgedSense[] = [];
  for (const s of allSenses) {
    const sc = scoreById[s.sense_id];
    const score = sc?.frequency_score ?? 0;
    if (score < FREQ_THRESHOLD) continue;
    kept.push({ sense: s, score, reasoning: sc?.reasoning ?? "" });
  }
  if (kept.length === 0) return [];

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

  // Phase B: OVERRIDE and TRANSLATE in parallel.
  const overrideLines = kept.map(
    ({ sense: s }) =>
      `- id=${s.sense_id}  EN=${s.en_translation ?? ""}  SOURCE_DEF=${s.source_def.slice(0, 120)}`,
  );
  const overrideUserPrompt =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `W="${word}"\n` +
    `Senses:\n${overrideLines.join("\n")}`;

  const overridePromise = openaiCall(OVERRIDE_SYSTEM, overrideUserPrompt) as Promise<{
    overrides: OverrideItem[];
  }>;

  const translatePromise: Promise<{ translations: Array<{ id: string; translation: string }> } | null> =
    needsTranslate.length === 0
      ? Promise.resolve(null)
      : (() => {
          const lines = needsTranslate.map(
            ({ k, en_def }) => `- id=${k.sense.sense_id}  EN_DEF=${en_def}`,
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

  const overrideById: Record<string, string> = {};
  for (const o of overrideResp.overrides ?? []) {
    const ov = (o.translation_override ?? "").trim();
    if (ov) overrideById[o.id] = ov;
  }
  for (const k of kept) {
    if (overrideById[k.sense.sense_id]) {
      k.en_override = overrideById[k.sense.sense_id];
    }
  }

  if (translateResp) {
    const transById: Record<string, string> = {};
    for (const t of translateResp.translations ?? []) {
      const v = (t.translation ?? "").trim();
      if (v) transById[t.id] = v;
    }
    for (const { k } of needsTranslate) {
      if (transById[k.sense.sense_id]) k.display_translation = transById[k.sense.sense_id];
    }
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

Output strict JSON:
{
  "results": [
    { "id": "<sense_id>", "frequency_score": <0-100>, "en_override": "<...>", "target_translation": "<...>", "reasoning": "<one-line>" }
  ]
}`;

interface UnifiedItem {
  id: string;
  frequency_score: number;
  en_override: string;
  target_translation: string;
  reasoning: string;
}

export async function judgeUnified(
  word: string,
  entries: DictEntry[],
  sourceLang: string,
  targetLang: string,
): Promise<JudgedSense[]> {
  const allSenses: DictSense[] = entries.flatMap((e) => e.senses);
  if (allSenses.length === 0) return [];

  // Build sense lines with all info the unified prompt needs.
  const lines = allSenses.map((s) => {
    const en = s.en_translation ?? "";
    const pre = s.translations_by_lang?.[targetLang] ?? "";
    return (
      `- id=${s.sense_id}` +
      `  POS=${s.pos ?? ""}` +
      `  GRADE=${s.grade ?? ""}` +
      `  EN=${en}` +
      `  PRE_TARGET=${pre}` +
      `  SOURCE_DEF=${s.source_def}`
    );
  });
  const userPrompt =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `TARGET_LANG=${langName(targetLang)}\n` +
    `W="${word}"\n` +
    `Sense candidates:\n${lines.join("\n")}`;

  const resp = (await openaiCall(UNIFIED_SYSTEM, userPrompt)) as { results: UnifiedItem[] };
  const byId: Record<string, UnifiedItem> = {};
  for (const r of resp.results ?? []) byId[r.id] = r;

  const kept: JudgedSense[] = [];
  for (const s of allSenses) {
    const r = byId[s.sense_id];
    const score = r?.frequency_score ?? 0;
    if (score < FREQ_THRESHOLD) continue;
    const j: JudgedSense = { sense: s, score, reasoning: r?.reasoning ?? "" };
    const ov = (r?.en_override ?? "").trim();
    if (ov) j.en_override = ov;

    // Resolve display_translation:
    //   priority: r.target_translation > sense.translations_by_lang[target] > en_override > sense.en_translation > sense.source_def
    const tt = (r?.target_translation ?? "").trim();
    if (tt) {
      j.display_translation = tt;
    } else if (s.translations_by_lang?.[targetLang]) {
      j.display_translation = s.translations_by_lang[targetLang];
    } else if (targetLang === "en") {
      j.display_translation = j.en_override ?? s.en_translation ?? s.source_def;
    } else if (sourceLang === targetLang) {
      j.display_translation = s.source_def;
    }
    kept.push(j);
  }
  return kept;
}
