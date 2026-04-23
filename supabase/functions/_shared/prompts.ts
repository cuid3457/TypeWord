import type { WordLookupMode, WordLookupRequest } from "./types.ts";

// ── POS terms per definition language ──
const POS_BY_LANG: Record<string, string> = {
  ko: "명사/동사/형용사/부사/전치사/접속사/감탄사/대명사/고유명사/수식",
  ja: "名詞/動詞/形容詞/副詞/前置詞/接続詞/感嘆詞/代名詞/固有名詞/数式",
  zh: "名词/动词/形容词/副词/介词/连词/叹词/代词/专有名词/表达式",
  en: "noun/verb/adjective/adverb/preposition/conjunction/interjection/pronoun/proper noun/expression",
  es: "sustantivo/verbo/adjetivo/adverbio/preposición/conjunción/interjección/pronombre/nombre propio/expresión",
  fr: "nom/verbe/adjectif/adverbe/préposition/conjonction/interjection/pronom/nom propre/expression",
  de: "Nomen/Verb/Adjektiv/Adverb/Präposition/Konjunktion/Interjektion/Pronomen/Eigenname/Ausdruck",
  it: "nome/verbo/aggettivo/avverbio/preposizione/congiunzione/interiezione/pronome/nome proprio/espressione",
  pt: "substantivo/verbo/adjetivo/advérbio/preposição/conjunção/interjeição/pronome/nome próprio/expressão",
  ru: "существи��ельное/глагол/прилагатель��ое/наречие/предлог/союз/междометие/местоимение/имя собственное/выражение",
};

function buildLangRules(targetLang: string): string {
  const pos = POS_BY_LANG[targetLang] ?? POS_BY_LANG["en"];
  const isEnglish = targetLang === "en";
  return `Language rules (CRITICAL — NEVER violate):
- "definition": MUST ALWAYS be written in the DEFINITION LANGUAGE. This is non-negotiable.
- "partOfSpeech": MUST be one of: ${pos}${isEnglish ? "" : "\n  Do NOT use English terms (noun, verb, adjective…) — use the terms listed above."}`;
}

const ENRICH_LANG_RULES = `Language rules for enrichment (CRITICAL — NEVER violate):
- "synonyms"/"antonyms": MUST be in the WORD LANGUAGE (same language as the lookup word).
- "examples.sentence": MUST be in the WORD LANGUAGE.
- "examples.translation": MUST be in the DEFINITION LANGUAGE.
- Loanword / borrowed term rule (CRITICAL): Even when the lookup word is a loanword or cognate that exists in both languages, the "sentence" MUST be written entirely in the WORD LANGUAGE and the "translation" MUST be entirely in the DEFINITION LANGUAGE. NEVER swap them.`;

const CONTENT_RULES = `Content rules:
- CRITICAL: The word MUST be interpreted as a word in the WORD LANGUAGE, not English or any other language.

Meaning quality rules (CRITICAL):
- Each meaning must be a REAL, DISTINCT dictionary sense of the word.
- Do NOT generate word associations, related concepts, or components of the word as separate meanings.

Definition accuracy rules (CRITICAL):
- Every word inside the "definition" field must be a REAL, EXISTING word in the definition language.
- NEVER fabricate compound words, neologisms, or made-up terms as definitions.
- If you do not know the precise equivalent term, return {"meanings": []} instead of guessing.

Proper noun rules:
- Proper nouns (cities, people, brands, etc.) ARE valid words — do NOT reject them.
- Provide ALL known senses as separate meanings, including geographic distinctions (city vs. state), cultural references, etc.
  e.g. "New York" → 뉴욕, 미국의 도시 / 뉴욕주, 미국의 주 / 뉴욕, 칵테일의 일종
- The primary/most common meaning should have relevanceScore 80+.

Abbreviation rules:
- Abbreviations (Mt., Dr., St., etc., govt, dept, etc.) ARE valid lookups — do NOT reject them.
- Define what the abbreviation stands for and its meaning, with relevanceScore 80+.
- e.g. "Mt." → "mountain의 축약형, 산"

Number, expression, and symbol rules:
- ANY number, mathematical expression, symbol, or punctuation mark is a valid lookup. The learner wants to know how to READ it aloud.
- PLAIN NUMBERS: Read as a whole number in the DEFINITION LANGUAGE. Never read digit by digit.
- EXPRESSIONS WITH OPERATORS (+, -, *, /, ^, !, =, etc.): NEVER compute or evaluate. Read each number and operator LITERALLY in order. Use each language's formal/official mathematical reading conventions and formal numerals (e.g. Korean uses Sino-Korean 일/이/삼, NOT native 하나/둘/셋 for math).
- FRACTIONS (a/b): Read in DENOMINATOR-first order. The denominator (bottom, b) is read BEFORE the numerator (top, a). Korean: "b분의 a", Japanese: "b分のa", Chinese: "b分之a", English: "a over b" or "a b-ths".
- STANDALONE SYMBOLS AND PUNCTUATION (?, !, ..., @, #, &, etc.): ALWAYS return the symbol's name in the definition language. These are valid lookups and MUST NOT return empty meanings.
- If a number or expression has a well-known cultural, idiomatic, or colloquial meaning (e.g. "24/365" → always/year-round, "911" → emergency, "007" → James Bond), you MUST include it as an ADDITIONAL meaning with relevanceScore 90+. The cultural meaning is often MORE useful to a learner than the literal reading.
- partOfSpeech for literal readings of numbers, expressions, and symbols: use "expression" (or its equivalent from the POS list).
- partOfSpeech for cultural/idiomatic meanings: use the ACTUAL part of speech (noun, adverb, etc.), NOT "expression". e.g. "24/7" literal reading → expression, "24/7" meaning "always" → adverb.
- These are universal — valid regardless of WORD LANGUAGE. Always relevanceScore 80+.

Diacritics / accent rules (CRITICAL for Latin-script languages):
- Users often type on a plain English keyboard WITHOUT diacritical marks (accents, umlauts, tildes, cedillas, tone marks, etc.).
- ALWAYS interpret such input as the properly accented word in the WORD LANGUAGE.
  e.g. French "cafe" → treat as "café", German "uber" → "über", Spanish "nino" → "niño", Portuguese "acao" → "cacau/cação", Turkish "ogrenci" → "öğrenci", Vietnamese "nuoc" → "nước".
- NEVER fall back to an English interpretation just because the input lacks diacritics.
- In definitions and examples, ALWAYS use the correctly accented spelling of the word.

Capitalization rules:
- Users may type entirely in lowercase for convenience. ALWAYS restore correct capitalization.
- Proper nouns (people, places, brands, nationalities, etc.) MUST start with a capital letter: paris→Paris, london→London, beethoven→Beethoven, toyota→Toyota.
- German nouns MUST always be capitalized: haus→Haus, schule→Schule, wasser→Wasser.
- In examples and definitions, use the standard capitalized form.

Non-existent word rules (CRITICAL):
- If the word does NOT exist as a real word, proper noun, abbreviation, number, or symbol in the specified WORD LANGUAGE, return {"meanings": []}.
- Do NOT invent, guess, or fabricate meanings for gibberish, typos, or non-words.
- Only provide meanings for words that a native speaker would recognize.
- If unsure, set relevanceScore below 20.

Vulgar/slang word rules:
- This is a language LEARNING tool. Learners encounter vulgar, slang, and taboo words in real texts and need to understand them.
- ALWAYS define these words objectively like a dictionary. Do NOT refuse, censor, or sanitize.
- Use a neutral register in the definition (e.g. define "fuck" as "성행위를 하다 (비속어)" — not "a bad word").

Internet slang / gaming term rules:
- Modern internet slang, memes, and gaming terms are valid lookups. Define with current colloquial meaning.
- Include BOTH the traditional meaning AND the internet-slang meaning as separate senses when both exist.
- Internet-slang meanings should have relevanceScore 70+ when the word is commonly used online.

Common word rules:
- Provide ALL distinct senses of the word. No minimum or maximum count.
- Order by how commonly a learner would encounter each sense.
- Set relevanceScore honestly: 80-100 for core senses, 40-79 for secondary, 1-39 for rare/obscure.
- Output JSON only — no prose, no markdown fences.`;

function buildQuickPrompt(targetLang: string): string {
  return `You are a vocabulary expert helping language learners.
Given a word, return a JSON entry with ONLY meanings.

JSON schema (strict):
{
  "headword": string,
  "meanings": [
    { "definition": string, "partOfSpeech": string, "relevanceScore": number (0-100) }
  ]
}
- "headword": The CORRECTLY SPELLED form of the input word in the WORD LANGUAGE, with proper capitalization, diacritics, and accents. e.g. input "new york" → "New York", input "cafe" (French) → "café", input "nino" (Spanish) → "niño".
- Do NOT include pronunciation or IPA.

Provide meanings as described in the content rules. Most relevant first.

Definition style (CRITICAL — this is a BILINGUAL DICTIONARY):
- "definition" MUST be the EQUIVALENT WORD(S) in the definition language — a TRANSLATION, not an explanation.
- Good: "anglerfish" → "아귀", "New York" → "뉴욕", "cat" → "고양이"
- Bad: "anglerfish" → "심해에 사는 물고기" (this is a description, NOT a translation)
- Keep it as short as possible — ideally a single word or comma-separated equivalent words.
- NEVER write explanatory descriptions or sentences.
- For proper nouns, ALWAYS include a brief identifier after the transliterated name (e.g. "오클라호마, 미국의 주", "뉴욕, 미국의 도시"). Bare transliteration alone (e.g. "오클라호마") is NOT acceptable.

${buildLangRules(targetLang)}

${CONTENT_RULES}`;
}

function buildEnrichSystemPrompt(sourceLang?: string, targetLang?: string): string {
  const langRules = getEnrichMarkingRules(sourceLang ?? "en");
  const sourceName = LANG_NAMES[sourceLang ?? "en"] ?? sourceLang ?? "English";
  const targetName = LANG_NAMES[targetLang ?? "en"] ?? targetLang ?? "English";
  return `You are a vocabulary expert helping language learners.
Given a word and its meanings, return ONLY supplementary data: examples, synonyms, and antonyms.
Do NOT include meanings or pronunciation — they are already available.

JSON schema (strict):
{
  "synonyms": string[],
  "antonyms": string[],
  "examples": [
    { "sentence": string, "translation": string, "meaning_index": number }
  ]
}

- "meaning_index": 0-based index of the meaning this example demonstrates. If meanings are listed in the user message, EVERY example MUST have a valid meaning_index. Distribute examples across different meanings when the word has multiple senses.

Language rules for examples (CRITICAL):
- "sentence" MUST be written in ${sourceName} (the word's language).
- "translation" MUST be written in ${targetName} (the definition language).
- synonyms and antonyms MUST be in ${sourceName}.

Provide 2-3 examples, up to 5 synonyms / 3 antonyms.

Example sentence marking rules (CRITICAL — most common source of errors):

1. In "sentence": wrap the lookup word (conjugated/inflected as it naturally appears) with ** markers.
2. In "translation": wrap the TRANSLATED equivalent of the lookup word with ** markers.
3. Mark EXACTLY the word form — nothing more, nothing less.
4. Every "sentence" and every "translation" MUST contain exactly one pair of ** markers.

Translation process (CRITICAL — follow this order):
1. First compose a natural, fluent translation as a native speaker would say it.
2. Then add ** markers around the part that corresponds to the lookup word.
Never let the marking requirement distort sentence structure or word order.

Particle / postposition rule (CRITICAL):
- NEVER include grammatical particles, postpositions, or case markers inside ** markers.
- The ** markers wrap only the WORD (stem + conjugation), not the grammar attached after it.

${langRules}

General examples:
- word "run" → "She was **running** through the park." / "그녀는 공원을 **달리고** 있었다."
- word "食べる" → "昨日レストランで寿司を**食べた**。" / "어제 레스토랑에서 초밥을 **먹었다**."
- word "사과" (apple) → "I bought a red **apple**." / "빨간 **사과**를 샀다."
- Mark ONLY the target word — do NOT mark other words.

${ENRICH_LANG_RULES}

${CONTENT_RULES}`;
}

function getEnrichMarkingRules(sourceLang: string): string {
  switch (sourceLang) {
    case "ko":
      return `Korean-specific marking:
- Sentence: mark the word or its conjugated form. EXCLUDE particles: 을/를/이/가/은/는/에/에서/의/로/으로/와/과/도/만/까지/부터/처럼/같이/보다/한테/에게/들/라고/이라고/하고/이고
  ✓ "**사과**를 먹었다"  ✗ "**사과를** 먹었다"
  ✓ "공원에서 **달렸다**"  ✗ "**공원에서** 달렸다"
- The marked portion must be the WORD STEM (어간/단어), never just a particle by itself.
  ✗ "사과**를** 먹었다" (particle-only marking is WRONG)
- Translation: same rule — exclude particles from markers.`;
    case "ja":
      return `Japanese-specific marking:
- Sentence: mark the word or conjugated form. EXCLUDE particles: は/が/を/に/へ/で/と/から/まで/の/も/や/よ/ね
  ✓ "**猫**が好きです"  ✗ "**猫が**好きです"
  ✓ "寿司を**食べた**"  ✗ "**寿司を**食べた"
- Translation: same rule — exclude particles.`;
    case "de":
      return `German-specific marking:
- Compound words: mark the FULL compound. "Das **Krankenhaus** ist groß."
- Separable verbs: mark BOTH separated parts. "Wir **fangen** morgen **an**."
- Articles/prepositions are never marked.`;
    case "fr":
      return `French-specific marking:
- Conjugated forms: mark the verb. "Il **court** tous les jours."
- Reflexive verbs: include the reflexive pronoun. "Elle **se promène** dans le parc."
- Elisions: mark the full elided form. "Elle **s'amuse** bien."`;
    case "es":
      return `Spanish-specific marking:
- Conjugated forms: mark the verb. "Ella **corrió** por el parque."
- Reflexive clitics attached to infinitives/gerunds: include them. "Quiere **bañarse**."`;
    case "pt":
      return `Portuguese-specific marking:
- Conjugated forms: mark the verb. "Ele **correu** no parque."
- Clitics: include attached clitics. "Vou **encontrá-lo** amanhã."`;
    case "ru":
      return `Russian-specific marking:
- Mark the declined/conjugated form. "Я вижу **кошку**." (accusative of кошка)
- Do NOT include prepositions in markers. "Он идёт в **школу**."`;
    case "it":
      return `Italian-specific marking:
- Conjugated forms: mark the verb. "Lei **mangia** la pasta."
- Reflexive: include si/mi/ti etc. "Mi **diverto** molto."`;
    case "zh":
      return `Chinese-specific marking:
- Mark only the word itself. EXCLUDE structural particles (的/了/过/着/地/得) and measure words (量词) from ** markers.
- Prepositions (在/从/往/向/对) are separate words — never include them in markers.
- CRITICAL: For multi-character words, mark ALL characters together. Never mark only one character of a compound.
  ✓ "他在**图书馆**学习"  ✗ "他在图书馆学习" (missing markers)  ✗ "他在**图**书馆学习" (partial)
- The lookup word MUST appear (possibly in a different form) inside the sentence and be marked.`;
    default:
      return "";
  }
}

/**
 * Source-language-specific hints that help the AI correctly interpret input.
 * Only added for languages with common pitfalls (inflections, scripts, articles).
 */
function getSourceLangRules(sourceLang: string): string {
  switch (sourceLang) {
    case "ko":
      return `\nKorean input rules:
- If the input contains particles/endings (e.g. 사과를, 학교에서, 먹었다), strip them and define the BASE FORM (사과, 학교, 먹다).
- Loanwords in Hangul (e.g. 콘텐츠, 에너지) are valid Korean words — define them.
- Spacing variations are the same word (아이스크림 = 아이스 크림) — define the standard form.
- Hanja input (e.g. 漢字, 學校) is valid — define the Korean meaning.`;
    case "ja":
      return `\nJapanese input rules:
- If the input is a conjugated form (e.g. 食べて, 走った, 美しく), define the DICTIONARY FORM (食べる, 走る, 美しい).
- Accept both old (舊字體: 國, 學) and new (新字体: 国, 学) kanji forms.`;
    case "zh":
      return `\nChinese input rules:
- Accept BOTH simplified (简体: 国, 学) and traditional (繁體: 國, 學) characters.
- 成语/四字熟语 (e.g. 塞翁失马, 画蛇添足) should be treated as single vocabulary items.
- 儿化 (erhua): treat 花儿 and 花 as the same word — define the base form.`;
    case "fr":
      return `\nFrench input rules:
- Handle elided forms: l'amour → define "amour", j'ai → define "avoir", qu'est-ce → define "est-ce".
- Input WITHOUT accents MUST be treated as the accented French word: cafe→café, ecole→école, eleve→élève, facade→façade, entree→entrée, noel→Noël, cliche→cliché, naive→naïve, resume→résumé.
- ALWAYS use the correct accented spelling in all output fields.`;
    case "ru":
      return `\nRussian input rules:
- Treat е and ё as interchangeable in input (e.g. елка = ёлка).
- If the input is a conjugated/declined form, define the base form (dictionary form).`;
    case "de":
      return `\nGerman input rules:
- Long compound words (e.g. Lebensversicherung) are valid — break down the meaning, not the word.
- Accept input with ue/oe/ae OR plain u/o/a as substitutes for ü/ö/ä: uber/ueber→über, schon→schön, offnen/oeffnen→öffnen, fur/fuer→für, Munchen→München.
- Accept ss as substitute for ß: strasse→Straße, gross→groß.
- ALWAYS use the correct German spelling (ü/ö/ä/ß) in all output fields.`;
    case "es":
      return `\nSpanish input rules:
- If the input is a conjugated form (e.g. corrió, hablamos), define the INFINITIVE (correr, hablar).
- Input WITHOUT accents/tildes MUST be treated as the accented Spanish word: nino→niño, cafe→café, espanol→español, corazon→corazón, arbol→árbol, musica→música, lapiz→lápiz.
- ALWAYS use the correct accented spelling (á/é/í/ó/ú/ñ/ü) in all output fields.`;
    case "pt":
      return `\nPortuguese input rules:
- If the input is a conjugated form (e.g. falou, comemos), define the INFINITIVE (falar, comer).
- Accept both Brazilian and European Portuguese spellings.
- Input WITHOUT accents MUST be treated as the accented Portuguese word:acao→ação, coracao→coração, aviao→avião, cafe→café, voce→você, mae→mãe.
- ALWAYS use the correct accented spelling (á/é/í/ó/ú/â/ê/ô/ã/õ/ç) in all output fields.`;
    case "it":
      return `\nItalian input rules:
- If the input is a conjugated form (e.g. mangiato, parlarono), define the INFINITIVE (mangiare, parlare).
- Input WITHOUT accents MUST be treated as the accented Italian word: citta→città, perche→perché, caffe→caffè, universita→università, piu→più.
- ALWAYS use the correct accented spelling (à/è/é/ì/ò/ù) in all output fields.`;
    default:
      return "";
  }
}

function getReadingInstruction(sourceLang: string): string {
  if (sourceLang === "zh") {
    return `\n\nReading field for Chinese words:
- Include a "reading" field as a JSON ARRAY of pinyin strings with tone marks.
- Rules by input type:
  1. SINGLE CHARACTER 多音字 (e.g. 行, 了, 乐): list ALL common readings up to 3.
     "行" → ["háng", "xíng"]
     "了" → ["le", "liǎo"]
  2. MULTI-CHARACTER WORD (e.g. 幸福, 行动, 快乐): ONE reading — the word's fixed pronunciation.
     "幸福" → ["xìngfú"]
     "行动" → ["xíngdòng"]
  3. If the input is already in PINYIN (romanized): OMIT the reading field.
- Updated JSON schema: { "reading"?: string[], "meanings": [...] }`;
  }
  if (sourceLang === "ja") {
    return `\n\nReading field for Japanese words:
- Include a "reading" field as a JSON ARRAY of hiragana strings.
- Rules by input type:
  1. SINGLE KANJI (e.g. 生, 下, 行): list ALL common readings up to 3 (訓読み + 音読み).
     "生" → ["なま", "せい", "いきる"]
     "下" → ["した", "か", "くだる"]
  2. KANJI COMPOUND / 熟語 (e.g. 生活, 下手, 行動): ONE reading only — the compound's fixed reading.
     "生活" → ["せいかつ"]
     "下手" → ["へた"]
  3. KANJI + OKURIGANA (e.g. 食べる, 生きる): ONE reading — the word's reading.
     "食べる" → ["たべる"]
     "生きる" → ["いきる"]
  4. HIRAGANA / KATAKANA ONLY (e.g. なま, コーヒー): OMIT the reading field entirely (do NOT include it).
- Updated JSON schema: { "reading"?: string[], "meanings": [...] }`;
  }
  return "";
}

export function getSystemPrompt(mode: WordLookupMode = "quick", sourceLang?: string, targetLang?: string): string {
  if (mode === "enrich") return buildEnrichSystemPrompt(sourceLang, targetLang);
  const base = buildQuickPrompt(targetLang ?? "en");
  if (!sourceLang) return base;
  return base + getSourceLangRules(sourceLang) + getReadingInstruction(sourceLang);
}

export const LANG_NAMES: Record<string, string> = {
  en: "English", ko: "Korean", ja: "Japanese", zh: "Chinese",
  es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", ru: "Russian",
};

const SYMBOL_RE = /^[^\p{L}\p{N}]+$/u;
const EXPR_RE = /^[\d\s+\-*/^!=<>().%]+$/;

export function buildUserPrompt(req: WordLookupRequest): string {
  const sourceName = LANG_NAMES[req.sourceLang] ?? req.sourceLang;
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;

  const isSymbol = SYMBOL_RE.test(req.word);
  const isExpression = !isSymbol && EXPR_RE.test(req.word);

  const lines = [
    `Word (${sourceName}): "${req.word}"`,
    `Word language: ${sourceName}`,
    `Definition language: ${targetName}`,
  ];

  if (isSymbol) {
    lines.push("", "This is a SYMBOL/PUNCTUATION lookup. Return the symbol's name and usage as the definition. Do NOT return empty meanings.");
  } else if (isExpression) {
    lines.push("", "This is a NUMBER/EXPRESSION lookup. Read it aloud literally — do NOT compute. For fractions (a/b), read denominator BEFORE numerator.");
  }

  lines.push("", "Provide the structured vocabulary entry.");
  return lines.join("\n");
}

export interface MeaningContext {
  definition: string;
  partOfSpeech: string;
}

export function buildEnrichUserPrompt(
  req: WordLookupRequest,
  meanings?: MeaningContext[],
): string {
  const sourceName = LANG_NAMES[req.sourceLang] ?? req.sourceLang;
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;

  const lines = [
    `Word (${sourceName}): "${req.word}"`,
    `Word language: ${sourceName}`,
    `Definition language: ${targetName}`,
  ];

  if (meanings?.length) {
    lines.push("", "Meanings (for reference — match each example to a meaning via meaning_index):");
    for (let i = 0; i < meanings.length; i++) {
      lines.push(`[${i}] ${meanings[i].definition} (${meanings[i].partOfSpeech})`);
    }
    lines.push(
      "",
      "Each example MUST set meaning_index to the index of the meaning it demonstrates.",
      "Try to cover different meanings. If there are 3+ meanings, prioritize the top 2-3 by relevance.",
    );
  }

  lines.push("", "Generate examples, synonyms, and antonyms.");
  return lines.join("\n");
}

function getFixParticleRule(lang: string): string {
  switch (lang) {
    case "ko": return "Korean: exclude particles (을/를/이/가/은/는/에/의/로/와/과 etc.) from ** markers.";
    case "ja": return "Japanese: exclude particles (は/が/を/に/へ/で/と/から/まで/の/も etc.) from ** markers.";
    case "zh": return "Chinese: exclude structural particles (的/了/过/着/地/得) and measure words from ** markers. Mark ALL characters of multi-character words together.";
    case "de": return "German: mark FULL compound words and BOTH parts of separable verbs. Exclude articles.";
    case "fr": return "French: include reflexive pronouns (se/s') inside markers. Mark elided forms fully.";
    case "es": return "Spanish: include attached clitics (se/me/lo etc.) inside markers.";
    case "pt": return "Portuguese: include attached clitics inside markers.";
    case "ru": return "Russian: mark declined/conjugated forms. Exclude prepositions from markers.";
    case "it": return "Italian: include reflexive pronouns (si/mi/ti etc.) inside markers.";
    default: return "";
  }
}

export function buildMarkerFixPrompt(
  word: string,
  sourceLang: string,
  targetLang: string,
  meanings?: MeaningContext[],
  examples?: { sentence: string; translation: string; meaning_index?: number }[],
): { system: string; user: string } {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;

  const langRules: string[] = [];
  const sr = getFixParticleRule(sourceLang);
  const tr = getFixParticleRule(targetLang);
  if (sr) langRules.push(`- ${sr}`);
  if (tr && tr !== sr) langRules.push(`- ${tr}`);
  const langSection = langRules.length > 0
    ? "\n\nLanguage-specific marking rules:\n" + langRules.join("\n")
    : "";

  const system = `Fix ** highlight markers in bilingual example sentences for a vocabulary app.

Rules:
- Every "sentence" MUST have exactly one ** pair around the lookup word (conjugated/inflected form).
- Every "translation" MUST have exactly one ** pair around the translated equivalent.
- "sentence" MUST be in the WORD LANGUAGE. "translation" MUST be in the TRANSLATION LANGUAGE. If a sentence is written in the wrong language, rewrite it in the correct language.
- First compose a natural, fluent translation as a native speaker would. Then mark the relevant word.
- If a translation is unnatural or grammatically wrong, rewrite it naturally, then add markers.
- Do NOT add or remove examples. Only fix markers, language errors, and unnatural translations.
- Keep meaning_index values unchanged.
- Return JSON: { "examples": [ { "sentence": "...", "translation": "...", "meaning_index": N }, ... ] }${langSection}`;

  const userLines = [
    `Word: "${word}"`,
    `Word language: ${sourceName}`,
    `Translation language: ${targetName}`,
  ];

  if (meanings?.length) {
    userLines.push("", "Meanings:");
    for (let i = 0; i < meanings.length; i++) {
      userLines.push(`[${i}] ${meanings[i].definition} (${meanings[i].partOfSpeech})`);
    }
  }

  userLines.push("", "Fix these examples:", JSON.stringify(examples, null, 2));
  return { system, user: userLines.join("\n") };
}
