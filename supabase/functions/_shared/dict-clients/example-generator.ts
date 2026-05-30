// Example sentence generator for v4 dict-first pipeline.
// -----------------------------------------------------------
// Goal: produce ONE high-quality example sentence + translation per sense.
// Operates on every source language (ko / ja / zh-CN / en / es / fr / de / it).
//
// Nine quality elements (2026-05-25 design):
//   1. Per-meaning parallel calls  — one OpenAI call per sense (caller fans out)
//   2. Dual anchoring               — sense def AND target gloss both in prompt
//   3. Scene anchor randomization   — defeats stereotypical-scene attractors
//   4. Headword marker              — **W** wraps the surface form
//   5. Length & level guard         — 6-14 words (latin) / 8-16 chars (CJK)
//   6. Single-call sentence+translation — alignment baked in
//   7. Post-process validation      — markers, length, headword presence
//   8. Two-tier model fallback     — gpt-4.1-mini first; gpt-4.1 on validation fail
//   9. Source tag                   — caller marks each example { source: 'llm' }
//
// Caller passes the sense (with sense.source_def and a target gloss). This
// module is intentionally headword/sense-agnostic so it works uniformly across
// the 8 supported source languages.
//
// 정책 참조:
//   [[feedback_per_meaning_parallel_examples]]
//   [[project_polysemy_alignment_architecture]]
//   [[feedback_scene_anchor_diversity]]
//   [[feedback_prompting_no_examples]] — 추상 규칙만, listing 금지

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const MODEL_PRIMARY = "gpt-4.1-mini";
const MODEL_FALLBACK = "gpt-4.1";

const CJK_LANGS = new Set(["ko", "ja", "zh", "zh-CN"]);
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

// 24 generic scene cues. The model uses ONE per call as a context tilt to
// avoid converging on stereotype scenes (fruit → market, plane → airport).
// Phrased as broad situations, not vocabulary leakage.
const SCENE_ANCHORS = [
  "a casual conversation between two close friends",
  "an early-morning routine before leaving home",
  "an unexpected moment during a commute",
  "a quiet evening alone at home",
  "a family gathering around a meal",
  "a workplace exchange between colleagues",
  "a customer-service interaction",
  "a late-night text message to someone close",
  "a weekend outing in an unfamiliar neighborhood",
  "a brief moment of frustration in everyday life",
  "a parent-child interaction at home",
  "a small celebration among acquaintances",
  "a chance encounter with an old acquaintance",
  "a moment of quiet reflection",
  "a phone call with a relative",
  "a small daily decision someone is weighing",
  "a study session or self-improvement moment",
  "a brief story someone shares about their week",
  "an everyday errand running slightly off plan",
  "an online comment or chat exchange",
  "a comment overheard on public transport",
  "an unexpected piece of news shared in conversation",
  "a small gesture of kindness between strangers",
  "a moment of indecision before a small purchase",
];

function pickSceneAnchor(): string {
  return SCENE_ANCHORS[Math.floor(Math.random() * SCENE_ANCHORS.length)];
}

const EXAMPLE_SYSTEM = `You write ONE example sentence for a language-learning vocabulary card.

You receive:
- W: the headword (in SOURCE_LANG)
- SOURCE_LANG: language of W and the example sentence
- TARGET_LANG: language of the translation
- SENSE_DEF: a short English definition pinning the SPECIFIC sense to illustrate
- TARGET_GLOSS: the short TARGET_LANG vocabulary-card label for this sense
- SCENE_ANCHOR: a broad situational context to vary the scene (NOT a vocabulary instruction — do not name it literally)

Requirements for the SOURCE_LANG sentence:
1. Length: 6 to 14 words for Latin-script languages; 8 to 16 characters for CJK languages. ONE sentence.
2. Must illustrate THIS specific sense unambiguously — not a different sense of the same word, not a meta usage.
3. Surrounding vocabulary at or below the headword's familiarity level. Avoid rare, technical, or formal words around W.
4. Grammar fully natural and unambiguous to a native speaker of SOURCE_LANG.
5. Wrap the actual surface form of W as it appears in the sentence (inflected / conjugated / declined as needed) in DOUBLE ASTERISKS: **W**. Exactly one opening **, one closing **. Mark nothing else.
   - The wrap must contain ONLY the headword's surface form. Grammatical particles that follow the headword and form a separate syntactic unit attach OUTSIDE the wrap as plain text. This applies to:
     • Korean nominal 조사 (격조사, 보조사, 접속조사) — subject/object markers, postpositions, focus/limit markers, conjunctive markers after nouns, pronouns, numerals.
     • Japanese 助詞 attached to nouns/pronouns — case, topic, postpositional, focus, conjunctive, terminal interactional particles.
     • Chinese 助词 (structural / aspectual / modal) — they always attach outside the marker.
     • Chained particle stacks (multiple particles in sequence after a noun) — the entire chain stays OUTSIDE the wrap.
   - For VERBS and ADJECTIVES (and other POS whose inflected ending is part of the lexeme, not a separable particle), wrap the FULL inflected form together — stem + ending stays inside the marker as one unit. Do not split a verb stem from its conjugation.
   - For derivational SUFFIXES that never appear standalone (plural / honorific / nominalizers fused to the host), keep host + suffix together inside the wrap.
6. Let the SCENE_ANCHOR loosely flavor the situation — never quote it, never list its keywords as nouns.

Requirements for the TARGET_LANG translation:
- Natural, idiomatic translation of the entire sentence (not word-for-word).
- Plain prose with NO markers. Do NOT add \`**...**\` anywhere in the translation. The learning card highlights only the SOURCE sentence; the translation is read as normal text.
- If TARGET_GLOSS reads like a dictionary definition (contains words like "particle", "marker", "indicating", parenthetical explanations, or is longer than 3 words), do NOT echo it verbatim. Produce a natural translation that conveys the meaning without inserting the definition as a literal phrase.
- ONE sentence.

Output strict JSON:
{
  "sentence": "<SOURCE_LANG sentence with **W** marker>",
  "translation": "<TARGET_LANG natural translation>"
}`;

interface ExampleResponse {
  sentence: string;
  translation: string;
}

export interface ExampleRequest {
  /** Unique key for the caller to map back (e.g. group en_key or sense_id). */
  key: string;
  /** Headword in SOURCE_LANG. */
  word: string;
  /** Surface form variants accepted in the sentence (for CJK / morphology tolerance). */
  surfaceForms?: string[];
  /** English definition of THIS sense (anchor 1). */
  senseDef: string;
  /** TARGET_LANG short gloss for this sense (anchor 2). */
  targetGloss: string;
}

export interface GeneratedExample {
  sentence: string;
  translation: string;
  /** "llm" — this generator always tags llm. krdict dict examples use their own tag upstream. */
  source: "llm";
}

async function callOpenai(model: string, userMessage: string): Promise<ExampleResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: EXAMPLE_SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4, // mild variation; deterministic temperature collapses scene/style
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  const parsed = JSON.parse(body.choices[0].message.content) as ExampleResponse;
  return parsed;
}

// ────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────
function countMarkers(s: string): number {
  return (s.match(/\*\*/g) ?? []).length;
}

function stripMarkers(s: string): string {
  return s.replace(/\*\*/g, "");
}

function lengthOk(s: string, sourceLang: string): boolean {
  const plain = stripMarkers(s).trim();
  if (CJK_LANGS.has(sourceLang)) {
    // Char count for CJK (excluding spaces/punct lightly)
    const len = Array.from(plain.replace(/\s+/g, "")).length;
    return len >= 6 && len <= 22;
  }
  const wordCount = plain.split(/\s+/).filter(Boolean).length;
  return wordCount >= 5 && wordCount <= 20;
}

function markedSpan(s: string): string | null {
  const m = s.match(/\*\*([^*]+)\*\*/);
  return m ? m[1] : null;
}

function headwordPresent(
  sentence: string,
  word: string,
  surfaceForms: string[] | undefined,
  sourceLang: string,
): boolean {
  // The marked span must reasonably correspond to the headword (or an accepted variant).
  const span = markedSpan(sentence);
  if (!span) return false;
  const candidates = [word, ...(surfaceForms ?? [])].map((s) => s.trim()).filter(Boolean);
  const s = span.trim();

  if (CJK_LANGS.has(sourceLang)) {
    // CJK languages: headwords often conjugate/decline (ko verbs 가다 → 가요/갔어요;
    // ja verbs 食べる → 食べた; zh much less so but possible compounding).
    // Heuristic: accept if the headword's stem (≥1 character) is a prefix of the span,
    // OR the span is a prefix of the headword. This catches:
    //   ko 가다 (stem 가) → 갔/가/갈/갑 all start with 가 ✅
    //   ja 食べる (stem 食べ) → 食べた/食べます/食べ ✅
    //   zh 漂亮 → 漂亮/漂 ✅
    // Stripping trailing "다" from ko verbs/adj is the most common case; we generalize
    // by trying both the full headword AND its first-N-character prefix.
    for (const w of candidates) {
      if (w.length === 0) continue;
      // Try full word match (substring either direction).
      if (s.includes(w) || w.includes(s)) return true;
      // Try stem (drop trailing 다 for ko; otherwise drop last 1 char).
      const stemLen = w.endsWith("다") ? w.length - 1 : Math.max(1, w.length - 1);
      const stem = w.slice(0, stemLen);
      if (stem.length >= 1 && s.startsWith(stem)) return true;
      // First character fallback (very loose — but for 1-char CJK heads this is the only check).
      if (s.length > 0 && w.length > 0 && s.charAt(0) === w.charAt(0)) return true;
    }
    return false;
  }

  // Latin-script languages: case-insensitive substring match either direction.
  // Also strip common inflection (English -s/-ed/-ing, Romance -e/-o/-a) at end.
  const sLower = s.toLowerCase();
  for (const w of candidates) {
    const wLower = w.toLowerCase();
    if (sLower.includes(wLower) || wLower.includes(sLower)) return true;
    // Stem: drop last 1-3 chars from the headword and check prefix.
    for (let drop = 1; drop <= 3 && wLower.length - drop >= 3; drop++) {
      const stem = wLower.slice(0, wLower.length - drop);
      if (sLower.startsWith(stem)) return true;
    }
  }
  return false;
}

function validate(
  resp: ExampleResponse,
  req: ExampleRequest,
  sourceLang: string,
  targetLang: string,
): { ok: boolean; reason?: string } {
  if (!resp.sentence || !resp.translation) return { ok: false, reason: "empty" };
  const sourceMarkers = countMarkers(resp.sentence);
  if (sourceMarkers !== 2) return { ok: false, reason: `source_marker=${sourceMarkers}` };
  if (!lengthOk(resp.sentence, sourceLang)) return { ok: false, reason: "length" };
  if (!headwordPresent(resp.sentence, req.word, req.surfaceForms, sourceLang)) {
    return { ok: false, reason: "headword_missing" };
  }
  if (resp.translation.trim().length < 2) return { ok: false, reason: "translation_too_short" };
  // Translation is plain prose — no markers required (or allowed). The
  // learning card highlights only the source sentence.
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// Single-example generation with fallback
// ────────────────────────────────────────────────────────────────────────
async function generateOne(
  req: ExampleRequest,
  sourceLang: string,
  targetLang: string,
): Promise<GeneratedExample | null> {
  const userMessage =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `TARGET_LANG=${langName(targetLang)}\n` +
    `W="${req.word}"\n` +
    `SENSE_DEF=${req.senseDef}\n` +
    `TARGET_GLOSS=${req.targetGloss}\n` +
    `SCENE_ANCHOR=${pickSceneAnchor()}`;

  // Tier 1: gpt-4.1-mini
  try {
    const r = await callOpenai(MODEL_PRIMARY, userMessage);
    const v = validate(r, req, sourceLang, targetLang);
    if (v.ok) {
      return { sentence: r.sentence, translation: r.translation.replace(/\*\*/g, "").trim(), source: "llm" };
    }
    console.warn(`[example-gen] mini validation fail (${v.reason}) for "${req.word}" — retry with gpt-4.1`);
  } catch (err) {
    console.warn(`[example-gen] mini call error for "${req.word}": ${(err as Error).message}`);
  }

  // Tier 2: gpt-4.1 (full) — re-roll a fresh scene anchor
  const userMessage2 =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `TARGET_LANG=${langName(targetLang)}\n` +
    `W="${req.word}"\n` +
    `SENSE_DEF=${req.senseDef}\n` +
    `TARGET_GLOSS=${req.targetGloss}\n` +
    `SCENE_ANCHOR=${pickSceneAnchor()}`;
  try {
    const r = await callOpenai(MODEL_FALLBACK, userMessage2);
    const v = validate(r, req, sourceLang, targetLang);
    if (v.ok) {
      return { sentence: r.sentence, translation: r.translation.replace(/\*\*/g, "").trim(), source: "llm" };
    }
    console.warn(`[example-gen] full validation fail (${v.reason}) for "${req.word}"`);
  } catch (err) {
    console.warn(`[example-gen] full call error for "${req.word}": ${(err as Error).message}`);
  }
  return null;
}

/**
 * Generate examples for multiple senses in parallel (one per request).
 * Returns a Map keyed by ExampleRequest.key.
 */
export async function generateExamples(
  reqs: ExampleRequest[],
  sourceLang: string,
  targetLang: string,
): Promise<Map<string, GeneratedExample>> {
  const out = new Map<string, GeneratedExample>();
  if (reqs.length === 0) return out;
  const results = await Promise.all(reqs.map((r) => generateOne(r, sourceLang, targetLang)));
  reqs.forEach((r, i) => {
    const g = results[i];
    if (g) out.set(r.key, g);
  });
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// translateCanonicalSentences — canonical 재사용 path
// ────────────────────────────────────────────────────────────────────────
//
// Source-lang 예문이 이미 만들어진 상태에서 새 target_lang 번역만 생성.
// 1 LLM call에 모든 문장을 batch (per-sense parallel 안 함 — 같은 단어의 의미 N개라도
// 짧은 문장이라 1 prompt에 N개 묶어도 token cost 적음).
//
// 마커 처리: source의 **W** 위치에 대응되는 target_lang 단어 자리에도 **target_gloss** 박힘.

const TRANSLATE_CANONICAL_SYSTEM = `You translate vocabulary-card example sentences from SOURCE_LANG to TARGET_LANG for a language-learning app.

You receive a list of SOURCE_LANG sentences. Each contains the headword W (in SOURCE_LANG) wrapped in DOUBLE ASTERISKS: \`**W**\`. Each item also includes TARGET_GLOSS — the natural TARGET_LANG word/phrase for the headword in this sense.

For each item, produce:
- A natural, idiomatic TARGET_LANG translation (NOT word-for-word). Convey the SAME meaning of W.
- Plain prose with NO markers. The translation must NOT contain \`**...**\`. The learning card highlights only the source sentence.
- If TARGET_GLOSS reads like a dictionary definition (contains words like "particle", "marker", "indicating", or is longer than 3 words), do NOT echo it verbatim. Produce a natural translation that conveys the meaning without inserting the definition as a literal phrase.
- ONE sentence each.

Output strict JSON:
{
  "translations": [
    { "idx": <number>, "translation": "<TARGET_LANG sentence, plain prose, NO markers>" }
  ]
}`;

export interface CanonicalTranslateRequest {
  /** Stable key the caller uses to map back. */
  key: string;
  /** SOURCE_LANG sentence including **W** marker. */
  sentence: string;
  /** TARGET_LANG card-label form of the headword (the gloss to mark in the translation). */
  targetGloss: string;
}

export async function translateCanonicalSentences(
  reqs: CanonicalTranslateRequest[],
  sourceLang: string,
  targetLang: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (reqs.length === 0) return out;

  const items = reqs.map((r, idx) => ({
    idx,
    sentence: r.sentence,
    target_gloss: r.targetGloss,
  }));
  const userMessage =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `TARGET_LANG=${langName(targetLang)}\n` +
    `Items:\n${JSON.stringify(items, null, 2)}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_PRIMARY,
        messages: [
          { role: "system", content: TRANSLATE_CANONICAL_SYSTEM },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`translate-canonical HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const parsed = JSON.parse(body.choices[0].message.content) as {
      translations: Array<{ idx: number; translation: string }>;
    };
    for (const t of parsed.translations ?? []) {
      const r = reqs[t.idx];
      if (!r) continue;
      const tr = (t.translation ?? "").trim();
      if (!tr) continue;
      // Translations are plain prose — strip any stray markers the model may have inserted.
      const cleaned = tr.replace(/\*\*/g, "").trim();
      if (cleaned.length < 2) continue;
      out.set(r.key, cleaned);
    }
  } catch (err) {
    console.warn(`[example-gen translate-canonical] ${(err as Error).message}`);
  }
  return out;
}
