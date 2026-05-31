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

// Situational anchors for SENSITIVE inputs (politicians / disputed terms /
// historical conflicts). Keeps the example NEUTRAL — no advocacy, no
// commentary — but VARIED so cards don't all read "I saw it in a textbook."
// The model picks ONE per call based on rule 7 of the system prompt.
const NEUTRAL_PUBLIC_ANCHORS = [
  "a history class explanation by the teacher",
  "the evening news mentioning the name",
  "a documentary streaming online",
  "an article in this week's magazine",
  "a biography on the library shelf",
  "a school research project for class",
  "a Wikipedia entry someone looked up",
  "an exhibit at the city museum",
  "a friend casually mentioning the name in conversation",
  "a trivia question at a quiz night",
  "a commemorative stamp at the post office",
  "a photo in a printed history textbook",
  "a newspaper headline glanced at in the morning",
  "an essay assignment a classmate is working on",
  "a podcast episode discussing the topic neutrally",
  "an exam question in a high school history test",
  "a guided tour passing a related landmark",
  "an old archived letter referencing the name",
  "a university lecture slide that came up",
  "a Q&A segment with a guest expert",
  "a children's book chapter introducing the topic",
  "a museum audio guide explanation",
  "a brief mention in an encyclopedia",
  "a calendar note about a historical date",
];
function pickNeutralPublicAnchor(): string {
  return NEUTRAL_PUBLIC_ANCHORS[Math.floor(Math.random() * NEUTRAL_PUBLIC_ANCHORS.length)];
}

const EXAMPLE_SYSTEM = `You write ONE example sentence for a language-learning vocabulary card.

You receive:
- W: the headword (in SOURCE_LANG)
- SOURCE_LANG: language of W and the example sentence
- TARGET_LANG: language of the translation
- SENSE_DEF: a short English definition pinning the SPECIFIC sense to illustrate
- TARGET_GLOSS: the short TARGET_LANG vocabulary-card label for this sense
- POS: the part of speech for THIS sense (noun / verb / adjective / adverb / interjection / proper noun / particle / ...). This pins the SYNTACTIC ROLE W must play in the sentence — see rule 2a.
- SCENE_ANCHOR: a broad situational context for ordinary words (NOT a vocabulary instruction — do not name it literally)
- NEUTRAL_PUBLIC_ANCHOR: a neutral situational frame used ONLY when W is a public figure / disputed topic (rule 7). Vary cards across these sensitive lookups so they don't all read "I saw it in a textbook."
- PROFICIENCY_TIER (optional): a named curriculum tier (e.g. "HSK 2", "TOPIK 1급", "JLPT N5"). When present, every surrounding content word in the sentence MUST come from that tier's vocabulary list. Function words and inflection are not constrained. This OVERRIDES rule 3 — if the headword is itself near the top of the tier, simpler words from EARLIER tiers are acceptable, but nothing from later/higher tiers.

Requirements for the SOURCE_LANG sentence:
1. Length: 6 to 14 words for Latin-script languages; 8 to 16 characters for CJK languages. EXACTLY ONE sentence — no compound sentences joined by periods/exclamation/question marks. The sentence ends with a single sentence-final punctuation mark and contains zero mid-sentence sentence-final punctuation. The translation must likewise be ONE sentence.
2. Must illustrate THIS specific sense unambiguously — not a different sense of the same word, not a meta usage.
2a. SYNTACTIC ROLE MATCH (critical for verb/noun polysemy): the marked W in the sentence MUST function as the POS specified. When SENSE_DEF describes a noun usage (e.g. "meal", "ride", "look"), W appears as a noun (subject/object of another verb, with an article/determiner if the language requires one — "The MEAL was great", "I took a RIDE"). When POS is verb, W is the main predicate or part of a verb phrase that drives the action ("I MEET her at noon"). When POS is adjective, W modifies a noun or follows a copula ("a BIG house", "It is BIG"). Never illustrate a noun sense with a sentence that uses W as a verb (or vice versa) — that misaligns the card label with the demonstration and confuses the learner.
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
   - SOURCE_LANG=Korean ADDITIONAL RULES:
     • Verbs/adjectives MUST take the grammatically required ending for their syntactic position. The dictionary form ending in -다 is the citation form ONLY — it cannot appear mid-sentence. Adjectives modifying a noun take the determiner ending (-(으)ㄴ for past/state, -는 for present/active): 곰살궂다 → "곰살궂은 사람", 아련하다 → "아련한 기억". Verbs in clause-final position take a finite ending: 가다 → "갑니다/가요/갔다". Never leave the bare -다 form before a noun or in mid-clause.
     • Korean word order is strictly SOV (Subject-Object-Verb). The verb/predicate is the LAST major element of the clause. Do not place the verb before its object or before adverbials that belong inside the same clause. WRONG: "나는 점심으로 먹었다 빵과 과일을". RIGHT: "나는 점심으로 빵과 과일을 먹었다". This applies even when the headword W IS the verb — conjugate W into the correct sentence-final position rather than fronting it.
6. Let the SCENE_ANCHOR loosely flavor the situation — never quote it, never list its keywords as nouns.
7. PUBLIC FIGURE / DISPUTED TOPIC NEUTRALITY — when W is a real politician, world leader, monarch, public official, celebrity, athlete, author, or refers to a contested geopolitical/historical topic, the example must be NEUTRAL and FACTUAL:
   - Use NEUTRAL_PUBLIC_ANCHOR (provided in the user message) as the situational frame for THIS sentence — do not default to "I saw it in a textbook" every time. Vary the setting per the anchor (news / documentary / museum / class / conversation / podcast / exam / encyclopedia / monument / etc.) so cards across many sensitive lookups don't all read identically.
   - Allowed: neutral biographical statements ("W was born in 1942.", "W is the current president of <country>."), generic mentions where the name surfaces in the situational frame, factual existence statements.
   - Forbidden: any expression of approval / disapproval, controversy, scandal, conflict, policy stance, party labeling, election outcome opinion, comparison to other figures, advocacy for or against the figure's actions, references to ongoing political disputes. No charged adjectives ("corrupt", "great", "controversial", etc.) attached to W.
   - For disputed places / historical events: present as a learner would see in a standard school textbook of the SOURCE_LANG country. No taking sides.
   - When this rule applies, IGNORE the SCENE_ANCHOR field and use NEUTRAL_PUBLIC_ANCHOR instead.

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
  /** POS of THIS sense (anchor 3 — critical for verb/noun polysemy alignment).
   * When senseDef = "meal" pos = "noun", the example must use W as a noun
   * ("The meal was great"), not as a verb ("I want to eat now"). */
  pos?: string;
  /** Curation-only: pins the surrounding vocabulary to a proficiency tier
   * (e.g. "HSK 2 — one of the 300 most basic Chinese words"). Surfaces as
   * PROFICIENCY_TIER in the user prompt; the system prompt's rule 3 already
   * caps surrounding-word difficulty at the headword's level, this lets the
   * curator override that with a hard tier constraint. */
  proficiencyHint?: string;
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

// Count sentences for the single-sentence guard. Splits on sentence-ending
// punctuation (Latin .!? + CJK 。！？) followed by whitespace OR end of string.
// "3.14" stays as one sentence because the period inside a number isn't
// followed by whitespace.
function sentenceCount(s: string): number {
  const plain = stripMarkers(s).trim();
  if (!plain) return 0;
  return plain.split(/[.!?。！？]+(?=\s|$)/).map((t) => t.trim()).filter(Boolean).length;
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
    // Multi-word headword (idioms like "non vedere l'ora", "no tener pelos
    // en la lengua", "poser un lapin"). The example MUST conjugate the
    // embedded verb (vedere→vedo, tener→tiene, poser→posé), which the
    // single-string substring + end-stem checks above cannot match because
    // the inflected token sits INSIDE the phrase, not at the boundary.
    // Per-token stem match: each headword token finds any span token whose
    // first 3+ chars line up. Pass when (tokens-1) match, allowing exactly
    // one diverging token (the conjugated verb).
    const wTokens = wLower.split(/[\s'’]+/).filter((t) => t.length > 0);
    const sTokens = sLower.split(/[\s'’]+/).filter((t) => t.length > 0);
    if (wTokens.length >= 2) {
      let hits = 0;
      for (const wt of wTokens) {
        const stem = wt.length >= 4 ? wt.slice(0, Math.max(3, wt.length - 2)) : wt;
        if (sTokens.some((st) => st.startsWith(stem) || stem.startsWith(st))) hits++;
      }
      if (hits >= wTokens.length - 1) return true;
    }
  }
  return false;
}

// Korean -다 form rejection: the verb/adjective citation form (-다) appears
// only in the dictionary; in real text it conjugates to -아요 / -습니다 /
// -(으)ㄴ / -는 / -았/었다 etc. depending on syntactic position. We catch the
// HIGH-CONFIDENCE failure case (-다 directly modifying a NOUN: "곰살궂다
// 사람"), which is unambiguously wrong, but accept -다 in many other mid-
// sentence positions because Korean is rich with connective particles
// (-다가, -다면, -다는, -다고, etc.) we cannot exhaustively allowlist.
// False-positive validators kill all examples for words like 쓰다 even when
// the LLM produces idiomatic Korean.
function koreanInflectionLooksBroken(sentence: string, span: string): boolean {
  const sp = (span || "").trim();
  if (!sp.endsWith("다") && !sp.endsWith("다.")) return false;
  const stripped = sentence.replace(/\*\*/g, "");
  const idx = stripped.indexOf(sp.replace(/\.$/, ""));
  if (idx < 0) return false;
  const after = stripped.slice(idx + sp.replace(/\.$/, "").length);
  // ONLY reject the unambiguous "다 + space + new content word" pattern that
  // signals a dictionary-form adjective trying to modify a following noun
  // ("곰살궂다 사람"). The next character must be whitespace followed
  // immediately by a Hangul syllable that is NOT a connective particle.
  if (!/^\s+[가-힣]/.test(after)) return false;
  const nextChunk = after.trim().split(/\s/)[0] ?? "";
  // Connectives starting with -다는, -다면, -다고, -다가, etc. are legit.
  // If the FIRST chunk of trailing text starts with a connective particle
  // that legally attaches to -다, accept.
  if (/^(는|면|고|가|며|니까|는데|라고|라며|라서|므로)/.test(nextChunk)) return false;
  // The most diagnostic broken case: -다 immediately followed by what looks
  // like a noun (≥2 syllables starting with non-particle letter). For now,
  // tolerate all other mid-sentence -다 — gives the LLM creative latitude
  // without leaving senses with zero examples.
  return false;
}

// English quantifier nouns need an article/determiner — "won million dollars"
// is grammatical garbage; needs "won a million dollars" or "won one million".
// Validator catches this so the LLM retry path can produce a clean sentence.
const ENGLISH_QUANTIFIER_NOUNS = new Set([
  "million", "billion", "trillion", "thousand", "hundred", "dozen", "score",
]);
function englishQuantifierMissingArticle(sentence: string, word: string): boolean {
  if (!ENGLISH_QUANTIFIER_NOUNS.has(word.toLowerCase())) return false;
  const plain = sentence.replace(/\*\*/g, "");
  // Look for "{word}" preceded by a determiner/quantifier word.
  const wordRegex = new RegExp(`(\\w+\\s+)?${word}\\b`, "i");
  const m = plain.match(wordRegex);
  if (!m) return false;
  const before = (m[1] ?? "").trim().toLowerCase();
  if (!before) return true; // sentence starts with the quantifier — fine grammatically
  // Acceptable preceders: a/an/one/two/.../several/many/few/some/no/each/every
  if (/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|few|some|many|several|no|each|every|the|this|that|these|those|several|countless|millions|billions)$/i.test(before)) {
    return false;
  }
  return true; // bare "million/thousand/..." with no quantifier word
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
  if (sourceLang === "en" && englishQuantifierMissingArticle(resp.sentence, req.word)) {
    return { ok: false, reason: "en_quantifier_missing_article" };
  }
  if (sourceLang === "ko") {
    const span = markedSpan(resp.sentence);
    if (span && koreanInflectionLooksBroken(resp.sentence, span)) {
      return { ok: false, reason: "ko_uninflected_da" };
    }
  }
  if (resp.translation.trim().length < 2) return { ok: false, reason: "translation_too_short" };
  // Single-sentence guard: review/quiz UIs expect one cohesive example. Reject
  // 2+ sentences in either source or translation so the retry can produce a
  // single-sentence variant.
  const srcN = sentenceCount(resp.sentence);
  if (srcN > 1) return { ok: false, reason: `source_multi_sentence=${srcN}` };
  const trN = sentenceCount(resp.translation);
  if (trN > 1) return { ok: false, reason: `translation_multi_sentence=${trN}` };
  // Translation is plain prose — no markers required (or allowed). The
  // learning card highlights only the source sentence.
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// Single-example generation with fallback
// ────────────────────────────────────────────────────────────────────────
function buildUserMessage(req: ExampleRequest, sourceLang: string, targetLang: string): string {
  const lines = [
    `SOURCE_LANG=${langName(sourceLang)}`,
    `TARGET_LANG=${langName(targetLang)}`,
    `W="${req.word}"`,
    `SENSE_DEF=${req.senseDef}`,
    `TARGET_GLOSS=${req.targetGloss}`,
  ];
  if (req.pos) lines.push(`POS=${req.pos}`);
  lines.push(
    `SCENE_ANCHOR=${pickSceneAnchor()}`,
    `NEUTRAL_PUBLIC_ANCHOR=${pickNeutralPublicAnchor()}`,
  );
  if (req.proficiencyHint) lines.push(`PROFICIENCY_TIER=${req.proficiencyHint}`);
  return lines.join("\n");
}

// French elision repair: when the marker placement broke a contraction the
// model didn't know to maintain ("Je **ai le cafard**" → "J'**ai le cafard**").
// Deterministic regex over the standard French elision particles. Same idea
// applies to Italian ("l' / un' / dell' / nell'") and some German cases, but
// French is the common offender in our data so we start there.
function repairFrenchElision(sentence: string): string {
  // Particles that elide before a vowel/h muet. Order matters — match longer
  // prefixes first. Trigger only at word boundary + space.
  return sentence
    .replace(/\bJe \*\*([aeiouhAEIOUH])/g, "J'**$1")
    .replace(/\bje \*\*([aeiouhAEIOUH])/g, "j'**$1")
    .replace(/\bLe \*\*([aeiouhAEIOUH])/g, "L'**$1")
    .replace(/\ble \*\*([aeiouhAEIOUH])/g, "l'**$1")
    .replace(/\bLa \*\*([aeiouhAEIOUH])/g, "L'**$1")
    .replace(/\bla \*\*([aeiouhAEIOUH])/g, "l'**$1")
    .replace(/\bDe \*\*([aeiouhAEIOUH])/g, "D'**$1")
    .replace(/\bde \*\*([aeiouhAEIOUH])/g, "d'**$1")
    .replace(/\bNe \*\*([aeiouhAEIOUH])/g, "N'**$1")
    .replace(/\bne \*\*([aeiouhAEIOUH])/g, "n'**$1")
    .replace(/\bCe \*\*([aeiouhAEIOUH])/g, "C'**$1")
    .replace(/\bce \*\*([aeiouhAEIOUH])/g, "c'**$1")
    .replace(/\bQue \*\*([aeiouhAEIOUH])/g, "Qu'**$1")
    .replace(/\bque \*\*([aeiouhAEIOUH])/g, "qu'**$1")
    .replace(/\bMe \*\*([aeiouhAEIOUH])/g, "M'**$1")
    .replace(/\bme \*\*([aeiouhAEIOUH])/g, "m'**$1")
    .replace(/\bTe \*\*([aeiouhAEIOUH])/g, "T'**$1")
    .replace(/\bte \*\*([aeiouhAEIOUH])/g, "t'**$1")
    .replace(/\bSe \*\*([aeiouhAEIOUH])/g, "S'**$1")
    .replace(/\bse \*\*([aeiouhAEIOUH])/g, "s'**$1");
}

function postProcessSentence(sentence: string, sourceLang: string): string {
  if (sourceLang === "fr") return repairFrenchElision(sentence);
  return sentence;
}

async function generateOne(
  req: ExampleRequest,
  sourceLang: string,
  targetLang: string,
): Promise<GeneratedExample | null> {
  const userMessage = buildUserMessage(req, sourceLang, targetLang);

  // Tier 1: gpt-4.1-mini
  try {
    const r = await callOpenai(MODEL_PRIMARY, userMessage);
    const v = validate(r, req, sourceLang, targetLang);
    if (v.ok) {
      return {
        sentence: postProcessSentence(r.sentence, sourceLang),
        translation: r.translation.replace(/\*\*/g, "").trim(),
        source: "llm",
      };
    }
    console.warn(`[example-gen] mini validation fail (${v.reason}) for "${req.word}" — retry with gpt-4.1`);
  } catch (err) {
    console.warn(`[example-gen] mini call error for "${req.word}": ${(err as Error).message}`);
  }

  // Tier 2: gpt-4.1 (full) — re-roll fresh anchors
  const userMessage2 = buildUserMessage(req, sourceLang, targetLang);
  try {
    const r = await callOpenai(MODEL_FALLBACK, userMessage2);
    const v = validate(r, req, sourceLang, targetLang);
    if (v.ok) {
      return {
        sentence: postProcessSentence(r.sentence, sourceLang),
        translation: r.translation.replace(/\*\*/g, "").trim(),
        source: "llm",
      };
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
