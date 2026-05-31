// Dict-miss fallback for v4 word-lookup.
// -----------------------------------------------------------
// When no authoritative dictionary returns an entry, this module asks the
// LLM to (a) decide whether the input is even a valid word in SOURCE_LANG and
// (b) if so, propose 1-4 common senses with English + TARGET_LANG glosses.
//
// 2-stage by design (2026-05-25 결정):
//   Stage 1 = validity judge (this module).
//     - "valid_word" → caller falls through to example generation (per sense)
//     - "typo" / "non_word" / "wrong_language" → empty WordLookupResult with note
//   Stage 2 = example-generator.ts is called PER sense, identical path to dict-sourced senses.
//
// 정책 참조:
//   [[feedback_dict_first_industry_standard]] — LLM은 retrieval source 아님; 사전이 우선
//     → 이 fallback은 사전 miss(신조어/슬랭/dialect 등) 전용. 사전 hit이면 절대 호출 안 함.

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = "gpt-4.1-mini";

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

const VALIDATE_SYSTEM = `You are a vocabulary validator for a language-learning app. The headword W was NOT found in the authoritative dictionary for SOURCE_LANG. Decide what W is.

Verdicts:
- "valid_word": A real word or short phrase a SOURCE_LANG speaker would treat as a SINGLE LEXICALIZED UNIT — they have it memorized as a fixed chunk rather than constructing it word-by-word at speech time. Includes: regular words, slang, internet/SNS neologisms, regional/dialect terms, technical/jargon terms, recent loanwords, proper-noun-derived common usage, PROPER NOUNS of real public figures / places / works (politicians, world leaders, celebrities, historical figures, well-known place names, famous titles), AND fixed multi-word expressions: idioms, proverbs, set-piece exclamations, imperatives used as ritualized exclamations, polite formulas, common greetings/farewells. A phrase may have full sentence-level grammar (subject + verb + object, or imperative + ending) and STILL be valid_word if it is memorized and used as one unit, not freshly composed. "Not in the standard dictionary" alone does NOT make it invalid.
- "sentence": W is a FREELY COMPOSED, NOVEL utterance the speaker built word-by-word at speech time, not a memorized expression. Diagnostic test: would a native learner of SOURCE_LANG look this up to memorize it as a unit, or would they just parse its meaning from the words? If parse-from-parts, it's a sentence. Surface cues that SUPPORT (not decide) sentence: terminal sentence punctuation (. ! ? 。 ！ ？), description of a specific real-world event or state, free-content nouns / named entities slotted into a productive frame. TIEBREAKER on borderline cases — if W could plausibly be a fixed expression a learner would memorize, choose "valid_word". (Rationale: a user pasting a productive sentence into a vocabulary lookup expects no lexical content back; if there is a non-trivial chance the input IS a memorized expression, surface it.)
- "typo": Likely a misspelling or close-miss of a real SOURCE_LANG word. Prefer this verdict over "non_word" whenever W is within a small edit-distance (1-2 char insertions/deletions/substitutions) of a common SOURCE_LANG word. Examples of patterns to catch: missing letters (powr→power, gud→good), doubled/missing doubles (recieve→receive, accomodate→accommodate), letter swaps (thier→their, teh→the), common phonetic mis-spellings. When unsure between "typo" and "non_word", choose "typo" and propose the closest real word.
- "non_word": Gibberish, random characters, keyboard mashing (asdfgh, qwerty patterns), mojibake, or otherwise not a recognizable word in any language AND not within plausible edit distance of one.
- "wrong_language": A real word, but clearly in a language other than SOURCE_LANG.

For "valid_word" ONLY, list 1 to 4 DISTINCT senses (different meanings, not paraphrases of the same meaning). For each sense:
- en_def: ONE short English definition pinning the meaning
- target_gloss: ONE short TARGET_LANG vocabulary-card label (1-3 words preferred). If TARGET_LANG = English, this equals a short English gloss; if TARGET_LANG = SOURCE_LANG, give a short native paraphrase.
- pos: part of speech in lowercase English (noun / verb / adjective / adverb / interjection / phrase / abbreviation / proper noun / particle / etc.)
- frequency_score: 0-100 reflecting how often a typical SOURCE_LANG speaker encounters this sense in everyday contexts (slang/SNS terms can still score high among target demographics).

SENSE DISTINCTNESS RULE — apply judging from SOURCE_LANG, not from English/TARGET_LANG:
- Two candidate senses count as DISTINCT only when a native SOURCE_LANG speaker would parse them as separate meanings inside the SOURCE_LANG sentence — i.e. they answer different questions, fit different contexts, or rest on different underlying concepts in SOURCE_LANG.
- Two candidate senses are NOT distinct when they only differ in English nuance / translation choice while expressing the same SOURCE_LANG meaning. The SOURCE_LANG sentence does not change which sense applies; only the English translator's word choice does. Treat as ONE sense and pick the single best en_def that best fits typical usage.
- Apply this BEFORE listing senses. When unsure, prefer fewer senses. A learner card with one well-chosen meaning beats two near-duplicates whose example sentences would be indistinguishable in SOURCE_LANG.

HARD CUT to score 0-1: racial/ethnic slurs, hate speech, sexual harassment, vulgar sexual content. General profanity / casual slang that is not discriminatory is fine — score by frequency.

PUBLIC FIGURES / DISPUTED TOPICS — NEUTRAL CARD RULE:
- For real politicians, world leaders, monarchs, or other public officials: en_def must be a BRIEF, NEUTRAL, FACTUAL descriptor — full name + role + country/affiliation only. No opinions, no controversies, no current-events commentary, no party-aligned framing. Example pattern: "Joe Biden, American politician (46th U.S. President)." Limit to ONE sense.
- For celebrities / artists / athletes / authors: same pattern — "<full name>, <profession> from <country>".
- For places involved in geopolitical disputes (contested islands, contested historical events, contested place names): use a neutral textbook tone. Acknowledge the term without taking sides; if a Korean / Japanese / Chinese learner is the audience, present the term as they would encounter it in their country's standard textbook. Do not insert advocacy or political framing.
- target_gloss for public figures: the name rendered in TARGET_LANG's script using TARGET_LANG's standard transliteration. For Latin-script targets (en/es/fr/de/it) use the established romanization. For ja use the established kana/kanji rendering. For zh-CN use the established hanzi. For ko use Hangul. NEVER leave the name in the source script — outputting "윤석열" when TARGET_LANG=English or French is a bug. Do NOT cram biography into the gloss.

TARGET_GLOSS GENERAL CONSTRAINT (all valid_word senses): produce target_gloss in TARGET_LANG's script using TARGET_LANG vocabulary. Even for loanwords or neologisms where the source spelling is recognizable in TARGET_LANG, write the locally-standard form. Never echo the source headword W verbatim into target_gloss.

For non-valid_word verdicts, "senses" must be an empty array.

Output strict JSON:
{
  "verdict": "valid_word" | "sentence" | "typo" | "non_word" | "wrong_language",
  "correction": "<intended form if typo, else empty string>",
  "senses": [
    { "en_def": "...", "target_gloss": "...", "pos": "...", "frequency_score": <0-100> }
  ]
}`;

export type NeologismVerdict = "valid_word" | "sentence" | "typo" | "non_word" | "wrong_language";

export interface NeologismSense {
  en_def: string;
  target_gloss: string;
  pos: string;
  frequency_score: number;
}

export interface NeologismResult {
  verdict: NeologismVerdict;
  correction: string;
  senses: NeologismSense[];
}

export async function validateNeologism(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<NeologismResult> {
  const userMessage =
    `SOURCE_LANG=${langName(sourceLang)}\n` +
    `TARGET_LANG=${langName(targetLang)}\n` +
    `W="${word}"`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: VALIDATE_SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
    }),
  });
  if (!res.ok) {
    throw new Error(`neologism OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  const parsed = JSON.parse(body.choices[0].message.content) as NeologismResult;

  // Strip meta-category prefixes some models prepend on idiom/phrase entries
  // ("idiom: substitute", "expression - …"). The learner card needs the
  // lexical item only — the category is already conveyed by POS.
  const stripMeta = (s: string) =>
    s.replace(/^(?:idiom|expression|phrase|proverb|saying|colloq(?:uialism)?|slang)\s*[,:.\-]\s*/i, "").trim();

  // Detect definition leaks the LLM occasionally produces in target_gloss:
  // long English explanatory phrases dropped into a CJK target slot
  // ("A common greeting meaning 'hello'..." in a ja card,
  //  "The Japanese language" in a ja card,
  //  "an electronic device for storing..." in an it card).
  // The prompt says target_gloss = 1-3 words in TARGET_LANG script. Reject
  // glosses that are clearly off-spec rather than display garbage.
  const looksLikeDefinitionLeak = (gloss: string): boolean => {
    const g = gloss.trim();
    if (!g) return false;
    const wordCount = g.split(/\s+/).filter(Boolean).length;
    const hasLatin = /[A-Za-z]/.test(g);
    const hasHangul = /[가-힣]/.test(g);
    const hasJp = /[ぁ-んァ-ヶ]/.test(g);
    const hasCjk = /[一-鿿]/.test(g);
    // CJK target with no native script + long Latin text = English definition
    if (["ja", "ko", "zh-CN"].includes(targetLang)) {
      if (targetLang === "ja" && !hasJp && !hasCjk && hasLatin && wordCount > 3) return true;
      if (targetLang === "ko" && !hasHangul && hasLatin && wordCount > 3) return true;
      if (targetLang === "zh-CN" && !hasCjk && hasLatin && wordCount > 3) return true;
    }
    // Latin-script target with explanatory English phrases (starts with
    // articles + long): "A common greeting...", "An electronic device...",
    // "The Japanese language".
    if (["en", "es", "fr", "de", "it"].includes(targetLang) && wordCount > 5) {
      if (/^(a|an|the)\s+\w/i.test(g)) return true;
    }
    return false;
  };

  // Defensive: ensure shape integrity
  return {
    verdict: parsed.verdict,
    correction: (parsed.correction ?? "").trim(),
    senses: Array.isArray(parsed.senses)
      ? parsed.senses
          .map((s) => ({
            en_def: stripMeta((s.en_def ?? "").trim()),
            target_gloss: stripMeta((s.target_gloss ?? "").trim()),
            pos: (s.pos ?? "").trim(),
            frequency_score: Math.max(0, Math.min(100, Number(s.frequency_score) || 0)),
          }))
          .filter((s) => s.en_def && s.target_gloss)
          .filter((s) => !looksLikeDefinitionLeak(s.target_gloss))
          .slice(0, 4)
      : [],
  };
}
