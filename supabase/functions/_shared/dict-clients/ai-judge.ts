// AI judge — score-based sense selection + transliteration override + cross-lang translation.
//
// Two paths share ONE selection core (selectKept):
//   • judgeUnified  — single LLM call (score+branch+override+translation per
//                     sense) for few-sense words (the common case). 1 round trip.
//   • judgeAndTranslate — 2-stage (SCORE → OVERRIDE∥TRANSLATE) for many-sense
//                     words, where scoring the full list cheaply before
//                     translating only survivors is worth the extra round trip.
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
//   [[feedback_llm_index_id_matching]] — id는 배열 index (sense_id 금지)
//   [[project_dict_judge_architecture_2026-05-29]] — selectKept 결정성 구조

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

// Per-source model. nano is ~3x faster and, where sense grouping is
// DETERMINISTIC (krdict/jmdict/cedict entry-prefix), gives identical results —
// it only scores + translates, which it does as well as mini. But wiktionary
// (en/es/fr/de/it) groups via the LLM "branch", and nano clusters poorly:
// it over-splits "power" into 능력/권한/영향력 dupes and drops "light"→가벼운.
// So wiktionary keeps mini; everything else uses nano. (Measured 2026-05-30.)
const MODEL_FAST = "gpt-4.1-nano";
const MODEL_QUALITY = "gpt-4.1-mini";
function modelForSource(source: string | undefined): string {
  return source === "wiktionary" ? MODEL_QUALITY : MODEL_FAST;
}

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

Output strict JSON (id is the integer from the input):
{
  "overrides": [
    { "id": <int>, "translation_override": "<meaningful English or empty string>" }
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

Output strict JSON (id is the integer from the input):
{
  "translations": [
    { "id": <int>, "translation": "<short TARGET_LANG word or phrase>" }
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

async function openaiCall(systemPrompt: string, userPrompt: string, model: string, maxTokens?: number): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
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

// ────────────────────────────────────────────────────────────────────────
// Shared helpers — used identically by judgeUnified (single call) and
// judgeAndTranslate (2-stage) so the two paths can never diverge.
// ────────────────────────────────────────────────────────────────────────

type SenseSignal = { score: number; branch: number };

function parseScores(scores: ScoreItem[] | undefined): Record<string, SenseSignal> {
  const m: Record<string, SenseSignal> = {};
  // branch falls back to a unique number per item so a missing branch never
  // accidentally merges distinct senses.
  scores?.forEach((sc, ord) => {
    m[String(sc.id)] = {
      score: sc.frequency_score,
      branch: typeof sc.branch === "number" ? sc.branch : 1000 + ord,
    };
  });
  return m;
}

// Build the per-sense input lines. id is the array INDEX, never sense_id — the
// model strips the ":0" suffix from structured ids ("0_3:0" → "0_3"), breaking
// the match and dropping every sense. Plain integers echo back reliably.
// PRE_TARGET (dict-provided target translation) is included only when targetLang
// is given (the single-call path), so the model knows it can skip translating.
function buildSenseLines(allSenses: DictSense[], targetLang?: string): string {
  return allSenses
    .map((s, i) => {
      const en = (s.en_translation ?? "").slice(0, 80);
      const preField = targetLang
        ? `  PRE_TARGET=${s.translations_by_lang?.[targetLang] ?? ""}`
        : "";
      return `- id=${i}  POS=${s.pos ?? ""}  GRADE=${s.grade ?? ""}  EN=${en}${preField}  SOURCE_DEF=${(s.source_def ?? "").slice(0, MAX_SOURCE_DEF_CHARS)}`;
    })
    .join("\n");
}

// Turn per-sense {score, branch} signals into the final kept learner cards.
// This is the deterministic heart of the judge; see
// [[project_dict_judge_architecture_2026-05-29]].
function selectKept(
  allSenses: DictSense[],
  signalByIdx: Record<string, SenseSignal>,
  sourceLang: string,
  source: string | undefined,
): Array<{ sense: DictSense; score: number; idx: number }> {
  // For krdict/jmdict/cedict/freedict the sense_id prefix is the dictionary
  // ENTRY (one etymology / homonym): branch by it so the non-deterministic LLM
  // branch can never merge two distinct homonyms (the "배 pear disappears" bug).
  // Wiktionary's prefix is unique per sense, so there the LLM branch is the only
  // grouping signal (power: ability / authority / force → distinct cards).
  const prefixIsEntry = source !== "wiktionary";
  // Bound/grammatical morpheme (Korean 조사/어미/접사/보조) — exempt from the
  // grade-survival floor so low-value ones (배 무리-접미사) can still drop.
  const isBoundPos = (pos?: string) => /조사|어미|접사|보조/.test(pos ?? "");

  const survivors: Array<{ sense: DictSense; score: number; branchKey: string; idx: number }> = [];
  allSenses.forEach((s, i) => {
    const r = signalByIdx[String(i)];
    const llmScore = r?.score ?? 0;
    const base = gradeBaseline(s.grade);
    let score = base !== null ? Math.round(base + (llmScore - 50) * 0.3) : llmScore;
    // krdict word_grade is authoritative: a graded CONTENT word can't be dropped
    // by an LLM under-score (배/double blends to 29, one point under threshold),
    // so floor its survival at the grade baseline; the LLM nudge only ranks up.
    if (base !== null && !isBoundPos(s.pos)) score = Math.max(score, base);
    if (score < FREQ_THRESHOLD) return;
    const branchKey = prefixIsEntry ? `e:${s.sense_id.split(":")[0]}` : `b:${r?.branch ?? 1000 + i}`;
    survivors.push({ sense: s, score, branchKey, idx: i });
  });
  if (survivors.length === 0) return [];

  // One rep per branch. krdict senses are frequency-ordered, so for ko the rep
  // is the lowest dict index (sense_order 1 = primary meaning) — that way a
  // counter-primary entry (배 杯) is judged on its counter sense, not a minor
  // sibling (杯's "trophy"). Other sources: the highest-frequency sense wins
  // (collapses power's authority/control/influence shades → one 권력).
  const dictPrimaryRep = sourceLang === "ko";
  const bestPerBranch = new Map<string, { sense: DictSense; score: number; idx: number }>();
  for (const sv of survivors) {
    const cur = bestPerBranch.get(sv.branchKey);
    const wins = !cur || (dictPrimaryRep ? sv.idx < cur.idx : sv.score > cur.score);
    if (wins) bestPerBranch.set(sv.branchKey, { sense: sv.sense, score: sv.score, idx: sv.idx });
  }

  // Drop a card whose WINNING sense is a Korean counter / bound-unit ("~를 세는
  // 단위"). Filtering on the winner (not every sub-sense) means a measure-word
  // entry drops entirely instead of surfacing a minor sibling. Inert elsewhere.
  const isKoCounter = (def?: string) => /(세는|나타내는)\s*단위/.test(def ?? "");
  const reps = Array.from(bestPerBranch.values()).filter((r) => !isKoCounter(r.sense.source_def));

  // 고급(advanced) gate: on a POLYSEMOUS word (>2 meanings) drop advanced-grade
  // homonyms so rare ones (눈 그물눈/새싹눈, 배 double) don't clutter the everyday
  // ones; on a few-meaning word — or one with no common meaning (심오하다) — keep
  // them so the card isn't sparse/empty. Advanced grade exists only in krdict.
  const isAdvanced = (grade?: string) => (grade ?? "").includes("고급");
  const coreReps = reps.filter((r) => !isAdvanced(r.sense.grade));
  const selected = reps.length <= 2 || coreReps.length === 0 ? reps : coreReps;

  return selected.sort((a, b) => b.score - a.score).slice(0, TRANSLATE_MAX_SENSES);
}

// Deterministic target gloss that needs no LLM: a dict-provided translation, or
// the English gloss itself when the target language is English.
function prefillTranslation(sense: DictSense, targetLang: string): string | null {
  const pre = sense.translations_by_lang?.[targetLang];
  if (pre) return pre;
  if (targetLang === "en") return sense.en_translation ?? sense.source_def;
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// judgeUnified — single-call fast path for few-sense words (the common case).
// One LLM round trip outputs score + branch + en_override + target_translation
// per sense; selectKept then picks the cards. Cuts quick-mode latency from two
// sequential round trips (SCORE → OVERRIDE∥TRANSLATE) to one. Words with more
// than UNIFIED_MAX_SENSES use the 2-stage judgeAndTranslate, where scoring the
// full list before translating only the survivors avoids translating senses
// that will be dropped.
// ────────────────────────────────────────────────────────────────────────
const UNIFIED_MAX_SENSES = 12;

const UNIFIED_SYSTEM = `You are a vocabulary curator for a multilingual learning dictionary. For each sense candidate of headword W (in SOURCE_LANG), output four fields in one pass.

(1) frequency_score (0-100): how often a typical native SOURCE_LANG speaker meets this sense in everyday life, news, drama/film, social media, textbooks, general books.
Scale: 100 extremely common · 70-90 frequent · 40-70 occasional · 10-40 rare (formal/technical) · 0-10 archaic.
HARD CUT to 0-1: racial/ethnic slurs · hate speech · sexual harassment · vulgar sexual content · extreme insults · pure grammatical metadata (alphabet/syllable names, inflected forms as senses, function-word grammar explanations — not lexical meanings).
General profanity / slang / casual derogatory that is NOT discriminatory or harassment → learning value exists → score by everyday frequency.

(2) branch (int): senses that are the SAME underlying meaning share a branch number (even if surface translations differ); genuinely DISTINCT meanings or unrelated homonyms get DIFFERENT numbers. Start at 0.

(3) en_override (string): if the existing English gloss (EN) is a TRANSLITERATION (romanization of W, not a recognizable English word/phrase), replace it with meaningful English derived from SOURCE_DEF. If EN already conveys meaning, return "".

(4) target_translation (string): the natural TARGET_LANG word/phrase (1-3 words MAX) for this sense.
- Return "" when SOURCE_LANG equals TARGET_LANG, or when PRE_TARGET is already provided, or when TARGET_LANG is English and EN already conveys meaning.
- Otherwise a recognizable TARGET_LANG lexical item, not a paraphrase. Different senses must take different translations.
- For grammatical particles / function words / bound morphemes (Korean 조사, Japanese 助詞, Chinese 助词): never echo the dictionary definition — output a SHORT learner-card label ("topic marker", "object marker", "past tense", …), 1-3 words MAX.

Output strict JSON (id is the integer from the input, no other keys):
{
  "results": [
    { "id": <int>, "frequency_score": <0-100>, "branch": <int>, "en_override": "<...>", "target_translation": "<...>" }
  ]
}`;

interface UnifiedItem {
  id: number | string;
  frequency_score: number;
  branch?: number;
  en_override?: string;
  target_translation?: string;
}

async function judgeUnifiedSingle(
  word: string,
  entries: DictEntry[],
  sourceLang: string,
  targetLang: string,
): Promise<JudgedSense[]> {
  const allSenses = entries.flatMap((e) => e.senses);
  if (allSenses.length === 0) return [];

  const userPrompt =
    `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
    `W="${word}"\n` +
    `Sense candidates:\n${buildSenseLines(allSenses, targetLang)}`;
  const model = modelForSource(entries[0]?.source);
  const resp = (await openaiCall(UNIFIED_SYSTEM, userPrompt, model)) as { results: UnifiedItem[] };

  const signalByIdx: Record<string, SenseSignal> = {};
  const overrideByIdx: Record<string, string> = {};
  const transByIdx: Record<string, string> = {};
  resp.results?.forEach((r, ord) => {
    const key = String(r.id);
    signalByIdx[key] = {
      score: r.frequency_score,
      branch: typeof r.branch === "number" ? r.branch : 1000 + ord,
    };
    const ov = (r.en_override ?? "").trim();
    if (ov) overrideByIdx[key] = ov;
    const tr = (r.target_translation ?? "").trim();
    if (tr) transByIdx[key] = tr;
  });

  const keptReps = selectKept(allSenses, signalByIdx, sourceLang, entries[0]?.source);
  return keptReps.map((r) => {
    const key = String(r.idx);
    const prefill = prefillTranslation(r.sense, targetLang);
    return {
      sense: r.sense,
      score: r.score,
      reasoning: "",
      en_override: overrideByIdx[key],
      display_translation: prefill ?? transByIdx[key],
    } as JudgedSense;
  });
}

/**
 * 2-stage judge for many-sense words: SCORE the full list cheaply (id+score+
 * branch), select the kept cards, then OVERRIDE + TRANSLATE only the survivors
 * in parallel. Translating every sense up front (the single-call path) would be
 * wasteful when a word has dozens of senses.
 */
export async function judgeAndTranslate(
  word: string,
  entries: DictEntry[],
  sourceLang: string,
  targetLang: string,
): Promise<JudgedSense[]> {
  const allSenses = entries.flatMap((e) => e.senses).slice(0, SCORE_MAX_SENSES);
  if (allSenses.length === 0) return [];
  const model = modelForSource(entries[0]?.source);

  const scoreUserPrompt =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `W="${word}"\n` +
    `Sense candidates:\n${buildSenseLines(allSenses)}`;
  const scoreResp = (await openaiCall(SCORE_SYSTEM, scoreUserPrompt, model)) as { scores: ScoreItem[] };
  const keptReps = selectKept(allSenses, parseScores(scoreResp.scores), sourceLang, entries[0]?.source);
  if (keptReps.length === 0) return [];
  const kept: JudgedSense[] = keptReps.map((r) => ({ sense: r.sense, score: r.score, reasoning: "" }));

  // Pre-fill deterministic translations; the rest need the LLM TRANSLATE call.
  const needsTranslate: number[] = []; // indices into kept
  kept.forEach((k, i) => {
    const pre = prefillTranslation(k.sense, targetLang);
    if (pre) k.display_translation = pre;
    else needsTranslate.push(i);
  });

  // OVERRIDE (all kept) ∥ TRANSLATE (only those needing it). Index into kept = id.
  const overrideUserPrompt =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `W="${word}"\n` +
    `Senses:\n` +
    kept
      .map(({ sense: s }, i) => `- id=${i}  EN=${s.en_translation ?? ""}  SOURCE_DEF=${s.source_def.slice(0, 120)}`)
      .join("\n");
  const overridePromise = openaiCall(OVERRIDE_SYSTEM, overrideUserPrompt, model) as Promise<{ overrides: OverrideItem[] }>;

  const translatePromise: Promise<{ translations: Array<{ id: string; translation: string }> } | null> =
    needsTranslate.length === 0
      ? Promise.resolve(null)
      : (openaiCall(
          TRANSLATE_SYSTEM,
          `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
            `W="${word}"\n` +
            `Senses (English definitions to compress into TARGET_LANG short glosses):\n` +
            needsTranslate
              .map((ki) => `- id=${ki}  EN_DEF=${kept[ki].sense.en_translation ?? kept[ki].sense.source_def}`)
              .join("\n"),
          model,
        ) as Promise<{ translations: Array<{ id: string; translation: string }> }>);

  const [overrideResp, translateResp] = await Promise.all([overridePromise, translatePromise]);

  for (const o of overrideResp.overrides ?? []) {
    const ov = (o.translation_override ?? "").trim();
    const k = kept[Number(o.id)];
    if (ov && k) k.en_override = ov;
  }
  if (translateResp) {
    for (const t of translateResp.translations ?? []) {
      const v = (t.translation ?? "").trim();
      const k = kept[Number(t.id)];
      if (v && k) k.display_translation = v;
    }
  }
  return kept;
}

// ────────────────────────────────────────────────────────────────────────
// judgeSelect — SELECT path for dicts that benefit from "pick everyday meanings"
// instead of "score every sense". Used by:
//   • wiktionary / freedict (en/es/fr/de/it) — no frequency grade, dozens of
//     fine nuance senses; mini SELECT runs ~2s vs 14s for score-all.
//   • jmdict (ja) — large per-entry sense counts inflate output for the CJK
//     UNIFIED path (ja median ~4-5s vs zh-CN ~3s). SELECT keeps output small
//     while a `dedupByEntry` post-step preserves JMdict's homonym separation
//     (multiple model picks from the same jmdict_seq collapse to one card).
// nano clusters English semantics poorly (verified: power → 능력/권한/영향력
// dups, light → 빛/빛), so wiktionary/freedict stay on mini. JMdict glosses are
// formalized so nano handles ja SELECT fine — verified equivalent to mini.
// ────────────────────────────────────────────────────────────────────────
const SELECT_MAX = 5;

const SELECT_SYSTEM = `You curate vocabulary cards for GENERAL language learners (not lexicographers). You receive ALL dictionary senses of headword W (in SOURCE_LANG); most are rare, archaic, technical, grammatical variants, or fine nuances of one core meaning.

Return ONLY the everyday CORE meanings a general learner needs:
- MERGE AGGRESSIVELY by core concept, not by nuance. Senses that express one underlying idea — even applied to different domains, registers, or connotations — collapse into a SINGLE card. Split into separate cards only when the meanings are genuinely unrelated: a different core concept, or a homonym from another origin.
- DROP archaic, obsolete, historical, highly technical/jargon, proper-name, and rare or regional senses.
- Order by everyday frequency, most common first. Return 2-4 cards in almost all cases; allow a 5th only for a genuinely rich word. Prefer FEWER, broader cards over many narrow ones.

For each kept meaning, choose ONE representative sense and output:
- id: the integer id of that representative sense
- target_translation: the SINGLE TARGET_LANG word or short phrase (1-3 words MAX) for the HEADWORD's actual meaning in this sense — what a native TARGET_LANG speaker would naturally use to express this meaning of W. Output ONE option only — no commas, slashes, or alternatives. Translate W's MEANING, not the English gloss text: when the gloss is a brief abstract noun whose interpretation depends on context (the same English word means very different things in different domains or compounds), render the contextual meaning that fits W's actual usage, NOT a literal word-for-word rendering of the gloss. If you can't find a translation that captures W's specific contextual meaning, drop the sense rather than producing a misleading literal label.
- en: a 1-3 word English label for the meaning

Output strict JSON:
{
  "meanings": [
    { "id": <int>, "target_translation": "<...>", "en": "<...>" }
  ]
}`;

interface SelectItem {
  id: number | string;
  target_translation?: string;
  en?: string;
}

async function judgeSelect(
  word: string,
  entries: DictEntry[],
  sourceLang: string,
  targetLang: string,
  opts: { model: string; dedupByEntry: boolean } = { model: MODEL_QUALITY, dedupByEntry: false },
): Promise<JudgedSense[]> {
  const allSenses = entries.flatMap((e) => e.senses).slice(0, SCORE_MAX_SENSES);
  if (allSenses.length === 0) return [];

  const lines = allSenses
    .map((s, i) => {
      const tags = (s.misc_tags ?? []).slice(0, 4).join(",");
      return `- id=${i}  POS=${s.pos ?? ""}  TAGS=${tags}  GLOSS=${(s.source_def ?? "").slice(0, 120)}`;
    })
    .join("\n");
  const userPrompt =
    `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
    `W="${word}"\n` +
    `All senses:\n${lines}`;
  const resp = (await openaiCall(SELECT_SYSTEM, userPrompt, opts.model)) as { meanings: SelectItem[] };

  const out: JudgedSense[] = [];
  const seen = new Set<number>();
  const seenPrefix = new Set<string>(); // for dedupByEntry (jmdict_seq)
  (resp.meanings ?? []).slice(0, SELECT_MAX).forEach((m, rank) => {
    const idx = Number(m.id);
    const sense = allSenses[idx];
    if (!sense || seen.has(idx)) return;
    if (opts.dedupByEntry) {
      // JMdict: jmdict_seq is the homonym entry; multiple model picks within
      // one seq collapse to one card (the user's policy: same-entry senses
      // are derivational, not new meanings — different entries are real
      // homonyms and each deserves a card).
      const prefix = sense.sense_id.split(":")[0];
      if (seenPrefix.has(prefix)) return;
      seenPrefix.add(prefix);
    }
    seen.add(idx);
    const enLabel = (m.en ?? "").trim();
    const tr = (m.target_translation ?? "").trim();
    const prefill = prefillTranslation(sense, targetLang);
    out.push({
      sense,
      score: 100 - rank, // synthetic: preserve the model's frequency ordering
      reasoning: "",
      en_override: enLabel || undefined,
      display_translation: prefill ?? (tr || undefined),
    });
  });
  return out;
}

// Public entry point. Routes by dictionary type:
//   • wiktionary / freedict (Latin scripts, no grade) → judgeSelectLatin (mini)
//   • jmdict (ja) → judgeSelect with dedupByEntry on NANO (jmdict_seq preserves
//     homonyms; UNIFIED's large output made ja slowest in the 56-pair eval,
//     ~3.8s; SELECT-nano landed at ~0.84s with equivalent quality).
//   • krdict / cedict (ko, zh) → score + selectKept on nano: single call for
//     few-sense words, 2-stage for many. Deterministic grouping (grade floor
//     for ko, entry-prefix for both).
// Callers stay unchanged.
export async function judgeUnified(
  word: string,
  entries: DictEntry[],
  sourceLang: string,
  targetLang: string,
): Promise<JudgedSense[]> {
  const source = entries[0]?.source;
  if (source === "wiktionary" || source === "freedict") {
    return judgeSelect(word, entries, sourceLang, targetLang, { model: MODEL_QUALITY, dedupByEntry: false });
  }
  if (source === "jmdict") {
    // nano on ja SELECT verified equivalent to mini (16-word test 2026-05-30):
    // 14/16 identical, 2 minor ordering nits (空, 朝). JMdict glosses are
    // formalized — unlike Wiktionary's English glosses — so nano's weaker
    // semantic clustering doesn't bite here.
    return judgeSelect(word, entries, sourceLang, targetLang, { model: MODEL_FAST, dedupByEntry: true });
  }
  const total = entries.reduce((n, e) => n + e.senses.length, 0);
  if (total > 0 && total <= UNIFIED_MAX_SENSES) {
    return judgeUnifiedSingle(word, entries, sourceLang, targetLang);
  }
  return judgeAndTranslate(word, entries, sourceLang, targetLang);
}
