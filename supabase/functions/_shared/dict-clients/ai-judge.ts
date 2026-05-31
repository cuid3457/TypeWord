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
//
// 2026-05-31: Lowered 5 → 4. Policy: show only "truly-everyday distinct
// meanings". For "배" we want 신체/탈것/과일/배수 — and never more than 4
// even when the dict ships a richer polysemy (zh "上" 20+ senses → top 4
// only). Cap is upper bound, not target: a single-meaning word stays 1.
const TRANSLATE_MAX_SENSES = 4;

// POLYSEMY_FREQ_FLOOR — on a polysemous headword (more than one branch
// surviving) require each kept sense to clear an "everyday" frequency bar.
// Suppresses rare literary/technical/archaic homonyms (zh "上" classical
// poetic shades, ja archaic readings) while keeping the four 일상 meanings
// of "배" (신체/탈것/과일/배수 — LLM scores these 50–80).
//
// 50 chosen empirically: krdict initial-meaning examples land 70–90,
// secondary daily meanings 50–70, archaic/literary 30–45. Floor at 50 keeps
// the daily set without admitting "occasional formal" senses. Combined with
// MAX_SENSES=4 it caps cards even when several senses clear the floor.
const POLYSEMY_FREQ_FLOOR = 50;

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
  // Only krdict/freedict ship one dictionary entry per homonym, so their
  // sense_id prefix IS a meaningful homonym signal — group by it.
  //
  // JMdict/CC-CEDICT pack every meaning of a headword into a single entry
  // (jmdict_seq / cedict row), so the prefix is constant across senses and
  // would collapse all senses into one rep. Use the LLM branch instead.
  // Wiktionary's per-sense prefix is unique by construction; LLM branch is
  // the only useful signal there too.
  const prefixIsEntry = source === "krdict" || source === "freedict";
  // Bound/grammatical morpheme (Korean 조사/어미/접사/보조) — exempt from the
  // grade-survival floor so low-value ones (배 무리-접미사) can still drop.
  const isBoundPos = (pos?: string) => /조사|어미|접사|보조/.test(pos ?? "");

  const survivors: Array<{ sense: DictSense; score: number; branchKey: string; idx: number }> = [];
  allSenses.forEach((s, i) => {
    const r = signalByIdx[String(i)];
    const llmScore = r?.score ?? 0;
    const base = gradeBaseline(s.grade);
    // Score = LLM's frequency_score (the authority), with grade providing a
    // safety floor so a single LLM under-score can't drop a common graded
    // content word. The LLM is trusted to RANK UP (배/pear advanced but
    // daily → LLM 80 wins over grade 38); grade only prevents downside.
    let score = base !== null && !isBoundPos(s.pos)
      ? Math.max(llmScore, base)
      : llmScore;
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
  // Drop Korean auxiliary verbs / dependent nouns (보조 동사, 의존 명사) when
  // ANY other content sense exists for the same headword. krdict's auxiliary
  // senses (먹다's "try/cope", 있다's "exist as auxiliary", 보다's "perceive")
  // ship with bad cross-language translations (먹다→zh-CN "不喜欢" is a real
  // example) AND grammatically only attach to a host verb, so a standalone
  // card is noise for learners. Keep them ONLY if no main-pos sense survived.
  const isKoAuxOrDep = (pos?: string) => /보조|의존|어미|접사/.test(pos ?? "");
  const allReps = Array.from(bestPerBranch.values()).filter((r) => !isKoCounter(r.sense.source_def));
  const contentReps = allReps.filter((r) => !isKoAuxOrDep(r.sense.pos));
  const reps = contentReps.length > 0 ? contentReps : allReps;

  // Polysemy frequency gate: when a word has multiple distinct branches
  // (homonym/polysemy), keep only senses scoring at or above the everyday
  // floor. This is purely score-based — grade no longer cuts directly
  // (the score formula already factored it as a baseline). A daily-frequent
  // advanced-graded sense (배 pear scoring 75) passes; an obscure mid-grade
  // sense scoring 45 does not. Single-meaning words bypass (would have one
  // rep anyway).
  const everyday = reps.filter((r) => r.score >= POLYSEMY_FREQ_FLOOR);
  // If gate would erase EVERY sense (the word has no everyday meaning, e.g.
  // an entirely literary/technical headword), fall back to the un-gated reps
  // so the card isn't empty. This is the "심오하다 stays" exception.
  const selected = everyday.length === 0 ? reps : everyday;

  return selected.sort((a, b) => b.score - a.score).slice(0, TRANSLATE_MAX_SENSES);
}

// Deterministic target gloss that needs no LLM: a dict-provided translation, or
// the English gloss itself when the target language is English. NEVER falls
// back to source_def — that field contains the SOURCE-LANG definition (Korean
// for krdict, Chinese for cedict) and would leak as the card label.
function prefillTranslation(sense: DictSense, targetLang: string): string | null {
  // Reduce a multi-synonym dict gloss to a single learner-card label:
  // "speech; words" → "speech", "car; automobile; vehicle" → "car",
  // "maison, foyer, demeure, ..." → "maison". The other listed terms are
  // paraphrases of the same sense; a card label needs ONE primary form.
  const reduce = (s: string): string => {
    const trimmed = s.trim();
    if (!trimmed) return trimmed;
    const sep = /[;,]/.exec(trimmed);
    return sep ? trimmed.slice(0, sep.index).trim() : trimmed;
  };
  const pre = sense.translations_by_lang?.[targetLang];
  if (pre) return reduce(pre);
  if (targetLang === "en" && sense.en_translation) return reduce(sense.en_translation);
  return null;
}

// Cheap check for romanization leakage in the English override — if the LLM
// just echoed the source headword's letters back instead of producing an
// English word (돈→"don", 먹다→"meokda", 말→"mal"), reject it so the card
// falls back to en_translation or omits the sense.
function isLikelyRomanization(en: string, sourceWord: string): boolean {
  const e = en.trim().toLowerCase();
  if (!e) return false;
  if (!/^[a-z\s-]+$/.test(e)) return false; // only consider all-Latin strings
  if (e.length > 12) return false; // long Latin strings are real English
  // If the override is identical to the source headword (CJK case impossible,
  // Latin source where override = source = just echoing) OR is one of the
  // common romanization patterns that map source phonemes → Latin syllables,
  // reject. The "≤ 1 vowel cluster + ≤ 3 syllables" check would over-fire;
  // the strongest signal is the source-word echo.
  if (e === sourceWord.trim().toLowerCase()) return true;
  return false;
}

// Phonetic match: is EN a likely romanization of the SOURCE_LANG headword W?
// We do NOT try to build a full romanizer — that needs language-specific
// tables and would still miss edge cases. Instead we check the strongest
// signal: does EN start with the same consonant + vowel sound as W's first
// syllable? "money" for 돈 fails (m ≠ d); "don" for 돈 passes (d-o-n matches
// ㄷㅗㄴ). False positives are very rare because real English glosses rarely
// share the initial CV of an unrelated CJK headword.
//
// Korean (Hangul) initial-consonant + initial-vowel romanization table per
// Revised Romanization (most common). Japanese / Chinese are NOT checked here
// — JMdict / CEDICT don't ship raw romanizations as senses the way krdict
// occasionally does, so the leak pattern is Korean-specific in practice.
const KO_INITIAL_CONS: Record<string, string[]> = {
  ㄱ: ["g", "k"], ㄲ: ["kk", "g"], ㄴ: ["n"], ㄷ: ["d", "t"], ㄸ: ["tt", "d"],
  ㄹ: ["r", "l"], ㅁ: ["m"], ㅂ: ["b", "p"], ㅃ: ["pp", "b"], ㅅ: ["s"],
  ㅆ: ["ss", "s"], ㅇ: [""], ㅈ: ["j"], ㅉ: ["jj"], ㅊ: ["ch"], ㅋ: ["k"],
  ㅌ: ["t"], ㅍ: ["p"], ㅎ: ["h"],
};
const KO_VOWEL: Record<string, string[]> = {
  ㅏ: ["a"], ㅐ: ["ae", "e"], ㅑ: ["ya"], ㅒ: ["yae"], ㅓ: ["eo", "u", "o"],
  ㅔ: ["e"], ㅕ: ["yeo", "yu", "yo"], ㅖ: ["ye"], ㅗ: ["o"], ㅘ: ["wa"],
  ㅙ: ["wae"], ㅚ: ["oe", "we"], ㅛ: ["yo"], ㅜ: ["u", "oo"], ㅝ: ["wo", "wo"],
  ㅞ: ["we"], ㅟ: ["wi"], ㅠ: ["yu"], ㅡ: ["eu", "u"], ㅢ: ["ui"], ㅣ: ["i"],
};
function koHangulRomanizationPrefixes(word: string | undefined | null): string[] {
  if (!word) return [];
  const syllable = word.trim().charAt(0);
  const code = syllable.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return [];
  const offset = code - 0xAC00;
  const consIdx = Math.floor(offset / 588);
  const vowelIdx = Math.floor((offset % 588) / 28);
  const consList = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const vowelList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const cons = KO_INITIAL_CONS[consList[consIdx]] ?? [];
  const vowels = KO_VOWEL[vowelList[vowelIdx]] ?? [];
  const out: string[] = [];
  for (const c of cons) for (const v of vowels) out.push((c + v).toLowerCase());
  return out;
}

function isDictRomanizationLeak(en: string | undefined | null, sourceLang: string, sourceWord: string): boolean {
  const e = (en ?? "").trim();
  if (!e) return false;
  // Only ko has the empirical pattern of krdict shipping romaja as EN for rare
  // senses. Extend to ja/zh later if data shows it.
  if (sourceLang !== "ko") return false;
  if (!/^[a-zA-Z][a-zA-Z'\-]{0,12}$/.test(e)) return false;
  if (/\s/.test(e)) return false; // multi-word EN is a real gloss
  const lower = e.toLowerCase();
  const prefixes = koHangulRomanizationPrefixes(sourceWord);
  if (prefixes.length === 0) return false;
  // EN qualifies as a romanization leak ONLY when it starts with one of the
  // valid romaja prefixes for W's first syllable AND its overall length is
  // close to W's syllable count × ~2 chars (typical romaja ratio). The
  // first-syllable prefix check alone catches "don"/"mal"/"meokda" but not
  // "money" (m ≠ d for 돈).
  if (!prefixes.some((p) => lower.startsWith(p))) return false;
  return true;
}

// Strip trailing/leading metadata parens that some LLM outputs slip into
// target_translation despite the prompt asking for ONE clean lexical item.
// "es (verbo)" → "es", "est (verbe être)" → "est", "soit (subjonctif)" → "soit",
// "Takeshima (islas disputadas)" → "Takeshima", "habla (idioma)" → "habla".
// Conservative: only strip when the paren is at one end (not mid-string,
// where it might be part of a legitimate phrase), and the paren contents are
// shortish and look meta-descriptive (POS labels, register tags, geo
// disambiguation, language names).
function stripTargetMetaParen(text: string): string {
  let s = text.trim();
  if (!s) return s;
  // Strip trailing paren at end if short — POS/register/disambiguation
  s = s.replace(/\s*[\(（][^)）]{1,40}[\)）]\s*$/g, "");
  // Strip leading paren at start if short
  s = s.replace(/^\s*[\(（][^)）]{1,40}[\)）]\s*/g, "");
  return s.trim();
}

// POS-form post-fix: catches LLM omissions where target=ko + pos=verb but the
// translation lacks the -다 ending. The prompt asks for this but mini occasionally
// returns the noun stem ("연구" instead of "연구하다") — deterministic auto-append
// makes the rule reliable. Same idea for adjectives (always -다 citation form).
function fixKoreanVerbAdjForm(text: string, pos: string | undefined): string {
  const t = (text || "").trim();
  if (!t) return t;
  if (!pos) return t;
  const p = pos.toLowerCase().trim();
  // Accept short-form POS tags from wiktionary (adj, v) alongside the spelled
  // forms. Without this the en→ko path skips attributive fixes entirely —
  // wiktionary stores pos="adj" not "adjective".
  const isVerb = p === "verb" || p === "v" || p.startsWith("v5") || p.startsWith("v1") || p === "vi" || p === "vt";
  const isAdj = p === "adjective" || p === "adj" || p.startsWith("adj-");
  if (!isVerb && !isAdj) return t;
  // Already in -다 form (most common variants).
  if (/다$/.test(t)) return t;
  if (/다\.$/.test(t)) return t.replace(/\.$/, ""); // strip trailing period
  // Multi-token (parenthetical or alt-form): leave alone — e.g. "공부 (하다)".
  if (/\s/.test(t) || /[()]/.test(t)) return t;

  // Attributive (관형형) → dictionary form. The LLM sometimes returns the
  // modifier form (밝은, 큰, 가는, 성숙한) instead of citation form (밝다,
  // 크다, 가다, 성숙하다). Transform only the high-confidence cases.
  if (/^[가-힣]+$/.test(t)) {
    const last = t[t.length - 1];
    const base = t.slice(0, -1);
    // X한 (X non-empty) → X하다 (성숙한 → 성숙하다, 약한 → 약하다, 강한 → 강하다)
    if (last === "한" && base.length > 0) return base + "하다";
    // X는 (X non-empty) → X다 (가는 → 가다, 먹는 → 먹다, 하는 → 하다)
    if (last === "는" && base.length > 0) return base + "다";
    // X은 when base ends in a 받침 → X다 (밝은 → 밝다, 익은 → 익다, 좋은 → 좋다)
    if (last === "은" && base.length > 0) {
      const bLast = base[base.length - 1];
      const code = bLast.charCodeAt(0) - 0xAC00;
      if (code >= 0 && code < 11172 && code % 28 !== 0) return base + "다";
    }
    // ㅂ-irregular attributive reversal: 가벼운→가볍다, 감미로운→감미롭다,
    // 무거운→무겁다, 어려운→어렵다, 즐거운→즐겁다, 쉬운→쉽다.
    // Pattern: ...X운 where X has no jongseong → ...X' (add ㅂ jong) + 다.
    // Run before the generic ㄴ-strip so 운 doesn't get sliced to 우.
    if (last === "운" && base.length >= 1) {
      const bLast = base[base.length - 1];
      const bCode = bLast.charCodeAt(0) - 0xAC00;
      if (bCode >= 0 && bCode < 11172 && bCode % 28 === 0) {
        // Promote bLast jongseong from 0 to ㅂ (index 17).
        const newChar = String.fromCharCode(bLast.charCodeAt(0) + 17);
        return base.slice(0, -1) + newChar + "다";
      }
    }
    // Generic ㄴ-jongseong attributive: 큰→크다, 본→보다 (1-char),
    // 예쁜→예쁘다, 모자란→모자라다, 짠→짜다 (multi-char where the final
    // ㄴ rides on the stem's last vowel-final syllable).
    // Skip the explicit 한/는/은 cases (handled above) and 운 (ㅂ-irregular).
    if (last !== "한" && last !== "는" && last !== "은" && last !== "운") {
      const code = last.charCodeAt(0) - 0xAC00;
      if (code >= 0 && code < 11172 && code % 28 === 4) {
        const stripped = String.fromCharCode(0xAC00 + Math.floor(code / 28) * 28);
        return base + stripped + "다";
      }
    }
  }

  // Sino-Korean / 한자어 stems: append -하다 ONLY when the word looks like
  // a typical hanja-derived noun stem ending in a vowel (no jongseong on
  // the last syllable). This covers the common 2-char compounds (점화,
  // 연구, 조사, 사랑) while avoiding false attachments on:
  //   • ㅂ-irregular attributives the LLM occasionally emits (가벼운,
  //     감미로운) — last syllable carries ㄴ jongseong
  //   • Native Korean nouns mis-tagged adjective (갈색, 형편) — last
  //     syllable carries stop-consonant jongseong
  // Some legitimate Sino-Korean stems (성숙, 학습) are skipped by this
  // narrow filter; they'll surface as bare nouns rather than as wrongly
  // verbified words, which is the safer failure mode.
  if (/^[가-힣]{2,3}$/.test(t)) {
    const lastChar = t[t.length - 1];
    const code = lastChar.charCodeAt(0) - 0xAC00;
    if (code >= 0 && code < 11172) {
      const jong = code % 28;
      // jong=0 (no jongseong: 사, 가, 보) or jong=21 (ㅇ: 사랑, 영광, 강)
      // — both are common terminal patterns in Sino-Korean verb stems.
      if (jong === 0 || jong === 21) return t + "하다";
    }
  }
  return t;
}

// English-leak signature in non-English Latin target slots. ONLY catches
// patterns the LLM emits when it gives up on translation:
//   • multi-word English explanatory glosses with English-specific syntax
//     ("to have the skill", "to look forward to") — the "to" + infinitive
//     is English-specific (Romance/German use the infinitive alone).
//   • English function-word labels ("a thing", "the way") — articles + noun
//     phrases like an English textbook would write.
// We deliberately do NOT flag single Latinate words like "abdomen",
// "animal", "plan", "point" because these are valid words in French/
// Italian/Spanish too (the LLM may have legitimately chosen the cognate).
// False-positive on those words drops legitimate translations.
function looksLikeEnglishLeak(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  // "to + verb" infinitive marker is English-specific
  if (/^to\s+\w/.test(lower)) return true;
  // multi-word with semicolons / commas usually means dictionary-style
  // English gloss ("abdomen; belly" → English gloss style)
  if (/[;,]/.test(lower)) {
    const chunks = lower.split(/[;,]/).map((c) => c.trim()).filter(Boolean);
    if (chunks.some((c) => /^to\s+\w/.test(c))) return true;
    // Multi-word with semicolon nearly always indicates English dict-gloss
    // format. Real Romance/German translations are typically single token.
    if (lower.includes(";")) return true;
  }
  // Common English idiom equivalents the LLM substitutes when it can't find
  // a target_lang idiom. These are dead giveaways of an English leak.
  const englishIdiomPatterns = [
    /\btwo birds with one stone\b/,
    /\bkill two birds\b/,
    /\bpiece of cake\b/,
    /\bbreak a leg\b/,
    /\bspill the beans\b/,
    /\bhit the books\b/,
    /\bonce in a blue moon\b/,
    /\bunder the weather\b/,
    /\bcost an arm and a leg\b/,
    /\bbite the bullet\b/,
  ];
  if (englishIdiomPatterns.some((re) => re.test(lower))) return true;
  return false;
}

// Reject obviously-wrong target_translation values that would otherwise leak
// through. The strongest patterns are: (a) the translation is exactly the
// source headword echoed back, (b) the translation script does not match
// the target language's expected script (Hangul translation for a French
// target, etc. — pure script mismatch is unrecoverable garbage).
function translationLooksWrong(
  tr: string, sourceWord: string, sourceLang: string, targetLang: string,
): boolean {
  const t = tr.trim();
  if (!t) return true;
  if (sourceLang === targetLang) return false;
  // Source-word echo (e.g. 커피→fr translation = "커피"): strongest leak.
  // BUT: cross-CJK pairs legitimately share kanji — 学校 (zh-CN) → 学校 (ja)
  // is correct because the word IS the same character in both languages.
  // Only flag source-word echo when source and target use different scripts.
  const cjkLangs = new Set(["ja", "zh", "zh-CN"]);
  const bothCjkShare = cjkLangs.has(sourceLang) && cjkLangs.has(targetLang);
  if (t === sourceWord.trim() && !bothCjkShare) return true;
  // Script mismatch — translation should contain the target lang's script.
  const hasHangul = /[가-힣]/.test(t);
  const hasHiraganaKatakana = /[぀-ゟ゠-ヿ]/.test(t);
  const hasCjkUnified = /[一-鿿]/.test(t);
  const hasLatin = /[a-zA-Z]/.test(t);
  if (targetLang === "ko" && !hasHangul) return true;
  if (targetLang === "ja" && !hasHiraganaKatakana && !hasCjkUnified) return true;
  if (targetLang === "zh-CN" && !hasCjkUnified) return true;
  if (["en", "es", "fr", "de", "it"].includes(targetLang) && !hasLatin) return true;
  // Source-script characters in a Latin target slot. Korean def with
  // apostrophes/punct (e.g. "'나의'가 줄어든 말.") slips past the Latin
  // check above because the apostrophe is Latin punctuation. Reject when
  // any non-target script appears in a Latin target slot.
  if (["en", "es", "fr", "de", "it"].includes(targetLang)) {
    if (hasHangul || hasHiraganaKatakana || hasCjkUnified) return true;
  }
  // Symmetric check for CJK targets: a Latin string MIXED with the source
  // script for a CJK target slot is also wrong.
  if (targetLang === "ko" && (hasHiraganaKatakana || hasCjkUnified) && !hasHangul) return true;
  if (targetLang === "ja" && hasHangul) return true;
  if (targetLang === "zh-CN" && (hasHangul || hasHiraganaKatakana)) return true;
  // English leaking into a non-English Latin target (돈→fr "money", 会→fr
  // "can; to have the skill", 배→it "abdomen; belly").
  if (["es", "fr", "de", "it"].includes(targetLang) && looksLikeEnglishLeak(t)) {
    return true;
  }
  // Meta-category labels for profanity (LLM hedge instead of producing the
  // actual vulgar equivalent). "profanity" / "vulgar insult" / "swear word"
  // are descriptions, not words a learner can use. Reject so the retry path
  // gets a chance to produce a real translation.
  if (looksLikeProfanityMetaLabel(t)) return true;
  return false;
}

// Detects the LLM's safety-hedge output when it refuses to render an actual
// vulgar word and substitutes a category label instead. These labels are
// useless on a learner card — the user looked up the word to learn the
// equivalent, not to be told it is a swear word.
function looksLikeProfanityMetaLabel(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.split(/\s+/).length > 4) return false;
  const metaLabels = [
    // en
    "profanity", "vulgar insult", "vulgar word", "swear word", "swearword",
    "curse word", "curse", "expletive", "offensive word",
    // es
    "maldición vulgar", "palabra vulgar", "insulto vulgar", "palabrota",
    "groseria", "grosería",
    // fr
    "gros mot vulgaire", "gros mot", "insulte vulgaire", "juron",
    // de
    "beleidigendes schimpfwort", "schimpfwort", "fluchwort", "fluch",
    "vulgäres schimpfwort",
    // it
    "parolaccia volgare", "parolaccia", "insulto volgare",
    // ko
    "욕설", "비속어", "욕", "멍청이 욕설", "비속한 말",
    // zh-CN
    "粗话", "脏话", "辱骂", "侮辱词", "粗俗话",
    // ja
    "ののしり言葉", "汚い言葉", "罵り言葉",
  ];
  return metaLabels.includes(t);
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

(3) en_override (string): replace EN with meaningful English when EN is a TRANSLITERATION (romanized spelling of W in Latin letters with no English meaning) rather than a real English gloss. Apply this check aggressively for CJK source languages (Korean / Japanese / Chinese): when EN is an all-Latin string ≤10 characters AND looks like a plausible romanization of W's pronunciation, it IS a transliteration EVEN IF the same letter sequence happens to be a real English word in another context (e.g. "don" is real English but for Korean W="돈" it's romaja, not the Spanish/mafia sense; "mal" is real English but for Korean W="말" it's romaja). Decide based on whether the EN string would serve as a USEFUL learner gloss for W's meaning, not whether the letter sequence exists in some English context. When EN already conveys W's meaning to a monolingual English reader, return "".

(4) pos (string): part of speech for THIS sense in lowercase English (noun / verb / adjective / adverb / interjection / pronoun / proper noun / particle / phrase / numeral / preposition / conjunction / determiner / symbol). When the source dictionary did NOT provide a structural POS (CEDICT for Chinese is the common case), infer from the SOURCE_DEF + EN. Always return a value — empty pos means the card label cannot render. Return the most specific applicable POS.

(5) target_translation (string): the natural TARGET_LANG word/phrase (1-3 words MAX) for this sense.
- Return "" ONLY when SOURCE_LANG equals TARGET_LANG, or when PRE_TARGET is already provided.
- Otherwise ALWAYS produce a TARGET_LANG translation — never return "" just because W is a loanword in TARGET_LANG, never echo W or its romanization, never echo SOURCE_DEF. The TARGET_LANG translation must be in the TARGET_LANG's script using TARGET_LANG vocabulary.
- A recognizable TARGET_LANG lexical item, not a paraphrase. Different senses must take different translations.
- POS-FORM CONSISTENCY: target_translation must be in the lexical FORM that matches the assigned pos for the TARGET_LANG. The card label must be the form a learner would memorize as that POS, not a bare noun stem when the sense is verbal.
  • TARGET_LANG=Korean, pos=verb → use the verbal form ending in -다 (sino-Korean stem + 하다 like "점화하다", "참가하다", "노력하다", "이해하다"; native Korean -다 stem like "먹다", "가다", "오다"). The bare noun stem ("점화", "참가", "노력") is the noun form, not the verb form.
  • TARGET_LANG=Korean, pos=adjective → -다 citation form (큰→크다, 빠른→빠르다).
  • TARGET_LANG=Japanese, pos=verb → dictionary form (-る or -u ending; "勉強する" for suru-verbs, "食べる", "行く"). Bare noun root is the noun form.
  • TARGET_LANG=English/Spanish/French/German/Italian, pos=verb → infinitive form ("to run" / "correr" / "courir" / "laufen" / "correre" for English use "to + base form"; Romance/German use the infinitive; do not output the gerund/participle as the card label).
  • TARGET_LANG=zh-CN, pos=verb → the bare verbal form is fine (Chinese verbs don't inflect for citation).
- For grammatical particles / function words / bound morphemes (Korean 조사, Japanese 助詞, Chinese 助词): never echo the dictionary definition — output a SHORT learner-card label ("topic marker", "object marker", "past tense", …), 1-3 words MAX.
- For real public figures (politicians/world leaders/celebrities/historical figures): output just the full name in TARGET_LANG using the TARGET_LANG's standard transliteration/translation of that name (e.g. for "Yoon Suk-yeol": output the romanized name when TARGET_LANG uses Latin script, or the established CJK rendering when TARGET_LANG is ja/zh-CN). Never leave the name in the source script. Do NOT include biographical commentary, dates, or titles in the target_translation field — just the name itself.
- For general profanity / swear words / vulgar interjections / casual derogatory terms (not the HARD-CUT categories above): output the ACTUAL equivalent vulgar word in TARGET_LANG that a native speaker would shout in the same context. Never output a meta-category label like "profanity", "vulgar insult", "swear word", "curse", "maldición vulgar", "parolaccia volgare", "gros mot vulgaire", "beleidigendes Schimpfwort", "욕설", "粗话" — the user looked up this word to learn the actual equivalent, not to be told the category.

Output strict JSON (id is the integer from the input, no other keys):
{
  "results": [
    { "id": <int>, "frequency_score": <0-100>, "branch": <int>, "en_override": "<...>", "pos": "<...>", "target_translation": "<...>" }
  ]
}`;

interface UnifiedItem {
  id: number | string;
  frequency_score: number;
  branch?: number;
  en_override?: string;
  pos?: string;
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
  const posByIdx: Record<string, string> = {};
  resp.results?.forEach((r, ord) => {
    const key = String(r.id);
    signalByIdx[key] = {
      score: r.frequency_score,
      branch: typeof r.branch === "number" ? r.branch : 1000 + ord,
    };
    const ov = (r.en_override ?? "").trim();
    if (ov && !isLikelyRomanization(ov, word)) overrideByIdx[key] = ov;
    const rawTr = stripTargetMetaParen((r.target_translation ?? "").trim());
    const pos = (r.pos ?? "").trim();
    if (pos) posByIdx[key] = pos;
    // Korean -다 auto-append for verb/adjective senses where LLM dropped it.
    const tr = targetLang === "ko" ? fixKoreanVerbAdjForm(rawTr, pos) : rawTr;
    if (tr && !translationLooksWrong(tr, word, sourceLang, targetLang)) transByIdx[key] = tr;
  });

  const keptReps = selectKept(allSenses, signalByIdx, sourceLang, entries[0]?.source);

  // Escalation pass: for non-EN target, when the mini judge failed to produce
  // a target_translation (LLM echoed source word or returned English), retry
  // ONLY those senses with gpt-4.1 + a focused prompt. Single batched call —
  // adds latency only when needed.
  if (targetLang !== "en" && keptReps.length > 0) {
    const missingSenses: Array<{ idx: number; sense: DictSense }> = [];
    for (const r of keptReps) {
      const key = String(r.idx);
      const haveTarget = !!transByIdx[key];
      const havePrefill = !!prefillTranslation(r.sense, targetLang);
      if (!haveTarget && !havePrefill) missingSenses.push({ idx: r.idx, sense: r.sense });
    }
    if (missingSenses.length > 0) {
      const retryPrompt =
        `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
        `W="${word}"\n` +
        `For each sense, output ONE TARGET_LANG learner-card label (1-3 words). REQUIREMENTS:\n` +
        `- TARGET_LANG's everyday colloquial word for this concept (the word a native TARGET_LANG speaker would use in casual conversation), NOT the formal/medical/Latinate cognate when an everyday word exists.\n` +
        `- TARGET_LANG's script + vocabulary. Never echo W or its romanization.\n` +
        `- POS-form match: Korean verb → -다 form ("점화하다", not "점화"); Romance/German verb → infinitive ("courir", not "court"); Japanese verb → -る form.\n` +
        `Senses:\n` +
        missingSenses.map(({ idx, sense }) =>
          `- id=${idx}  POS=${sense.pos ?? ""}  EN=${sense.en_translation ?? ""}  DEF=${sense.source_def.slice(0, 120)}`,
        ).join("\n") + `\n\nOutput strict JSON:\n{ "translations": [{ "id": <int>, "target": "<TARGET_LANG label>" }] }`;
      try {
        const retryResp = (await openaiCall(
          "You translate vocabulary card labels precisely. Always return target_lang in target_lang's script. Never echo source.",
          retryPrompt,
          "gpt-4.1",
        )) as { translations?: Array<{ id: number | string; target?: string }> };
        for (const t of retryResp.translations ?? []) {
          const key = String(t.id);
          const rawTr = stripTargetMetaParen((t.target ?? "").trim());
          const sense = missingSenses.find((s) => String(s.idx) === key)?.sense;
          const pos = posByIdx[key] || (sense?.pos ?? "");
          const tr = targetLang === "ko" ? fixKoreanVerbAdjForm(rawTr, pos) : rawTr;
          if (tr && !translationLooksWrong(tr, word, sourceLang, targetLang)) {
            transByIdx[key] = tr;
          }
        }
      } catch (err) {
        console.warn(`[v4 retry] gpt-4.1 escalation failed for ${word}→${targetLang}: ${(err as Error).message}`);
      }
    }
  }

  // POS-only retry — when the source dict didn't carry POS (cedict, neologism)
  // AND mini's unified judge skipped the pos field for some senses, fire a
  // cheap mini call asking for POS only. Avoids "(- )" labels on cards.
  const dictSource = entries[0]?.source;
  if (dictSource === "cedict") {
    const missingPos = keptReps.filter((r) => {
      const key = String(r.idx);
      return !r.sense.pos && !posByIdx[key];
    });
    if (missingPos.length > 0) {
      const posPrompt =
        `SOURCE_LANG=${langName(sourceLang)}\nW="${word}"\n` +
        `For each sense below, output the part of speech in lowercase English (noun / verb / adjective / adverb / interjection / pronoun / proper noun / particle / phrase / numeral / preposition / conjunction / determiner). Always return a value.\n` +
        `Senses:\n` +
        missingPos.map((r) =>
          `- id=${r.idx}  EN=${(r.sense.en_translation ?? "").slice(0, 80)}  DEF=${r.sense.source_def.slice(0, 120)}`,
        ).join("\n") +
        `\n\nOutput strict JSON:\n{ "results": [{ "id": <int>, "pos": "<English POS>" }] }`;
      try {
        const posResp = (await openaiCall(
          "You assign part-of-speech labels to dictionary senses. Be concise.",
          posPrompt,
          MODEL_QUALITY,
        )) as { results?: Array<{ id: number | string; pos?: string }> };
        for (const r of posResp.results ?? []) {
          const key = String(r.id);
          const pos = (r.pos ?? "").trim();
          if (pos) posByIdx[key] = pos;
        }
      } catch (err) {
        console.warn(`[v4 pos-retry] failed for ${word}: ${(err as Error).message}`);
      }
    }
  }

  return keptReps
    .map((r) => {
      const key = String(r.idx);
      const prefill = prefillTranslation(r.sense, targetLang);
      const overrideEn = overrideByIdx[key];
      // LLM-inferred POS sits in two slots:
      //   • `pos` is overwritten only when the source dict didn't carry one
      //     (CEDICT case) so dict-supplied POS stays authoritative for
      //     well-tagged sources (krdict / jmdict / wiktionary).
      //   • `llm_pos` always carries the LLM's reading as a backup field
      //     used downstream (e.g. when dict POS maps to "expression"/"symbol"
      //     and we want a more learner-friendly label).
      const sense = !r.sense.pos && posByIdx[key]
        ? { ...r.sense, pos: posByIdx[key], llm_pos: posByIdx[key] }
        : { ...r.sense, llm_pos: posByIdx[key] };
      // Display chain for EN target: prefer overrideEn over prefill, because
      // prefill comes from sense.en_translation (which may be a romanization
      // the override is correcting). For non-EN target, prefill is the proper
      // target_lang gloss and wins.
      const displayTrans = (targetLang === "en" && overrideEn)
        ? overrideEn
        : (prefill ?? transByIdx[key]);
      return {
        sense,
        score: r.score,
        reasoning: "",
        en_override: overrideEn,
        display_translation: displayTrans,
      } as JudgedSense;
    })
    // Final defense — drop senses whose user-visible label is unusable:
    //   • Romanization leak (override or dict gloss is just romaja: 돈→"don")
    //   • Source-script leak in en_translation (krdict ships the Korean
    //     definition when no English gloss exists: 내→"'나의'가 줄어든 말.")
    .filter((j) => {
      const candidates = [j.en_override, j.sense.en_translation, j.display_translation].filter((s): s is string => !!s);
      if (candidates.length === 0) return false;
      // For Korean source + en target: drop if en_translation is itself
      // Hangul text (krdict fallback for senses without English glosses).
      if (sourceLang === "ko" && targetLang === "en" &&
          j.sense.en_translation && /[가-힣]/.test(j.sense.en_translation) &&
          !(j.en_override && j.en_override.trim().length > 0) &&
          !(j.display_translation && !/[가-힣]/.test(j.display_translation))) {
        return false;
      }
      // If EVERY candidate label is a romanization leak, drop the sense.
      return !candidates.every((c) => isDictRomanizationLeak(c, sourceLang, word));
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
    if (pre) {
      k.display_translation = targetLang === "ko" ? fixKoreanVerbAdjForm(pre, k.sense.pos) : pre;
    } else {
      needsTranslate.push(i);
    }
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
    if (ov && k && !isLikelyRomanization(ov, word)) k.en_override = ov;
  }
  if (translateResp) {
    for (const t of translateResp.translations ?? []) {
      const raw = stripTargetMetaParen((t.translation ?? "").trim());
      const k = kept[Number(t.id)];
      if (!raw || !k) continue;
      const v = targetLang === "ko" ? fixKoreanVerbAdjForm(raw, k.sense.pos) : raw;
      if (!translationLooksWrong(v, word, sourceLang, targetLang)) k.display_translation = v;
    }
  }

  // POS retry for cedict (no structural POS in source dict) — judgeAndTranslate
  // didn't ask for pos in any of its calls, so cards would show "(- )" without
  // this. Same idea as the POS retry in judgeUnifiedSingle.
  if (entries[0]?.source === "cedict") {
    const missingPosIdx = kept
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => !k.sense.pos);
    if (missingPosIdx.length > 0) {
      const posPrompt =
        `SOURCE_LANG=${langName(sourceLang)}\nW="${word}"\n` +
        `For each sense below, output the part of speech in lowercase English (noun / verb / adjective / adverb / interjection / pronoun / proper noun / particle / phrase / numeral / preposition / conjunction / determiner). Always return a value.\n` +
        `Senses:\n` +
        missingPosIdx.map(({ k, i }) =>
          `- id=${i}  EN=${(k.sense.en_translation ?? "").slice(0, 80)}  DEF=${k.sense.source_def.slice(0, 120)}`,
        ).join("\n") +
        `\n\nOutput strict JSON:\n{ "results": [{ "id": <int>, "pos": "<English POS>" }] }`;
      try {
        const posResp = (await openaiCall(
          "You assign part-of-speech labels to dictionary senses. Be concise.",
          posPrompt,
          MODEL_QUALITY,
        )) as { results?: Array<{ id: number | string; pos?: string }> };
        for (const r of posResp.results ?? []) {
          const i = Number(r.id);
          const pos = (r.pos ?? "").trim();
          if (pos && kept[i]) {
            kept[i].sense = { ...kept[i].sense, pos, llm_pos: pos };
          }
        }
      } catch (err) {
        console.warn(`[v4 pos-retry j&t] failed for ${word}: ${(err as Error).message}`);
      }
    }
  }

  // Drop romanization-leak senses (CJK dict shipped EN as romaja, LLM didn't
  // override or echoed the romanization). Same defense as judgeUnifiedSingle.
  return kept.filter((j) => {
    const candidates = [j.en_override, j.sense.en_translation, j.display_translation].filter((s): s is string => !!s);
    if (candidates.length === 0) return false;
    return !candidates.every((c) => isDictRomanizationLeak(c, sourceLang, word));
  });
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
- DROP archaic, obsolete, historical, highly technical/jargon, and rare or regional senses. Proper-name senses are KEPT only when W is itself a real public figure / place / work a learner would plausibly meet (see PUBLIC FIGURE RULE below); otherwise drop proper-name uses.
- Order by everyday frequency, most common first. Return 2-4 cards in almost all cases; allow a 5th only for a genuinely rich word. Prefer FEWER, broader cards over many narrow ones.

PUBLIC FIGURE / DISPUTED TOPIC RULE — NEUTRAL CARDS:
- When a sense identifies a real politician, world leader, monarch, public official, celebrity, athlete, author, or other public figure, render target_translation as just the full name in TARGET_LANG (e.g. "조 바이든", "Donald Trump", "Xi Jinping") with NO biographical commentary. The "en" label is a brief neutral descriptor: full name + role + country/affiliation only, no controversies, no party framing, no current-events opinion. Limit to ONE merged card for the figure.
- For contested place names / historical events / geopolitical disputes: present the term in neutral textbook tone, as a learner of SOURCE_LANG would encounter it in standard textbooks. Do not insert advocacy. Use the established TARGET_LANG name for the SPECIFIC place referenced (e.g. 钓鱼岛 = Diaoyu Islands = 댜오위다오 / 釣魚島 / Senkaku Islands depending on the TARGET_LANG convention; Dokdo 독도 is a DIFFERENT disputed territory and must NEVER be used as the translation for 钓鱼岛). When unsure of the established TARGET_LANG name, use phonetic transliteration of the source name rather than substituting a different territory's name.

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

  // Strip the meta-category prefix some models prepend to translations of
  // idioms / set phrases ("idiom, substitute", "expression: …", "phrase - …").
  // The learner card needs the lexical item only.
  const stripMetaPrefix = (s: string) => {
    let out = s
      .replace(/^(?:idiom|expression|phrase|proverb|saying|colloq(?:uialism)?|slang)\s*[,:.\-]\s*/i, "")
      .trim();
    // "idiom 'X'" / "idiom meaning 'X'" / "expression \"X\"" — strip the
    // meta tag (with optional "meaning"/"for"/"that means" connector) and
    // keep only the quoted content. Greedy capture so the closing quote
    // binds to the LAST quote in the string (the inner apostrophe in
    // "don't" must not terminate early).
    const quoted = out.match(/^(?:idiom|expression|phrase|proverb|saying|colloq(?:uialism)?|slang)(?:\s+(?:meaning|for|that\s+means))?\s+['"“”‘’](.+)['"“”‘’]\s*$/i);
    if (quoted) out = quoted[1].trim();
    // "to ruin sth by ..." / "to do sth" — expand the dictionary abbreviation
    // "sth" (= something) so the card text reads naturally.
    out = out.replace(/\bsth\b/g, "something").replace(/\bsb\b/g, "someone");
    return out;
  };

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
    const enLabel = stripMetaPrefix((m.en ?? "").trim());
    const rawTr = stripTargetMetaParen(stripMetaPrefix((m.target_translation ?? "").trim()));
    const rawPrefill = prefillTranslation(sense, targetLang);
    // Korean target: convert attributive forms (밝은, 큰, 가는, 성숙한)
    // and bare Sino-Korean stems (연구, 사랑) to dictionary -다 form.
    const tr = targetLang === "ko" ? fixKoreanVerbAdjForm(rawTr, sense.pos) : rawTr;
    const prefill = targetLang === "ko" && rawPrefill
      ? fixKoreanVerbAdjForm(rawPrefill, sense.pos)
      : rawPrefill;
    // Drop wrong-script labels (LLM returned 생명 for fr, 学校 for en, etc.).
    // Apply to the chosen display value, mirroring the defense in
    // judgeUnifiedSingle/judgeAndTranslate.
    const candidate = prefill ?? (tr || undefined);
    if (candidate && translationLooksWrong(candidate, word, sourceLang, targetLang)) {
      return; // skip this sense — no usable target label
    }
    out.push({
      sense,
      score: 100 - rank, // synthetic: preserve the model's frequency ordering
      reasoning: "",
      en_override: enLabel || undefined,
      display_translation: candidate,
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

// ────────────────────────────────────────────────────────────────────────
// translateCanonicalMeanings — target-only translation for already-judged
// canonical senses. Use when word_entries.meanings exists for a given (word,
// source_lang) but no word_translations row for the requested target_lang.
// Bypasses dict + judge entirely: takes the canonical's authoritative sense
// list as-is and produces ONLY TARGET_LANG translations. This is what
// guarantees the "decide meanings once per source word, share across all
// target_langs" architectural promise. Returns a Map<sense_id, target_text>.
// ────────────────────────────────────────────────────────────────────────
export interface CanonicalMeaningInput {
  sense_id: string;
  en_translation?: string;
  source_def: string;
  pos?: string;
}

const TRANSLATE_CANONICAL_MEANINGS_SYSTEM = `You translate vocabulary card labels for a multilingual learning dictionary. Each input sense has the headword W (in SOURCE_LANG), an existing English gloss EN, and the source-language definition DEF. For each sense, produce ONE short TARGET_LANG learner-card label (1-3 words) AND its part of speech.

Rules for "target":
- Output MUST be in TARGET_LANG's script using TARGET_LANG vocabulary. Never echo W (the source headword) or its romanization. Never echo EN. Never echo SOURCE_DEF.
- Different senses must take different translations (the labels are distinguishing cards).
- POS-FORM CONSISTENCY: target must be in the lexical FORM matching the assigned pos for TARGET_LANG.
  • TARGET_LANG=Korean, pos=verb → verbal form ending in -다 (sino-Korean: "점화하다", "참가하다", "노력하다", "이해하다"; native: "먹다", "가다"). The bare noun stem (점화/참가/노력) is the NOUN form, not the verb form — wrong for a verb card.
  • TARGET_LANG=Korean, pos=adjective → -다 citation form (크다, 빠르다).
  • TARGET_LANG=Japanese, pos=verb → dictionary form (-る/-u; "勉強する", "食べる").
  • TARGET_LANG=English/Spanish/French/German/Italian, pos=verb → infinitive ("to run" / "correr" / "courir" / "laufen" / "correre").
  • TARGET_LANG=zh-CN, pos=verb → bare verbal form (Chinese verbs don't inflect).
- For grammatical particles / function words / bound morphemes: output a short learner-card label ("topic marker", "object marker", "past tense", etc.).
- For real public figures (politicians/celebrities/historical figures): output just the full name in TARGET_LANG's standard transliteration ("조 바이든" for ko, "Donald Trump" for en/es/fr/de/it, "尹錫悦" for ja, "尹锡悦" for zh-CN).
- For loanwords or neologisms where the same letters could be intended: write the locally-standard rendering, never the raw source spelling.

Rules for "pos":
- Lowercase English POS label: noun / verb / adjective / adverb / interjection / pronoun / proper noun / particle / phrase / numeral / preposition / conjunction / determiner / symbol.
- Always return a value — if input POS is empty, infer from SOURCE_DEF + EN.

Output strict JSON:
{
  "translations": [
    { "id": <int>, "target": "<TARGET_LANG label>", "pos": "<English POS>" }
  ]
}`;

export interface TranslatedMeaning {
  target: string;
  pos?: string;
}

export async function translateCanonicalMeanings(
  word: string,
  meanings: CanonicalMeaningInput[],
  sourceLang: string,
  targetLang: string,
): Promise<Map<string, TranslatedMeaning>> {
  const out = new Map<string, TranslatedMeaning>();
  if (meanings.length === 0 || sourceLang === targetLang) return out;
  const userPrompt =
    `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
    `W="${word}"\n` +
    `Senses:\n` +
    meanings.map((m, i) =>
      `- id=${i}  EN=${(m.en_translation ?? "").slice(0, 80)}  DEF=${m.source_def.slice(0, 120)}  POS=${m.pos ?? ""}`,
    ).join("\n");
  let resp: { translations?: Array<{ id: number | string; target?: string; pos?: string }> };
  try {
    resp = (await openaiCall(TRANSLATE_CANONICAL_MEANINGS_SYSTEM, userPrompt, MODEL_QUALITY)) as typeof resp;
  } catch (err) {
    console.warn(`[translateCanonicalMeanings] HTTP error: ${(err as Error).message}`);
    return out;
  }
  for (const r of resp.translations ?? []) {
    const idx = Number(r.id);
    const rawTr = stripTargetMetaParen((r.target ?? "").trim());
    if (!rawTr || idx < 0 || idx >= meanings.length) continue;
    const pos = (r.pos ?? "").trim() || meanings[idx].pos || undefined;
    const tr = targetLang === "ko" ? fixKoreanVerbAdjForm(rawTr, pos) : rawTr;
    if (translationLooksWrong(tr, word, sourceLang, targetLang)) continue;
    out.set(meanings[idx].sense_id, { target: tr, pos });
  }
  return out;
}

// gpt-4.1 escalation for translateCanonicalMeanings — fires when the mini
// pass dropped a sense (LLM echoed source word, returned English, etc.).
// Same fallback pattern as judgeUnifiedSingle's escalation.
export async function translateCanonicalMeaningsRetry(
  word: string,
  meanings: CanonicalMeaningInput[],
  sourceLang: string,
  targetLang: string,
): Promise<Map<string, TranslatedMeaning>> {
  const out = new Map<string, TranslatedMeaning>();
  if (meanings.length === 0 || sourceLang === targetLang) return out;
  const userPrompt =
    `SOURCE_LANG=${langName(sourceLang)}  TARGET_LANG=${langName(targetLang)}\n` +
    `W="${word}"\n` +
    `For each sense, output ONE TARGET_LANG learner-card label (1-3 words). REQUIREMENTS:\n` +
    `- TARGET_LANG's everyday colloquial word, NOT formal/medical/Latinate cognate when an everyday word exists.\n` +
    `- TARGET_LANG's script + vocabulary. Never echo W or its romanization. Never echo EN or DEF.\n` +
    `- POS-form match: Korean verb pos → -다 form ("점화하다", not "점화"); Romance/German verb pos → infinitive; Japanese verb pos → -る form.\n` +
    `Senses:\n` +
    meanings.map((m, i) =>
      `- id=${i}  POS=${m.pos ?? ""}  EN=${(m.en_translation ?? "").slice(0, 80)}  DEF=${m.source_def.slice(0, 120)}`,
    ).join("\n") +
    `\n\nOutput strict JSON:\n{ "translations": [{ "id": <int>, "target": "<TARGET_LANG label>", "pos": "<English POS>" }] }`;
  let resp: { translations?: Array<{ id: number | string; target?: string; pos?: string }> };
  try {
    resp = (await openaiCall(
      "You translate vocabulary card labels precisely. Always return target_lang in target_lang's script. Never echo source.",
      userPrompt,
      "gpt-4.1",
    )) as typeof resp;
  } catch (err) {
    console.warn(`[translateCanonicalMeaningsRetry] HTTP error: ${(err as Error).message}`);
    return out;
  }
  for (const r of resp.translations ?? []) {
    const idx = Number(r.id);
    const rawTr = stripTargetMetaParen((r.target ?? "").trim());
    if (!rawTr || idx < 0 || idx >= meanings.length) continue;
    const pos = (r.pos ?? "").trim() || meanings[idx].pos || undefined;
    const tr = targetLang === "ko" ? fixKoreanVerbAdjForm(rawTr, pos) : rawTr;
    if (translationLooksWrong(tr, word, sourceLang, targetLang)) continue;
    out.set(meanings[idx].sense_id, { target: tr, pos });
  }
  return out;
}
