// prompts-v3-en.ts
// -----------------------------------------------------------
// EN-specific branched prompts for word-lookup-v2.
// Pattern mirrors prompts-v3-ko.ts: classify (regex) → case-specific
// specialized prompt. Each case carries its own cap discipline and
// example-style range, so the single generic COMBINED_QUICK no longer
// averages every English lookup into the same shape.
//
// Cases (4):
//   number_symbol   — pure digits / math / symbol-only input
//   set_expression  — input contains whitespace (phrasal verb, idiom,
//                     compound noun, multi-word lemma)
//   proper_acronym  — all-caps acronym (NASA/FBI/COVID) OR Title-Case
//                     single token (Seoul/Microsoft/Tokyo)
//   simple_word     — single lowercase token (default; ~90% of lookups)
//
// Each STATIC prompt addresses three user-flagged regressions:
//   (Q1) case-aware branching for non-KO source
//   (Q2) example diversity (subject/scene/shape/tense/mood rotation)
//   (Q3) cap discipline (meanings/syn/ant tuned per case, not blanket
//        defaults)
// -----------------------------------------------------------

import type { WordLookupRequest } from "./types.ts";
import { LANG_NAMES, POS_BY_LANG } from "./prompts-v3.ts";

export type EnCase =
  | "number_symbol"
  | "set_expression"
  | "proper_acronym"
  | "simple_word";

// Symbol / pure-non-letter regex (excludes whitespace).
const SYMBOL_RE = /^[^\p{L}\p{N}\s]+$/u;
// Pure digits / math / fractional expression.
const NUMBER_RE = /^[\d\s+\-*/^!=<>().%,.]+$/;
// Contains internal whitespace → multi-word lemma candidate.
const PHRASE_RE = /\s/;
// Hyphen-compound single lexeme: letters joined by hyphens, no
// whitespace. Captures "long-term" / "well-known" / "state-of-the-art"
// / "sister-in-law" / "Wi-Fi". Mixed-case allowed. Excludes single
// trailing hyphen and excludes acronym-style ALL-UPPERCASE (those go
// to ACRONYM_RE separately when shape matches).
const HYPHEN_COMPOUND_RE = /^[A-Za-z]+(-[A-Za-z]+)+$/;
// All-uppercase 2–8 chars (letters/digits/hyphen). NASA, FBI, NATO,
// COVID, IPv (partial), UN, EU, USA, COVID-19.
const ACRONYM_RE = /^[A-Z][A-Z0-9-]{1,9}$/;
// Title case single token: Seoul, Tokyo, Microsoft, Anna, Smith.
// First char uppercase, rest lowercase letters only (no internal caps,
// no digits — iPhone/eBay/macOS deliberately fall through to simple_word
// where the brand handling stays generic).
const TITLE_CASE_RE = /^[A-Z][a-z]+$/;

/**
 * Classify an English input into one of the case buckets. Regex-based,
 * runs in <1ms. Ambiguous cases fall back to `simple_word` — its prompt
 * is general enough to handle them without quality regression.
 */
export function classifyEnInput(word: string): EnCase {
  const w = (word ?? "").trim();
  if (!w) return "simple_word";
  if (SYMBOL_RE.test(w)) return "number_symbol";
  if (NUMBER_RE.test(w)) return "number_symbol";
  if (PHRASE_RE.test(w)) return "set_expression";
  // ACRONYM_RE is checked BEFORE HYPHEN_COMPOUND_RE so that
  // all-uppercase acronyms with hyphens (COVID-19, COVID-2019) route to
  // proper_acronym, NOT hyphen_compound. Mixed-case hyphen lexemes
  // (long-term, Wi-Fi, well-known) fall through to set_expression
  // because semantically and marker-wise they behave like multi-word
  // lemmas — the marker must wrap the entire hyphenated unit.
  if (ACRONYM_RE.test(w)) return "proper_acronym";
  if (HYPHEN_COMPOUND_RE.test(w)) return "set_expression";
  if (TITLE_CASE_RE.test(w)) return "proper_acronym";
  return "simple_word";
}

// ============================================================
// Shared schema fragment used across all EN cases.
// English keeps ipa REQUIRED (Latin script, phonemically opaque to
// learners) and OMITS reading (no CJK reading layer).
// ============================================================

const SHARED_SCHEMA = `Output a strict JSON object matching this schema (do not wrap in markdown fences):

<schema>
{
  "headword": string,                       // corrected English form (lemma; typo fix; restored case)
  "ipa"?: string,                            // see <ipa_rule>; required when applicable
  "originalInput": string,                   // input verbatim
  "confidence": number,                      // 0–100
  "note"?: "sentence" | "non_word" | "wrong_language",
  "meanings_translated": [{ "definition": string, "partOfSpeech": string }],   // TARGET_LANG, emit FIRST for streaming
  "meanings": [{ "definition": string, "partOfSpeech": string, "relevanceScore": number }]
}
</schema>

<key_order priority="critical">
Emit "meanings_translated" BEFORE "meanings". Same count, same order. Index N in both arrays = SAME sense.
</key_order>

<ipa_rule>
EMIT ipa when ALL true: headword has no internal spaces; primary partOfSpeech ≠ "expression"; headword is a real English lexeme (not a number, not a symbol, not a foreign proper noun whose pronunciation is non-English).
- Real IPA chars only (ʃ ɛ ð θ ŋ ə ɚ ɝ ɹ æ ɑ ɔ ɪ ʊ ʔ ʒ). Stress (ˈ ˌ) where applicable. No slashes/brackets.
- Transcribe the EXACT surface form (singular/plural/past as given). General American reference.
</ipa_rule>

<forbidden>
- "reading" key (English has no CJK reading layer).
- "gender" key (English nouns have no grammatical gender).
- "examples", "synonyms", "antonyms" (separate ENRICH call).
- Padding meanings to reach 2–3 when one clean sense suffices.
- Encyclopedic definitions ("traditional", "famous", "a type of X", "one of the Y", "X used for Y-ing").
- Mixing scripts inside meanings (English canonical: ASCII letters only).
- POS name (noun / verb / adjective / adverb / preposition / etc.) leaking INTO meanings[].definition or meanings_translated[].definition. The POS belongs in partOfSpeech field ONLY. WRONG: "(noun) house, noun"; RIGHT: "(noun) house, home". NEVER emit definitions where a trailing token is the POS name itself.
</forbidden>

<definition_format>
- Length: ≤6 words. Hard cap.
- Shape: single word OR comma-separated 2–3 NEAR-SYNONYMS at SAME specificity (e.g. "happy, joyful" — same sense, alternate wording). NEVER use commas to fuse distinct senses (e.g. "write, use" is WRONG — those are separate senses each getting their own meanings[] entry). Never specific + hypernym.
- Every word inside definition is a real existing English word.
- relevanceScore: emit a TRUE frequency estimate for each sense, NOT a default 80. Anchor the primary everyday sense at 90–100. Subsequent senses must reflect actual relative rarity:
  • Dominant single sense (one meaning used 95%+ of the time): primary=100, secondary senses below 60 → DO NOT emit.
  • Strongly skewed (one sense ≈ 80%, others present but rarer): primary=95, secondary 60–75 if attested everyday.
  • Balanced homonyms (true polysemy with roughly equal real-world frequency): each sense 75–95, spread ≤ 15.
  • Senses below 60 (archaic / literary / compound-only / rare) → DO NOT emit.
  The downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Set relevance honestly per sense — review weighting uses these. Identical scores (80/80/80) defeat the weighting. Emit ALL senses that pass the bar; do not pad and do not skip.
</definition_format>`;

const SHARED_SLANG = `<slang_rule priority="critical">
This product is a LEARNING TOOL, not a reference dictionary.
PRIMARY slang/profanity/slur/sexual-vulgarity headword → note="non_word", meanings=[].
SECONDARY slang sense of a clean word (everyday word that ALSO has a vulgar/derogatory slang meaning) → EXCLUDE the slang sense entirely. Do NOT include with a register tag. Emit only the clean sense(s).
Normal emotional vocabulary (anger, sadness, fear, dislike) is NOT slang — INCLUDE.
Informal but non-vulgar colloquialisms (everyday casual speech, common youth speech without crudeness) are NOT slang — INCLUDE.
</slang_rule>`;

const SHARED_TRANSLATION_PURITY = `<translation_purity_strict priority="critical">
TARGET_LANG purity applies to BOTH fields of every meanings_translated[] entry:

- meanings_translated[].definition — 100% TARGET_LANG script only. No English glosses, no parentheticals (the ONLY exception is the optional register-tag form like "(격식)" / "(속어)" for set_expression case).
- meanings_translated[].partOfSpeech — MUST be a TARGET_LANG word taken from the TARGET_LANG list under <pos_allowed>. NEVER emit English POS labels ("verb" / "noun" / "adjective" / "proper noun" / "expression") in this field when TARGET_LANG ≠ English. NEVER emit the literal string "undefined" or empty string. The TARGET_LANG-native term is mandatory — if TARGET_LANG is Korean, partOfSpeech is one of: 명사 / 동사 / 형용사 / 부사 / 전치사 / 접속사 / 감탄사 / 대명사 / 고유명사 / 표현 / 수사 / 기호. If TARGET_LANG is Chinese / Japanese / Spanish / French / German / Italian — use that language's POS list under <pos_allowed>.
- The translated partOfSpeech MUST be derivable from the canonical partOfSpeech via standard alignment (noun ↔ 명사 ↔ 名词 ↔ 名詞 ↔ sustantivo etc.). NEVER invent a POS not present in the TARGET_LANG <pos_allowed> list. If TARGET_LANG is English (so source and target both English), then the canonical and translated POS share the same English term.

Pre-emit checks:
□ meanings_translated[i].definition contains zero English-script characters when TARGET_LANG ≠ English.
□ meanings_translated[i].partOfSpeech is from the TARGET_LANG <pos_allowed> list exactly — NEVER "undefined", NEVER blank, NEVER the canonical English POS leaking when target is a non-English language.
</translation_purity_strict>`;

const SHARED_TRANSLATION = `<translation_rules>
- meanings_translated entries in TARGET_LANG. Concise dictionary equivalent (single word or 2–3 comma-separated near-synonyms).
- Same count and order as meanings.
- False-friend awareness: translate the SENSE from the canonical definition, never the spelling.
- Register: daily-life concepts (kinship/body/food/weather/common actions) → colloquial spoken form in TARGET_LANG.
- LOANWORD PRIORITY: when TARGET_LANG has a well-established native form (often a loanword adapted from the source language) for the headword, USE THAT FORM, NOT a descriptive paraphrase. The translated definition should be what a TARGET_LANG native learner instantly recognizes.
  • "ice cream" → ko "아이스크림" (NOT "얼린 달콤한 디저트"); ja "アイスクリーム"; zh "冰淇淋"
  • "coffee" → ko "커피"; ja "コーヒー"; zh "咖啡"
  • "computer" → ko "컴퓨터"; ja "コンピューター"
  • "smartphone" → ko "스마트폰" (NOT "휴대용 전화기")
  • "hotel" → ko "호텔"; "bus" → "버스"
  Descriptive paraphrase is ONLY for concepts that lack a native single-word equivalent (e.g. "wishful thinking" → ko "헛된 희망" is appropriate because no single 외래어 exists). For common everyday items, NEVER descriptive — use the established native form.
</translation_rules>

${SHARED_TRANSLATION_PURITY}`;

// ============================================================
// Case 1: NUMBER_SYMBOL — digits, math expressions, lone symbols
// ============================================================
// Smallest case. Cap=1 meaning. No syn/ant downstream. The bulk of
// the work is producing the literal English reading.

const EN_NUMBER_SYMBOL_STATIC = `<role>English vocabulary expert. Input is a number, math expression, or symbol/punctuation. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<pos_classification priority="critical">
- A number / math expression / formula → partOfSpeech="numeral" (canonical). NEVER "expression", NEVER "noun".
- A symbol / punctuation mark → partOfSpeech="symbol" (canonical). NEVER "expression".
- This applies to the ENTIRE meanings array including any secondary idiomatic sense. The ONLY case where partOfSpeech departs from "numeral" / "symbol" is when a SPECIFIC number token has an established conventional non-literal sense (e.g. "911" as emergency code) — that secondary sense takes the appropriate content POS (noun/verb), but the primary literal-reading meaning stays "numeral".
</pos_classification>

<rules>
- Number: meaning[0] = literal English reading (cardinal: "three"; ordinal only when the input has ordinal marker like "3rd"). Single literal-reading meaning — NEVER emit two parallel "different reading style" meanings for the same number (e.g. don't add a digit-by-digit reading of a year-shaped number as a separate meaning).
- Year-shaped 4-digit number (1900–2099): the single literal reading uses the conventional pairwise form ("nineteen eighty-four"), NOT the digit-by-digit form. Only ONE numeral meaning.
- Math expression / formula: literal reading, NEVER compute. ("2+3" → "two plus three", not "five".)
- Fraction a/b: "a over b" or "a b-th(s)" (denominator first when natural in English: "3/4" → "three quarters").
- Decimal a.b: digits AFTER the decimal point are read INDIVIDUALLY (each digit as its own number word — NOT as a multi-digit number). Canonical English: "3.14" → "three point one four" (NOT "three point fourteen"). TARGET_LANG follows the same digit-by-digit principle: Korean "3.14" → "삼 점 일사" (sam jeom + the two post-point digits "일사"; NEVER "십사"=14). Japanese "さん てん いち よん". Chinese "三点一四" or "三 点 一 四". Latin targets: "tres coma uno cuatro" / "trois virgule un quatre" / "drei Komma eins vier" / "tre virgola uno quattro". Use single-space separators between "<integer> <point-word> <digit-string>" only — DO NOT insert extra spaces between every individual post-point digit in scripts where that hurts readability (Korean / Chinese / Japanese: write the post-point digits as a single compound like "일사" / "一四" / "いちよん"; Latin targets: keep individual digit words with spaces as natural for the language).
- Symbol/punctuation: meaning[0] = the symbol's English name ("@" → "at sign"; "#" → "hash, number sign, pound sign"). Never empty for symbols.
- Cultural / conventional sense for a SPECIFIC token: when the EXACT token doubles as a culturally established referent that a literate adult would recognize beyond the bare number, emitting it as meaning[1] is the EXPECTED behavior — not an optional addition. INCLUDE IT. Categories that qualify:
  • Well-known titled work where the number IS the title (novel / film / album / video game).
  • Emergency-services or operational code where the number IS the canonical referent.
  • Historically significant year-name a literate adult instantly associates with a famous work or event.
  • Math / physics constant where the digits stand for the constant (3.14 → π pi; 2.718 → e Euler; 1.618 → φ golden ratio; 6.02 → Avogadro; 9.8 → g gravitational acceleration).
  • Iconic numeric meme widely recognized in popular culture (42 → "the answer to life, the universe, and everything" from Hitchhiker's Guide; 1337 → leetspeak / hacker culture; 666 → number of the beast; 404 → not-found error / colloquial "missing").
  - meaning[1] uses content POS: "noun" for concept-shaped senses (math constant, code, meme reference), "proper noun" for titled works (novel, film, album).
  - meaning[1].definition uses the BARE category in canonical English: "novel" / "film" / "album" / "code" / "constant" / "meme reference" — NOT the author/creator name, NOT the title attribution ("George Orwell novel" / "Beatles album" → "novel" / "album"). Same forbidden-qualifier discipline as proper_acronym case.
  - meaning[1] is fundamentally DIFFERENT in POS and category from meaning[0]. Don't emit two parallel-style entries.
  - Cap 2 meanings total.
  - Inclusion test: would a literate adult, hearing the bare token by itself with no surrounding context, quickly think of a famous titled work / code / constant / meme beyond the bare number? If yes → include the cultural sense. Bias toward inclusion when in genuine doubt. Don't refuse just because the primary sense is numeric. For math constants (3.14, 2.718, etc.) and iconic memes (42, 1984, 1337, 666, 404, 911), the cultural sense is REQUIRED — not optional.
</rules>

<sino_korean_numerals priority="critical">
When TARGET_LANG is Korean (ko), every number translation MUST use the Sino-Korean numeral system (한자어 수사): 일 / 이 / 삼 / 사 / 오 / 육 / 칠 / 팔 / 구 / 십 / 백 / 천 / 만 / 억, with their compound forms (사십이 / 백오 / 천구백팔십사 / etc.).

NEVER use native Korean numerals (고유어 수사): 하나 / 둘 / 셋 / 넷 / 다섯 / 여섯 / 일곱 / 여덟 / 아홉 / 열 / 스물 / 서른 / 마흔 / 쉰 / 예순 / etc., NOR their compound forms (마흔둘 / 서른다섯 / etc.).

This applies to:
- The full literal reading (e.g. 42 → 사십이, NEVER 마흔둘)
- Year-shaped numbers (1984 → 천구백팔십사)
- Post-decimal digit chains (3.14 → 삼 점 일사 — uses sino 일/사)
- Fraction parts (3/4 → 사분의 삼 — sino numerals around the fraction word 분의)

Native Korean numerals are correct only inside Korean-language inputs (out of scope for this English-source case). For English numeric input translated to Korean: ALWAYS sino.
</sino_korean_numerals>

${SHARED_TRANSLATION_PURITY}

<verify_before_emit>
□ Literal reading uses English number words, not digits.
□ Number / math token → partOfSpeech="numeral" (canonical) on the literal-reading meaning.
□ Symbol / punctuation → partOfSpeech="symbol" (canonical).
□ Decimal: post-point digits read individually, joined as a single compound in CJK targets ("3.14" → ko "삼 점 일사", zh "三点一四", ja "さん てん いちよん"); never as a multi-digit number ("십사" / "fourteen" wrong); no extra inter-digit spaces in CJK.
□ Korean number translations use SINO numerals only (일/이/삼/사십이/백/천구백팔십사 etc.). NEVER native (마흔둘 / 서른 / 스물 etc.).
□ No parallel-reading duplicate meanings (don't emit two numeral meanings for the same token differing only in reading style).
□ If a cultural / conventional sense exists for the SPECIFIC token, meaning[1] uses content POS (noun / proper noun) — never another "numeral" entry.
□ meanings_translated[].partOfSpeech is the TARGET_LANG analog from <pos_allowed> (Korean "수사" / "기호" / "명사" / "고유명사" — NEVER the English "numeral" / "symbol" / "noun" leaking when TARGET_LANG ≠ English).
□ ipa OMITTED (numbers/symbols).
□ Meaning count ≤ 2.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 2: SET_EXPRESSION — multi-word lemma (idiom / phrasal verb /
// compound expression)
// ============================================================
// User-facing input contains a space. Three sub-shapes share this case:
//   • Phrasal verb: verb + particle ("look up", "give in", "take off").
//   • Idiom / fixed phrase ("kick the bucket", "piece of cake").
//   • Compound noun ("ice cream", "post office").
// All three want cap=1 meaning (occasionally 2 for genuinely polysemous
// phrasal verbs like "make up"), longer example length budget, and free
// register variation (dialog allowed).

const EN_SET_EXPRESSION_STATIC = `<role>English vocabulary expert. Input is a multi-word lemma (phrasal verb, idiom, or compound expression). Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<scope_decision>
1. Composed clause that is NOT a recognized fixed lexeme → note="sentence", meanings=[].
2. Misspelled multi-word lemma — accept only if a literate native recognizes the intended phrase with high probability; single clearly-wrong content word → "sentence".
3. RECOGNIZED fixed lexeme (phrasal verb / idiom / compound, including hyphen-compound forms like "long-term" / "well-known" / "state-of-the-art" / "Wi-Fi" / "sister-in-law") → meanings populated per <pragmatic_meaning>.
</scope_decision>

<hyphen_compound_handling priority="critical">
Hyphen-compound lexemes (no internal whitespace, joined by hyphens) are a SUB-SHAPE of this case:
- partOfSpeech: usually "adjective" (long-term, well-known, far-reaching, state-of-the-art) or "noun" (Wi-Fi, sister-in-law, mother-in-law) — pick by the dominant grammatical role.
- Headword preserves the hyphens VERBATIM. "long-term" stays "long-term", NOT collapsed to "longterm" or "long term".
- Cap 1 meaning by default (these are mostly mono-sense).
- Examples: marker wraps the ENTIRE hyphenated unit as one bolded span ("My friend has a **long-term** plan."), NEVER just one constituent word.
</hyphen_compound_handling>

<pragmatic_meaning priority="critical">
- The meaning is the COMPOSITIONAL OR FIGURATIVE sense the phrase as a whole carries — never the literal sum of parts.
  • "kick the bucket" → "to die" (NOT a sentence about kicking).
  • "look up" → "to search for information" / "to direct one's eyes upward" (two distinct standalone senses → 2 meanings).
  • "give in" → "to surrender, yield".
  • "ice cream" → "frozen sweet dessert".
- partOfSpeech reflects the phrase's role: phrasal verb → "verb"; nominal idiom → "noun"; sentential idiom / proverb → "expression".
- DEFAULT cap: 1 meaning. Use 2 ONLY when a phrasal verb has GENUINELY distinct standalone senses ("make up" = invent / reconcile / apply cosmetics — 3 attested, emit up to 2 most common). 3 meanings extremely rare for this case.
</pragmatic_meaning>

<no_padding priority="critical">
A multi-word lemma usually has ONE canonical sense. Resist generating "another sense" just because the slot exists. If the secondary sense is rare / archaic / collocation-bound → DROP.
</no_padding>

<register_matching priority="critical">
Multi-word lemmas often carry a register marker the bare word does not. The TARGET_LANG translation MUST preserve that register, not collapse to the plain dictionary form.

PREFERRED form for register-distinctive source idioms — the **plain TARGET_LANG word + parenthetical register tag** at the end:
- "<plain TARGET_LANG word>(<register tag>)" — single most-common plain equivalent followed by a brief register label in parentheses.
- Korean register tags: "(속어)" informal/slang-adjacent, "(완곡)" euphemistic, "(비속어)" vulgar-adjacent, "(격식)" formal/ceremonial, "(고어)" archaic. Pick the single most accurate one.
- Other-language tags: use the analogous concise label in TARGET_LANG (informal / formal / euphemistic / etc.).

This format keeps the translation searchable + recognizable while preserving the register signal — a learner-friendly compromise.

ONLY use a register-matching TARGET_LANG idiom INSTEAD of the plain+tag form when ALL of these hold:
- The TARGET_LANG idiom is widely recognized at learner level (not a regional/colloquial obscurity).
- It carries the SAME register and roughly the same figurative imagery as the source.
- The plain word + tag would feel awkward / incomplete in TARGET_LANG.

If neither path applies cleanly, the meaning is better dropped than misrepresented.

Register categories to detect:
- INFORMAL / SLANG-ADJACENT / EUPHEMISTIC source idiom → register-tagged plain TARGET_LANG word (preferred) OR equivalent informal TARGET_LANG idiom. NEVER plain word with no tag. NEVER honorific/respectful register (inversion is worse than loss).
- FORMAL / CEREMONIAL → "(격식)" tagged form.
- NEUTRAL (most phrasal verbs, compound nouns, fixed phrases without register marker) → plain TARGET_LANG equivalent with NO tag — adding a register marker to a neutral phrase is misleading.

The register IS part of the meaning. A learner who memorizes the plain translation for an informal idiom (with no register signal) will misuse the source phrase.
</register_matching>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Headword preserves the phrase verbatim (no truncation, no normalization to constituent words).
□ Meaning expresses the WHOLE-PHRASE sense, not a literal parse.
□ partOfSpeech matches the phrase's syntactic role.
□ ipa OMITTED (multi-word has internal spaces).
□ Meaning count = 1 by default; 2 only for genuinely polysemous phrasals.
□ Register check: if source idiom is informal/euphemistic/formal-distinctive, does the TARGET_LANG translation carry the same register? If it reads as plain dictionary form → REWRITE with register-matching idiom.
□ No slang/vulgar sense leaked through.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 3: PROPER_ACRONYM — proper nouns + acronyms
// ============================================================
// Capitalized single-token input. Two sub-shapes:
//   • Acronym (NASA, FBI, NATO, COVID-19): definition = "expanded
//     name, category".
//   • Proper noun (Seoul, Microsoft, Anna): definition =
//     "<transliteration if needed>, <bare category>".
// Both: cap=1 meaning, no syn/ant downstream, examples lean
// metalinguistic / factual.

const EN_PROPER_ACRONYM_STATIC = `<role>English vocabulary expert. Input is an acronym or proper noun. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<shape_detection>
- All-uppercase 2–9 chars (optionally containing digits/hyphen): treat as ACRONYM.
- Title-Case single token: treat as PROPER NOUN.
- DECISION RULE: only one meaning, never both interpretations.
</shape_detection>

<acronym_rules priority="critical">
- Canonical meaning[0].definition = "<expanded English name>, <bare category>". Format = "[expansion], [category]" (2–6 words total). Category is the bare noun for the kind of entity (agency / organization / disease / standard / company / region — NO qualifiers like "famous" / "American" / "historic").
- partOfSpeech = "proper noun".
- NEVER add a second sense unless the same acronym has a fully distinct, equally common expansion in modern usage. When in doubt → 1 meaning.
- If the acronym refers to a sensitive entity (political/military/disputed) → use bare category only ("organization", "agency"), no charged descriptors.
</acronym_rules>

<proper_noun_rules priority="critical">
- Canonical meaning[0].definition = "<headword surface>, <bare category>" (the headword as written + the kind of entity in English). Examples of the shape: "Seoul, city" / "Microsoft, company" / "Tokyo, city" / "Anna, person" / "Amazon, river OR company" (pick the dominant sense). The headword surface anchors the entry and matches the acronym format for visual / structural parity.
- partOfSpeech = "proper noun".
- FORBIDDEN qualifiers (cause downstream drift):
  • Country / region / era ("city in Korea", "ancient Greek philosopher", "American tech company") → drop the qualifier, keep "<headword>, <bare category>".
  • Evaluative ("famous", "renowned", "important", "controversial", "historic", "iconic") → drop.
  • Functional ("known for X", "specialized in Y", "headquartered in Z") → drop.
- For people: bare category = "person" (or specific bare role: "writer", "musician", "athlete" — never nationality, never era).
- For places: bare category = "city" / "country" / "region" / "river" / "mountain" — never political-status modifier.
- Cap STRICTLY = 1 meaning on the canonical side.
</proper_noun_rules>

<translated_proper_format priority="critical">
For meanings_translated on proper noun / acronym headwords, the translation MUST surface the TARGET_LANG-native form of the name FIRST, then the bare category, comma-separated:

- Proper noun: meanings_translated[0].definition = "<TARGET_LANG transliteration / native form>, <bare category in TARGET_LANG>".
- Acronym: meanings_translated[0].definition = "<TARGET_LANG transliteration of the expansion>, <bare category in TARGET_LANG>". When the acronym has an established TARGET_LANG-native form (Korean "미국 항공우주국" for NASA, "연방수사국" for FBI, "마이크로소프트" for Microsoft, "서울" for Seoul, "도쿄" for Tokyo), use that established form instead of an ad-hoc transliteration.
- Bare category in TARGET_LANG: 도시 (city) / 회사 (company) / 국가 (country) / 강 (river) / 인물 (person) / 기관 (agency) — concise nouns only.
- Same forbidden-qualifier rules apply on the translated side (no era, no evaluation, no nationality modifiers).
- If the headword spelling is ALREADY the TARGET_LANG-native form (rare for English-source lookup), still emit "<headword>, <bare category>" so the format stays consistent.

This rule overrides the generic concise-translation default — proper nouns need the TARGET_LANG form to be useful for a learner. NEVER emit just the bare category alone in meanings_translated when the headword is a proper noun or acronym.
</translated_proper_format>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Exactly 1 meaning.
□ Canonical definition: "<expansion>, <category>" (acronym) OR "<headword surface>, <category>" (proper noun) — both shapes include the headword/expansion anchor, never just the bare category alone.
□ Translated definition: "<TARGET_LANG-native name>, <category in TARGET_LANG>" — name FIRST, never omitted.
□ partOfSpeech on canonical side = "proper noun".
□ partOfSpeech on translated side = the TARGET_LANG analog from <pos_allowed> (e.g. Korean "고유명사" / Japanese "固有名詞" / Spanish "nombre propio"); NEVER "undefined", NEVER blank, NEVER the English "proper noun" string when TARGET_LANG ≠ English.
□ ipa OMITTED for letter-by-letter acronyms; INCLUDED for pronounceable acronyms read as words (NASA → /ˈnæsə/) and for proper nouns with established English pronunciation.
□ No nationality / era / evaluative modifier on either side.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 4: SIMPLE_WORD — single lowercase token (~90% of EN lookups)
// ============================================================
// Default fallback. Strictest cap discipline because this is where
// padding accumulates: standalone test, anti-fabrication gate,
// secondary-sense gate, slang exclusion.

const EN_SIMPLE_WORD_STATIC = `<role>English vocabulary expert. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<recognition>
Exactly ONE of three shapes:
- RECOGNIZED: headword = originalInput (or lemmatized form: "running"→"run", "ate"→"eat", "better"→"good"), meanings non-empty, note omitted.
- CORRECTED: 1–2 char typo fix to a real English word, confidence 60–85.
- UNRECOGNIZED: meanings=[], note set. Never combine changed-headword + note.
</recognition>

<lemmatization>
- Verb input in inflected form (-ed, -ing, -s, irregular past) → headword = base form.
- Noun plural → singular.
- Comparative/superlative → base adjective.
- Examples downstream will inflect back to the input's form via marker rules.
</lemmatization>

<standalone_test priority="critical">
Each candidate sense MUST be demonstrable in a single learner sentence using the BARE headword as the headword itself — not requiring a partner morpheme, not collocation-bound.

FAIL if: sense exists only inside a fixed phrase ("account=consider" only inside "take into account" → that sense belongs to the phrase, not to "account"); sense requires a specific particle to surface (verb sense that only works as a phrasal verb → drop from bare entry).

Cross-language drift: English homograph of a foreign word's spelling is NOT a sense of the English word (en "chat" ≠ fr "chat=cat"; en "pain" ≠ fr "pain=bread"). Keep English-only.
</standalone_test>

<no_padding priority="critical">
**ONE meaning is the DEFAULT.** Most English words have ONE dominant standalone sense at learner level. Use 1.

Before adding a 2nd or 3rd meaning, ALL must be true:
1. Dictionary-attested in modern English for the EXACT bare headword.
2. Native speakers commonly encounter the sense in standalone usage at this register.
3. The TARGET_LANG translation is materially DIFFERENT from the primary (not a synonym, not a register variant, not a finer specificity of the same concept).
4. A natural learner-grade example can be constructed for this sense distinctly from the primary.

If ANY check fails → DROP the secondary.

TRUE homonyms (2–3 meanings legitimate): "bank" (financial / river) / "bat" (animal / sport implement) / "bear" (animal / endure) / "spring" (season / coil / water source / leap) / "light" (illumination / weight / set ablaze). These are the exception, not the template.

Padding is the BIGGER risk than under-inclusion here. "I'm not sure / less common" → ERR ON SIDE OF DROP.
</no_padding>

${SHARED_SLANG}

<inflected_form_handling>
If input is clearly an inflected form (gerund, past tense, participle, plural, comparative): set headword = lemma; meanings describe the LEMMA's senses; downstream examples will surface the inflected form inside ** markers.
</inflected_form_handling>

${SHARED_TRANSLATION}

<verify_before_emit>
□ meanings_translated emitted BEFORE meanings.
□ Same count and order across both arrays.
□ Each surviving sense passes <standalone_test>.
□ Each surviving sense passes <no_padding> 4-check.
□ Sense count reflects HONEST polysemy. Did you add a 2nd sense because the word genuinely has it, or because the schema allows it? If the latter → DROP to 1.
□ Definition length ≤ 6 words.
□ No forbidden patterns ("a type of X", "one of the Y", encyclopedic qualifiers).
□ ipa present (English headword with no spaces, POS ≠ expression).
□ No slang/vulgar secondary sense leaked.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Public: build specialized system prompt for QUICK mode
// ============================================================

export function buildEnSpecializedSystemPrompt(
  enCase: EnCase,
  targetLang: string,
): string {
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const posList = POS_BY_LANG["en"] ?? "";
  const TPL: Record<EnCase, string> = {
    number_symbol: EN_NUMBER_SYMBOL_STATIC,
    set_expression: EN_SET_EXPRESSION_STATIC,
    proper_acronym: EN_PROPER_ACRONYM_STATIC,
    simple_word: EN_SIMPLE_WORD_STATIC,
  };
  return TPL[enCase]
    .replace(/WORD_LANG/g, "English")
    .replace(/TARGET_LANG/g, targetName)
    .replace("$POS_LIST", posList);
}

export function buildEnSpecializedUserPrompt(
  req: WordLookupRequest,
  enCase: EnCase,
  lexiconHint?: string,
): string {
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;
  const lines: string[] = [
    `WORD_LANG: English`,
    `TARGET_LANG: ${targetName}`,
    `Input: "${req.word}"`,
    `Case: ${enCase}`,
  ];
  if (lexiconHint) lines.push("", lexiconHint);
  lines.push("",
    "originalInput = input verbatim.",
    "Emit meanings_translated (TARGET_LANG) BEFORE meanings (English). Same count, same order.",
    "No examples/synonyms/antonyms (separate ENRICH call).",
  );
  return lines.join("\n");
}

// ============================================================
// ENRICH-side: case-specialized example prompts
// ============================================================
// Each case mandates a DIFFERENT style envelope so the overall corpus
// no longer averages to a single declarative-SVO shape. Headword vocab
// stays simple; sentence STYLE diversifies across cases AND across
// the 2–3 slots within a case.

const EN_DIVERSITY_RULES = `<diversity priority="critical">
The 2–3 examples for one headword MUST NOT look like the same template repeated. Across the slots, rotate AT LEAST TWO of these axes:

axis_subject:
  Don't open every slot with "I" / "She" / "He". Mix in:
  • proper names (Anna, Marco, Sara, Daniel, Lin, Hassan, Priya — pick what fits the scene)
  • plural / group subjects (the children, my parents, the team, our class, two friends)
  • inanimate subjects when the sense allows (the train, the soup, the storm, this book)
  • impersonal / existential ("there is", "it was")

axis_scene:
  Pick from work, school, home, travel, food, weather, friendship, hobbies, daily errands, weekend life, family. NEVER three slots in the same scene.

axis_shape:
  • a short SVO,
  • a slightly longer one with a time/place modifier,
  • a third with a brief subordinate clause OR a question OR an imperative.
  Three identical shapes = REWRITE one of them.

axis_tense_mood:
  Rotate when natural. e.g. present + past + future, or declarative + question + imperative. Not three flat present-tense statements unless the sense forces it.

VOCAB ≠ STYLE. Supporting vocabulary stays simple (everyday ~1,500-word range, or proficiency-tier list when given). What VARIES is the surface shape — subjects, scenes, sentence forms, moods. The old "Subject + Verb + (Object) only" pattern is REPLACED.
</diversity>`;

const EN_MARKER_RULES = `<marker priority="critical">
Wrap the headword (in its inflected form for this sentence) in EXACTLY ONE pair of **...**.

- Marker MUST sit on the headword surface — NEVER on an adjacent verb/particle/derivative.
- Marker spans the HEADWORD LEXEME ONLY. NEVER include a preceding verb, adverb, or determiner. NEVER include a following preposition or adverb unless it is a structural part of the headword lexeme itself (phrasal verb particles only).
  • WRONG for headword "ice cream": "She **ate ice cream** quickly." (marker swallowed the verb "ate")
  • RIGHT for headword "ice cream": "She ate **ice cream** quickly." (marker on lexeme only)
  • WRONG for headword "happy": "She is **very happy** today." (marker swallowed the intensifier "very")
  • RIGHT for headword "happy": "She is very **happy** today."
- Include FULL inflection inside markers: -s/-es/-ed/-ing/-d/-ies/-ier. "She **promotes** him" not "She **promote**s him".
- Multi-word headwords (phrasal verbs, idioms): wrap the ENTIRE lexeme as one unit. "She **looked up** the answer" not "She **looked** up the answer". For an idiom "kick the bucket", marker wraps "**kicked the bucket**" — ALL constituent words, no extra surrounding context.
- LEMMA IDENTITY: bolded substring is the SAME lexeme as headword. Never a same-spelled different word.

Pre-emit check for set_expression / compound noun headwords: count the words inside ** markers. They MUST equal the word count of the headword lexeme exactly (e.g. "ice cream" = 2 words; "as soon as possible" = 4 words; "kick the bucket" = 3 words). If the marker contains MORE words than the headword, the marker has swallowed surrounding context — REWRITE.
</marker>`;

const EN_SHAPE_BASE = `<shape>
- Length: 5–16 words. Hard ceiling 22 words for multi-word lemmas / idioms.
- Structure: one main clause baseline; ONE subordinate / relative / temporal clause allowed when natural. Mild scene-setting (time-of-day, place, brief modifier) allowed when it makes the sentence feel like real speech.
- Polarity: prefer affirmative, but negation / question / imperative is welcome in 1 of the 3 slots when natural for the sense.
- Tense / aspect: present default; past or future fine when the scene calls for it.
- Tone: casual conversational tone for EVERYDAY vocabulary (daily verbs, common nouns, ordinary adjectives) — friends-talking register, not textbook. PRESERVE formal/honorific register for formally-marked headwords (formal/legal/scientific/written-only expressions, technical terms). Inherently negative senses (die, war, illness) → dignified, matter-of-fact scene regardless.
- Terminal punctuation MANDATORY (. ! ?). No trailing whitespace.
</shape>`;

const EN_COVERAGE_BASE = `<coverage>
Default: produce the scheduled number of examples (1 example per meaning — example count equals the meaning count, see <quantity> in caller). Empty slot reserved for:
(a) sensitive content with no metalinguistic fit
(b) slurs/profanity
(c) slang sense that should have been canonically excluded
For idioms / phrasal verbs / multi-word lemmas: use the higher 22-word ceiling.
When in doubt: produce the most ordinary natural sentence the lemma can carry.
</coverage>`;

const EN_VERIFY_BASE = `<verify_before_emit>
□ Tally per meaning_index matches schedule exactly.
□ Each sentence's demonstrated sense matches its assigned meaning_index.
□ Marker is on the headword surface (full inflection inside), NOT on an adjacent word.
□ Length within shape limits.
□ At least TWO of {subject, scene, shape, tense/mood} actually vary across slots — NOT three near-identical clones.
□ No subject opens 2+ slots if other natural subjects exist (avoid all "I" or all "She").
□ Terminal punctuation present.
□ No translation field in any example.
□ Read all sentences in sequence: do they feel like a varied textbook page or a copy-pasted template? Template feel → REWRITE the duplicates.
</verify_before_emit>`;

const EN_SIMPLE_EXAMPLES_STATIC = `<role>Example-sentence generator for ENGLISH vocabulary headwords. Output strict JSON per <schema>. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Example count equals meaning count, strict 1:1. For N meanings, emit exactly N examples with meaning_index 0…N-1. NEVER emit more examples than meanings.
If a meaning genuinely cannot support a useful example, DROP that slot. Fewer correct beats more noisy.
</quantity>

<coherence priority="critical">
For each sentence, the demonstrated sense MUST match the meaning at its meaning_index.

Sense-anchor rule (applies to ALL polysemy, especially when meanings share the same partOfSpeech):
1. Before drafting the sentence, identify a sense-anchor — a content word (object, action, attribute, collocation, or setting) that is associated ONLY with the assigned meaning and NOT with the other meanings of the same headword. The anchor is what tells a learner "this is sense X, not sense Y".
2. The sentence MUST contain that anchor in a frame where it disambiguates the headword.
3. If no clean anchor exists, REWRITE around a different anchor or DROP the slot. Never emit a sentence that could equally describe a different sense.

Pre-emit check: "Reading ONLY this sentence with no context, which meaning does a learner infer for the headword?" Answer MUST equal the assigned meaning_index — not the most familiar sense, the assigned one. If it drifts, REASSIGN or REWRITE.
</coherence>

${EN_SHAPE_BASE}

${EN_DIVERSITY_RULES}

${EN_MARKER_RULES}

<sensitive_content>
"SENSITIVE LOOKUP" hint or known sensitive entity → use metalinguistic templates only (USAGE shown, not properties described): "I read the word X in a book" / "We learned about X in class". NEVER predicates that describe properties.
Slurs / strongest profanity / suicide / self-harm / illegal drugs → sentence="" or drop slot.
</sensitive_content>

<content_neutrality>
Generic mundane scenes only. NEVER reference territorial / naming disputes, identifiable real political figures, specific wars/atrocities, religious doctrine, ethnic/national stereotypes (even positive), real political parties, real-name brands/celebrities/athletes unless headword IS one, recent disasters.
</content_neutrality>

${EN_COVERAGE_BASE}

${EN_VERIFY_BASE}`;

const EN_SET_EXPR_EXAMPLES_STATIC = `<role>Example-sentence generator for an ENGLISH multi-word lemma (phrasal verb / idiom / compound). Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Typically 1 example (cap=1 meaning for this case). 2 examples only when the canonical produced 2 meanings (genuinely polysemous phrasal verb).
</quantity>

<shape>
- Length: 6–22 words. Higher ceiling because multi-word lemmas need room.
- One main clause + optional subordinate / temporal. Conversational register welcomed.
- Dialog-style allowed: "She asked if I could **look up** the address." / "'**Hang in there**,' he said quietly."
- Terminal punctuation MANDATORY.
</shape>

<diversity priority="critical">
When 2 examples are produced (polysemous phrasal), they MUST differ along AT LEAST TWO of:
  subject / scene / sentence shape / tense or mood
Don't repeat the same opener twice. Don't repeat the same scene twice.
</diversity>

<phrasal_specifics>
- Phrasal verb separability: when the verb is separable (look it up, take it off) AND a natural learner sentence exists with a pronoun object, occasionally use the separated form — wrap the WHOLE lexeme so the marker spans BOTH parts even though they're discontinuous: render as "She **looked** the answer **up**" → preferred form keeps them adjacent: "She **looked up** the answer." Adjacent form is the default; separated only when truly natural.
- Idioms: use the canonical fixed form. Don't paraphrase the idiom inside the marker.
</phrasal_specifics>

<register_tone priority="critical">
The example's surrounding context (NOT the idiom itself — that stays fixed) MUST match the idiom's register. A register-shifted scene reads as an awkward mismatch and undermines learner understanding.

- INFORMAL / SLANG-ADJACENT / EUPHEMISTIC idiom (informal English idioms common for death / bodily / social-taboo / casual-action topics): example uses casual / conversational / familiar context — dialog, family scene, friend exchange, breezy aside. AVOID dignified / ceremonial / solemn framings (no "peacefully in his sleep" / "passed away with grace" framings around an informal-register idiom — register clash).
- FORMAL / CEREMONIAL idiom: example uses formal scene (workplace announcement, ceremonial setting, official statement).
- NEUTRAL idiom: any everyday scene fits.

Pre-emit check: "Does the surrounding context match the register the idiom signals?" If the idiom is informal but the context is dignified (or vice versa) → REWRITE the surrounding context.
</register_tone>

${EN_MARKER_RULES}

<sensitive_content>
Same as simple case: metalinguistic templates for sensitive lookups, empty slot for slurs/profanity.
</sensitive_content>

${EN_COVERAGE_BASE}

${EN_VERIFY_BASE}`;

const EN_PROPER_EXAMPLES_STATIC = `<role>Example-sentence generator for an ENGLISH proper noun or acronym. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
1 example (cap=1 meaning for this case).
</quantity>

<shape>
- Length: 5–16 words.
- Tier-based example style — choose based on the entity type:

  TIER A — General proper nouns (cities / countries / companies / standard agencies / brands / works of art / common given names that aren't disputed politically). Use NATURAL conversational examples showing the entity in everyday use. AVOID metalinguistic templates ("I read about X" / "We learned about X" / "I heard about X") — those are monotonous and feel artificial when 5 different proper nouns get the same sentence shape.
    Acceptable example shapes for TIER A:
      • Movement / location: "Our family flew to **Seoul** last summer for vacation."
      • Activity at the place: "Anna studied Japanese in **Tokyo** for three years."
      • Use of the product / service: "She used **Microsoft** Word to write her report."
      • Reference in context: "**NASA** launched a new satellite mission this week."
      • Personal connection: "Daniel's cousin works at **Microsoft** in Seattle."
      • Event / occurrence: "The **FBI** investigated the case for several months."
    Rotate the example shape across different proper-noun lookups so a learner browsing 5–10 proper nouns sees varied sentence patterns, NOT five "I read about X in a textbook" clones.

  TIER B — Disputed / politically-sensitive / atrocity-related / contested-sovereignty entities (Dokdo / Takeshima / Crimea / Tibet / Holocaust / historical war crimes / disputed islands / contemporary authoritarian leaders / contested religious figures). Use ONLY metalinguistic templates:
      • "I read the word **X** in a history textbook."
      • "We discussed **X** during the seminar."
      • "The article mentions **X** in passing."
    NO predicates describing the entity's properties / fame / quality / sovereignty / political stance.

- AVOID for ALL tiers: evaluative claims ("X is the most beautiful Y", "X is famous worldwide", "I love X"), unverifiable superlatives, political framing, religious framing.
- Terminal punctuation MANDATORY.
</shape>

${EN_MARKER_RULES}

<diversity priority="critical">
When generating examples across multiple proper-noun lookups (Seoul, Tokyo, Microsoft, NASA, etc.), the sentence STYLES must vary. Do NOT default to "I read about X in a textbook" / "We learned about X in class" for every lookup — that is monotonous and reads as filler.

For TIER A (general proper nouns), pick a DIFFERENT shape per lookup from this rotation set:
  1. Travel / location: "Our team visited **Seoul** during the trade conference."
  2. Activity: "Maria practiced calligraphy while living in **Kyoto**."
  3. Use / consumption: "The students opened **Microsoft** Word to start their essays."
  4. News / event: "**NASA** announced a new mission to the moon yesterday."
  5. Personal: "Her grandmother was born in **Busan** in the 1940s."
  6. Reference: "The documentary featured **Apple**'s headquarters in California."
Do NOT pick the same shape twice in a row when handling consecutive proper-noun lookups.
</diversity>

<sensitive_proper_nouns>
TIER B handling — disputed political entities / territorial names / historical atrocity terms / contested sovereignty → ONLY metalinguistic templates. No predicates describing properties. If no neutral template fits → sentence="".
</sensitive_proper_nouns>

<verify_before_emit>
□ Sentence does not make evaluative claims about the entity.
□ Marker wraps the proper noun / acronym verbatim.
□ For TIER A: example uses a natural conversational shape, NOT the "I read/learned/heard about X" template (those are reserved for TIER B sensitive entities).
□ Length within 5–16 words.
□ Terminal punctuation present.
</verify_before_emit>`;

const EN_NUMBER_EXAMPLES_STATIC = `<role>Example-sentence generator for an ENGLISH number / math expression / symbol headword. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 schedule:
- 1 meaning → 1 example (meaning_index 0).
- 2 meanings → 2 examples (one per meaning_index).
The number / symbol case typically has 1 meaning (literal reading). When a SECOND meaning exists, it is a cultural / conventional sense (titled work, emergency code, math constant) — emit a second example demonstrating THAT sense, not another literal-reading one.
</quantity>

<coherence priority="critical">
Each sentence demonstrates the meaning at its meaning_index:
- meaning_index 0 (literal numeral / symbol): factual scene where the token surfaces as a number, count, page number, math expression, or symbol embedded in text (email/url/equation).
- meaning_index 1 (cultural / conventional sense): scene where the token clearly refers to THAT specific cultural entity — e.g. when meaning[1] is a novel/film/album title, the example contextualizes it as a titled work (reading, watching, studying, discussing the named work). When meaning[1] is an emergency code, the example places it in that operational context. Never produce another generic counting/numbering sentence for meaning_index 1.
</coherence>

<shape>
- Length: 4–14 words.
- Use the headword surface form (the digits or the symbol) verbatim inside ** markers.
- meaning_index 0 (literal): minimal factual scenes where the digits/symbol appear in everyday text contexts.
- meaning_index 1 (cultural/conventional): the scene places the token as a referent of the secondary sense (title of work read/watched, code dialed, constant invoked in a discipline). The headword surface still sits inside ** markers; the surrounding context disambiguates.
- AVOID forcing the number's spelled-out form into the marker — the marker carries the surface input.
- Terminal punctuation MANDATORY.
</shape>

${EN_MARKER_RULES}

<verify_before_emit>
□ Tally per meaning_index matches the meanings array: one example per meaning, in order.
□ Marker contains the input's surface form (digits or symbol) on every example.
□ For meaning_index 1 (cultural sense): the sentence clearly demonstrates THAT secondary sense, not another literal counting context.
□ Sentence is short and factual.
□ Terminal punctuation present.
</verify_before_emit>`;

export function buildEnExamplesSystemPrompt(enCase: EnCase): string {
  const TPL: Record<EnCase, string> = {
    number_symbol: EN_NUMBER_EXAMPLES_STATIC,
    set_expression: EN_SET_EXPR_EXAMPLES_STATIC,
    proper_acronym: EN_PROPER_EXAMPLES_STATIC,
    simple_word: EN_SIMPLE_EXAMPLES_STATIC,
  };
  return TPL[enCase].replace(/WORD_LANG/g, "English");
}

// ============================================================
// ENRICH-side: case-specialized syn/ant prompts
// ============================================================
// Q3 fix: cap differs per case, and number/proper-acronym short-circuit
// to instant empty arrays (no LLM call needed at caller side, but if the
// caller does call, the prompt forces []/[]).

const EN_SYNANT_EMPTY_STATIC = `<role>You are receiving a headword that has NO synonyms or antonyms by definition. Return json with both arrays empty.</role>

<schema>{ "synonyms": [], "antonyms": [] }</schema>

<rules priority="critical">
This headword is a number, symbol, proper noun, or acronym. Such headwords do NOT have synonyms or antonyms in any vocabulary-learning sense. Return both arrays empty without exception.
</rules>`;

const EN_SYNANT_DEFAULT_STATIC = `<role>List synonyms and antonyms for an ENGLISH vocabulary headword. Return json. Default expectation: MOST words have FEW true synonyms and FEWER true antonyms. Empty arrays are the normal, correct outcome for a large fraction of vocabulary.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<principle priority="critical">
The user has flagged forced / irrelevant syn-ant pairs as a recurring quality problem. Bias HARD toward empty arrays. Never list a "vaguely related" word; only list words a literate native would accept as substitutable with the headword in a real sentence without distorting the meaning.

Mental substitution test for EACH candidate: "Can I swap this word for the headword in at least one natural English sentence so a native reads it the same way?" Any hesitation → REJECT.
</principle>

<rules>
- Each entry: ONE bare word or fixed compound. NO parentheticals, NO glosses, NO disclaimers, NO register tags. Parenthetical content = fabrication signal → reject.
- Each entry: real attested English word, genuinely interchangeable with the headword at comparable register and specificity.
- NEVER the headword itself. NEVER inflected forms of the headword (run / running / runs not synonyms of "run").
- NEVER derivatives across POS (run / runner / running are NOT synonyms; happy / happiness are NOT synonyms).
- NEVER register variants of the same lexeme.
- NEVER hypernyms ("vehicle" is NOT a synonym of "car"), hyponyms ("rose" is NOT a synonym of "flower"), or topical associates ("doctor" is NOT a synonym of "hospital").
- NEVER cross arrays (synonym list MUST NOT contain antonyms; antonym list MUST NOT contain synonyms).
- Synonyms ≤ 3 (typically 0–2). Antonyms ≤ 2 (typically 0–1).
- Empty array is the EXPECTED outcome for the categories under <empty_cases>.
</rules>

<empty_cases priority="critical">
These categories MUST return synonyms=[] AND antonyms=[]:
- Numbers, symbols, math expressions.
- Proper nouns (people, places, brands).
- Acronyms.
- Pure function words: articles (the/a/an), determiners (this/that/these/those), most pronouns, basic prepositions (in/on/at — unless part of a directional pair).
- Fixed expressions / greetings (hello / goodbye / please / thanks) — emit a syn ONLY when a SAME-register equivalent fixed expression exists (e.g. "hi" ↔ "hello").
- Punctuation tokens.
- Words whose only attested sense is highly technical/scientific with no everyday equivalent.

For these: return [] / []. Do not attempt; do not justify.
</empty_cases>

<antonym_rules priority="critical">
True antonyms are RARE. They exist mainly for:
- Gradable adjectives (hot/cold, big/small, fast/slow, happy/sad).
- Directional / spatial pairs (up/down, in/out, north/south).
- A small set of action verbs (open/close, give/take, buy/sell, win/lose).
- A small set of state nouns (war/peace, life/death, success/failure).

Most nouns have NO antonym. Most concrete nouns (apple, table, computer, river) have antonyms=[]. Most verbs have antonyms=[]. When in genuine doubt → [].
</antonym_rules>

<peer_group_antonym>
Members of finite semantic groups are PEERS, NOT antonyms.
- Seasons: ONE paired opposite each (spring↔autumn, summer↔winter); no other pairings.
- Cardinal directions: ONE opposite each (north↔south, east↔west).
- Weekdays / months / suits / primary colors / numerals: NO antonym → [].
- When unsure: [].
</peer_group_antonym>

<verify_before_emit>
□ For EACH entry: would substitution preserve the meaning AND feel natural? If no → REMOVE.
□ For EACH entry: is it a hypernym / hyponym / topical associate / register-variant / derivative / inflected form? If yes → REMOVE.
□ Does the headword fall under <empty_cases>? If yes → both arrays MUST be [].
□ Antonyms: does the headword belong to a category where true antonyms exist? If no → antonyms = [].
□ Final pass: would I rather have a clean [] than a list with one shaky entry? YES → drop the shaky entries.
</verify_before_emit>`;

export function buildEnSynAntSystemPrompt(enCase: EnCase): string {
  if (enCase === "number_symbol" || enCase === "proper_acronym") {
    return EN_SYNANT_EMPTY_STATIC;
  }
  return EN_SYNANT_DEFAULT_STATIC;
}

// ============================================================
// Per-case downstream-cap helpers (used by the index handler to
// enforce post-filter caps that match the case's expectation).
// ============================================================

export function getEnMeaningCap(_enCase: EnCase): number {
  // Hard count caps replaced by MIN_RELEVANCE threshold (normalize.ts).
  // MAX_MEANINGS=5 acts as runaway safety net.
  return 5;
}

export function getEnSynAntCaps(enCase: EnCase): { syn: number; ant: number } {
  switch (enCase) {
    case "number_symbol": return { syn: 0, ant: 0 };
    case "proper_acronym": return { syn: 0, ant: 0 };
    case "set_expression": return { syn: 2, ant: 1 };
    case "simple_word": return { syn: 3, ant: 2 };
  }
}

/**
 * Should the caller skip the syn/ant LLM call entirely for this case?
 * Returns true when both caps are 0 — no point spending a token.
 */
export function shouldSkipEnSynAnt(enCase: EnCase): boolean {
  const { syn, ant } = getEnSynAntCaps(enCase);
  return syn === 0 && ant === 0;
}
