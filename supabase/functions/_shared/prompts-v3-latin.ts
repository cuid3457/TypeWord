// prompts-v3-latin.ts
// -----------------------------------------------------------
// Latin-family branched prompts (es / fr / de / it) for word-lookup-v2.
// Mirrors prompts-v3-en.ts. Single file with builder-time language
// injection (ES_RULES / FR_RULES / DE_RULES / IT_RULES) because the 4
// languages share ~80% of the prompt shape and diverge only on
// gender / inflection / diacritic / capitalization rules.
//
// Cases (same 4 as en):
//   number_symbol   — pure digits / math / symbol-only input
//   set_expression  — input contains whitespace (idiom, multi-word noun)
//   proper_acronym  — all-caps acronym OR Title-Case single token.
//                     SKIPPED for German (every common noun is also
//                     capitalized, so we can't disambiguate by shape —
//                     German Title-Case falls through to simple_word
//                     where the model decides semantically).
//   simple_word     — single token (default; ~90% of lookups)
//
// Same Q1/Q2/Q3 fixes as the en pilot:
//   (Q1) case-aware branching
//   (Q2) example diversity (subject/scene/shape/tense rotation)
//   (Q3) per-case cap discipline (meanings/syn/ant)
// -----------------------------------------------------------

import type { WordLookupRequest } from "./types.ts";
import { LANG_NAMES, POS_BY_LANG } from "./prompts-v3.ts";

export type LatinCase =
  | "number_symbol"
  | "set_expression"
  | "proper_acronym"
  | "simple_word";

export type LatinSourceLang = "es" | "fr" | "de" | "it";

const LATIN_LANGS = new Set<string>(["es", "fr", "de", "it"]);
export function isLatinSource(lang: string): lang is LatinSourceLang {
  return LATIN_LANGS.has(lang);
}

// Same regex set as en. The only divergence is the proper_acronym
// branch: de skips Title-Case because every German noun is capitalized.
const SYMBOL_RE = /^[^\p{L}\p{N}\s]+$/u;
const NUMBER_RE = /^[\d\s+\-*/^!=<>().%,.]+$/;
const PHRASE_RE = /\s/;
const ACRONYM_RE = /^[A-Z][A-Z0-9-]{1,9}$/;
const TITLE_CASE_RE = /^[A-Z][a-zà-žßÀ-Ž]+$/;

export function classifyLatinInput(
  word: string,
  sourceLang: LatinSourceLang,
): LatinCase {
  const w = (word ?? "").trim();
  if (!w) return "simple_word";
  if (SYMBOL_RE.test(w)) return "number_symbol";
  if (NUMBER_RE.test(w)) return "number_symbol";
  if (PHRASE_RE.test(w)) return "set_expression";
  if (ACRONYM_RE.test(w)) return "proper_acronym";
  // German: all common nouns are capitalized too, so Title-Case alone
  // can't distinguish proper noun from common noun. Send to simple_word
  // where the model decides semantically.
  if (sourceLang !== "de" && TITLE_CASE_RE.test(w)) return "proper_acronym";
  return "simple_word";
}

// ============================================================
// Per-language injection blocks
// ============================================================
// Surfaced into each case's STATIC prompt at builder time via the
// $LANG_SPECIFIC placeholder. Keeps the case templates uniform while
// letting each language's gender / inflection / orthography rules
// override.

const ES_RULES = `<spanish_specifics>
- Lemmatization: verbs → infinitive (-ar / -er / -ir). Nouns → singular. Adjectives → masculine singular.
- Gender (m / f) MANDATORY on every noun meaning. Use "mf" for epicene nouns whose single surface form serves both genders (el/la modelo, el/la artista, el/la testigo).
- Diacritics: restore tildes (á / é / í / ó / ú / ü / ñ) on the canonical headword even when the input omits them.
- Reflexive verbs: canonical headword is the -se form (lavarse, levantarse). Treat as a reflexive lexeme; do NOT split off -se.
- Strip articles (el / la / los / las / un / una) from canonical headword. Gender goes in the gender field, not the headword.
- False-friend awareness: "actual"=current (not "actual"), "embarazada"=pregnant (not "embarrassed"), "carpeta"=folder (not "carpet"), "éxito"=success (not "exit"), "ropa"=clothing (not "rope").
</spanish_specifics>`;

const FR_RULES = `<french_specifics>
- Lemmatization: verbs → infinitive (-er / -ir / -re / -oir). Nouns → singular. Adjectives → masculine singular.
- Gender (m / f) MANDATORY on every noun meaning. Use "mf" for epicene nouns (élève, médecin, dentiste, journaliste, partenaire).
- Diacritics: restore accents (é / è / ê / à / â / î / ô / û / ç / ù) on canonical headword.
- Strip articles (le / la / les / un / une / des / l') from canonical. "l'eau" → headword "eau", gender = f. "un homme" → headword "homme", gender = m.
- Elision in examples / translations: le / la / de / je / ne / que / ce / se / me / te (and si before il/ils) contract to l' / d' / j' / n' / qu' / c' / s' / m' / t' before vowel-initial and h-muet words. "Je écris" / "Le étoile" wrong → "J'écris" / "L'étoile".
- Reflexive verbs: canonical headword INCLUDES "se" (se laver, s'habiller, se réveiller) — that's the lemma form in French.
- False-friend awareness: "lecture"=reading (not "lecture"), "coutume"=custom (not "customs"), "sensible"=sensitive (not "sensible"), "chair"=flesh (not "chair"), "monnaie"=currency/change (not just "money"), "librairie"=bookshop (not "library").
</french_specifics>`;

const DE_RULES = `<german_specifics>
- Lemmatization: verbs → infinitive (-en). Nouns → singular nominative. Adjectives → uninflected base form.
- Capitalization: ALL German nouns are capitalized. Restore capitalization on the canonical headword even when the input is lowercase (hund → Hund, haus → Haus). Non-nouns stay lowercase by default unless sentence-initial.
- Gender (m / f / n) MANDATORY on every noun meaning. German has 3 grammatical genders — never default to "m" without evidence. Use "n" for neuter (das Kind, das Haus, das Mädchen).
- Strip articles (der / die / das / ein / eine / einer / einem / etc.) from canonical headword — they're gender markers, NOT part of the lemma. "der Hund" → headword "Hund", gender = m.
- Separable verbs: canonical headword is the FUSED infinitive form (aufstehen, mitkommen, einkaufen, ankommen), NOT split. In example sentences, the separated form ("Ich stehe um sieben auf") is the natural usage — render the FULL lemma inside ** markers when separated by keeping both parts highlighted appropriately (preferred: keep them adjacent in infinitive contexts; separated forms can leave the ** marker on just the conjugated stem with the prefix outside, but flag this only when natural).
- Compound nouns: canonical is the full compound (Sonnenuntergang, Krankenhaus, Wörterbuch). Do not split into constituent words.
- Umlauts: restore ä / ö / ü / ß on canonical.
- False-friend awareness: "Gift"=poison (not "gift"), "bekommen"=to receive (not "become"), "Chef"=boss (not "chef"), "Rezept"=recipe OR prescription (not just "receipt"), "sensibel"=sensitive (not "sensible").
</german_specifics>`;

const IT_RULES = `<italian_specifics>
- Lemmatization: verbs → infinitive (-are / -ere / -ire). Nouns → singular. Adjectives → masculine singular.
- Gender (m / f) MANDATORY on every noun meaning. Use "mf" for epicene nouns (il/la collega, il/la nipote, il/la pediatra).
- Diacritics: restore accents (à / è / é / ì / ò / ù) on canonical headword.
- Strip articles (il / lo / la / l' / i / gli / le / un / uno / una) from canonical headword.
- Reflexive verbs: canonical headword is the -si form (lavarsi, alzarsi, vestirsi) — that's the lemma form in Italian.
- Apocope / elision: standard contractions (l'amico, un'amica) — strip in canonical.
- False-friend awareness: "morbido"=soft (not "morbid"), "fattoria"=farm (not "factory"), "camera"=room (not "camera"=macchina fotografica), "parente"=relative (not "parent"=genitore), "magazzino"=warehouse (not "magazine"=rivista).
</italian_specifics>`;

function buildLangSpecificRules(sourceLang: LatinSourceLang): string {
  switch (sourceLang) {
    case "es": return ES_RULES;
    case "fr": return FR_RULES;
    case "de": return DE_RULES;
    case "it": return IT_RULES;
  }
}

// ============================================================
// Shared schema fragment — Latin variant
// Differences from en:
//   • gender REQUIRED on noun meanings (en omits)
//   • ipa REQUIRED (Latin script, phonemically opaque)
//   • reading OMITTED (no CJK reading layer)
// ============================================================

const SHARED_SCHEMA = `Output a strict JSON object matching this schema (do not wrap in markdown fences):

<schema>
{
  "headword": string,                       // corrected WORD_LANG lemma form (capitalization, diacritics, gender / article stripped)
  "ipa"?: string,                            // see <ipa_rule>; required when applicable
  "originalInput": string,                   // input verbatim
  "confidence": number,                      // 0–100
  "note"?: "sentence" | "non_word" | "wrong_language",
  "meanings_translated": [{ "definition": string, "partOfSpeech": string }],   // TARGET_LANG, emit FIRST for streaming
  "meanings": [{ "definition": string, "partOfSpeech": string, "relevanceScore": number, "gender"?: "m"|"f"|"n"|"mf" }]
}
</schema>

<key_order priority="critical">
Emit "meanings_translated" BEFORE "meanings". Same count, same order. Index N in both arrays = SAME sense.
</key_order>

<ipa_rule>
EMIT ipa when headword has no internal spaces AND primary partOfSpeech ≠ "expression".
- Real IPA chars only (ʃ ɛ ø χ ʁ ŋ ʒ θ ð æ ɑ ɔ ɪ ʊ ə ɚ ɝ ɹ ʔ ʎ ɲ etc.). Stress (ˈ ˌ) where applicable. No slashes / brackets.
- Reference accents: es=Castilian, fr=standard Parisian, de=standard German, it=standard Italian.
- Transcribe the EXACT lemma form (singular / infinitive). For inflected input, the IPA matches the LEMMA (the headword).
</ipa_rule>

<gender_rule priority="critical">
On every NOUN meaning: emit "gender" with value "m" / "f" / "n" (German only) / "mf" (epicene).
- NEVER omit gender on a noun.
- NEVER guess: if the input is ambiguous (homograph with different genders for different senses), each meaning carries its own gender.
- "mf" only for genuinely epicene nouns (one surface form, two grammatical genders via determiner switch).
- Non-noun POS (verb / adjective / adverb / etc.) do NOT emit gender.
</gender_rule>

<pos_language_rule priority="critical">
The "partOfSpeech" string MUST be picked from the appropriate language's POS list — NEVER an English term when the relevant language is not English, NEVER an ad-hoc translation.

- meanings[i].partOfSpeech: pick from <pos_allowed> (WORD_LANG terms). NEVER English "proper noun" / "numeral" / "symbol" / "expression" when WORD_LANG ≠ English.
- meanings_translated[i].partOfSpeech: pick from <pos_allowed_target> (TARGET_LANG terms). NEVER invent a literal translation (e.g. for Korean: emit "고유명사" not "이름 고유"; "수사" not "숫자"; "기호" not "부호"; "표현" not "관용구"). The TARGET_LANG list is the SOURCE OF TRUTH — pick from it, do not paraphrase.
- The English POS keywords appearing elsewhere in this prompt ("proper noun" / "numeral" / "symbol" / "expression" / "verb" / "noun" / "adjective") are semantic identifiers, not literal output strings. Map them to the WORD_LANG / TARGET_LANG entries in <pos_allowed> / <pos_allowed_target> before emit.

Failure mode to avoid: literal AI translations of English POS terms ("이름 고유" / "字符 명사" / etc.). Stick to the official lists.
</pos_language_rule>

<forbidden>
- "reading" key (no CJK reading layer).
- "examples", "synonyms", "antonyms" (separate ENRICH call).
- Padding meanings to reach 2–3 when one clean sense suffices.
- Encyclopedic definitions ("traditional", "famous", "a type of X", "one of the Y", "X used for Y-ing").
- Articles inside the headword (le / la / der / die / das / el / la / il / un / une / etc.).
- IPA in slashes or square brackets.
- POS name (noun / verb / adjective / Nomen / Verb / nom / verbe / nome / verbo / sustantivo etc.) leaking INTO meanings[].definition or meanings_translated[].definition. The POS belongs in partOfSpeech field ONLY. WRONG: "(noun) house, noun"; RIGHT: "(noun) house, home". NEVER emit definitions where a trailing token is the POS name itself.
</forbidden>

<definition_format>
- Length: ≤6 words (canonical, in WORD_LANG). Hard cap.
- Shape: single word OR comma-separated 2–3 NEAR-SYNONYMS at SAME specificity (e.g. "happy, joyful" — same sense, alternate wording). NEVER use commas to fuse distinct senses (e.g. "candle, sail" is WRONG — those are separate senses each getting their own meanings[] entry). Never specific + hypernym.
- Every word in the definition is a real existing word in WORD_LANG.
- relevanceScore: emit a TRUE frequency estimate per sense, NOT a default 80. Anchor primary everyday sense at 90–100. Subsequent senses must reflect actual relative rarity:
  • Dominant single sense (one meaning ≈ 95%+ of usage): primary=100, secondary senses below 60 → DO NOT emit.
  • Strongly skewed (one sense ≈ 80%, others present but rarer): primary=95, secondary 60–75 if attested everyday.
  • Balanced homonyms (multiple senses with roughly equal everyday frequency): each sense 75–95, spread ≤ 15.
  • Senses below 60 (archaic / literary / compound-only / rare) → DO NOT emit.
  Downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Set honestly — review weighting uses these. Don't collapse all to identical scores; emit ALL senses that pass the bar.
</definition_format>`;

const SHARED_SLANG = `<slang_rule priority="critical">
This product is a LEARNING TOOL, not a reference dictionary.
PRIMARY slang / profanity / slur / sexual-vulgarity headword → note="non_word", meanings=[].
SECONDARY slang sense of a clean word → EXCLUDE the slang sense entirely. Do NOT include with a register tag. Emit only the clean sense(s).
Normal emotional vocabulary (anger, sadness, fear, dislike) is NOT slang — INCLUDE.
Informal but non-vulgar colloquialisms are NOT slang — INCLUDE.
</slang_rule>`;

const SHARED_TRANSLATION = `<translation_rules>
- meanings_translated entries in TARGET_LANG. Concise dictionary equivalent (single word or 2–3 comma-separated near-synonyms).
- TARGET_LANG purity: every character in TARGET_LANG only. No WORD_LANG glosses, no parentheticals.
- Same count and order as meanings.
- False-friend awareness: translate the SENSE from the canonical definition, never the spelling.
- Register: daily-life concepts (kinship / body / food / weather / common actions) → colloquial spoken form in TARGET_LANG.
- Sino-Korean numerals: when TARGET_LANG is ko AND the meaning is numeric, use Sino-Korean numerals (일/이/삼/사십이/백/천) — NEVER native (마흔둘 / 스물).
- LOANWORD PRIORITY: when TARGET_LANG has a well-established native form for the headword, USE THAT FORM, NOT a descriptive paraphrase. The translated definition should be what a TARGET_LANG native learner instantly recognizes.
  • es "café" / fr "café" / it "caffè" / de "Kaffee" → ko "커피"; ja "コーヒー"; zh "咖啡"
  • es "computadora" / de "Computer" / fr "ordinateur" → ko "컴퓨터"; ja "コンピューター"
  • Descriptive paraphrase is ONLY for concepts that lack a native single-word equivalent. For common everyday loanwords / international concepts, NEVER descriptive — use the established native form.
</translation_rules>`;

// ============================================================
// Case 1: NUMBER_SYMBOL
// ============================================================

const LATIN_NUMBER_SYMBOL_STATIC = `<role>WORD_LANG vocabulary expert. Input is a number, math expression, or symbol/punctuation. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

$LANG_SPECIFIC

<pos_classification priority="critical">
- A number / math expression / formula → partOfSpeech="numeral" (canonical). NEVER "expression", NEVER "noun".
- A symbol / punctuation mark → partOfSpeech="symbol" (canonical). NEVER "expression".
- Applies to ALL meanings in the meanings array, except a secondary cultural / conventional sense for a SPECIFIC token (titled work / code / constant) which takes the appropriate content POS (noun / proper noun).
</pos_classification>

<rules>
- Number: meaning[0] = literal WORD_LANG reading (cardinal). Single literal-reading meaning. NEVER emit two parallel "different reading style" meanings for the same number.
- Year-shaped 4-digit number (1900–2099): the single literal reading uses the conventional pairwise form in WORD_LANG (es "mil novecientos ochenta y cuatro"; fr "mille neuf cent quatre-vingt-quatre"; de "neunzehnhundertvierundachtzig"; it "millenovecentottantaquattro"). Only ONE numeral meaning.
- Math expression: literal reading, NEVER compute.
- Fraction a/b: denominator-first style natural to WORD_LANG.
- Decimal a.b: digits AFTER the decimal point are read INDIVIDUALLY (each digit as its own number word). Canonical reading reflects this digit-by-digit principle. TARGET_LANG translation follows the same rule (ko "삼 점 일사", zh "三点一四", ja "さん てん いちよん", en "three point one four"). Korean specifically: SINO numerals only — 일/이/삼/사 etc., never native (하나/둘/셋/넷).
- Symbol/punctuation: meaning[0] = symbol's name in WORD_LANG. Never empty for symbols.
- Cultural / conventional sense for a SPECIFIC token: when the EXACT token doubles as a culturally established referent that a literate adult would recognize beyond the bare number (well-known novel / film / album title carrying that number as its name, emergency-services code, historically significant year-name a literate adult instantly associates with a famous work or event, math constant), emit as meaning[1] with content POS:
  - "noun" for concept-shaped senses (math constant, code)
  - "proper noun" for titled works (novel, film, album)
  - meaning[1].definition uses the BARE category in WORD_LANG ("novel" / "film" / "código" / "Roman" / etc.) — NOT the author / creator name, NOT the title attribution. Same forbidden-qualifier discipline as proper_acronym.
  - meaning[1] is fundamentally DIFFERENT in POS and category from meaning[0].
  - Cap 2 meanings total.
  - Inclusion test: would a literate adult, hearing the bare token by itself with no surrounding context, quickly think of a famous titled work / code / constant beyond the bare number? If yes → include. Bias toward inclusion when in genuine doubt.
</rules>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<headword_surface_invariant priority="critical">
For NUMERIC inputs (digits like "42" / "1984" / "3.14") and SYMBOL inputs ("@" / "#"): the headword MUST PRESERVE the input's surface form VERBATIM — DO NOT replace digits with their spelled-out word form (es "cuarenta y dos", fr "quarante-deux", de "zweiundvierzig", it "quarantadue"); DO NOT replace a symbol with its name. Example sentences and markers also use the input's surface form — the digit / symbol appears INSIDE the ** markers, NEVER its spelled-out word equivalent. The literal reading goes in meanings[].definition only. originalInput always echoes the input verbatim regardless.

- WRONG for headword "42" (it): "Ho comprato **quarantadue** mele." (marker on spelled-out word)
- RIGHT for headword "42" (it): "Ho comprato **42** mele." (marker on digit surface)
</headword_surface_invariant>

<verify_before_emit>
□ headword EQUALS originalInput verbatim — for numeric input headword is the digits ("42" / "1984" / "3.14"), NOT the spelled-out word form ("cuarenta y dos" / "quarante-deux" / "zweiundvierzig" / "quarantadue").
□ Examples / markers use the input's digit / symbol surface — never the spelled-out word inside ** markers for a numeric input.
□ Literal reading uses WORD_LANG number words, not digits.
□ Number / math token → partOfSpeech="numeral" (canonical).
□ Symbol / punctuation → partOfSpeech="symbol" (canonical).
□ Decimal: post-point digits read individually; CJK targets join as compound (ko "삼 점 일사", zh "三点一四"), Latin targets keep individual digit words.
□ Korean number translation uses SINO numerals only (일/이/삼/사십이/백 — never 하나/둘/마흔둘).
□ No parallel-reading duplicate meanings for the same numeric token.
□ Cultural / conventional sense uses content POS — never another "numeral" entry.
□ ipa OMITTED (numbers / symbols).
□ Meaning count ≤ 2.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>
<pos_allowed_target>$POS_LIST_TARGET</pos_allowed_target>`;

// ============================================================
// Case 2: SET_EXPRESSION
// ============================================================

const LATIN_SET_EXPRESSION_STATIC = `<role>WORD_LANG vocabulary expert. Input is a multi-word lemma (idiom, fixed expression, compound). Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

$LANG_SPECIFIC

<scope_decision>
1. Composed clause that is NOT a recognized fixed lexeme → note="sentence", meanings=[].
2. Misspelled multi-word lemma — be GENEROUS with typo correction for common fixed expressions. Single typo character (e.g. "merci beacoup" → "merci beaucoup"; "guten morgan" → "guten Morgen"; "comment alle vous" → "comment allez-vous"; "porfavor" → "por favor"; "graciaa" → "gracias") MUST be accepted: emit the corrected headword in the headword field, populate meanings normally, and OMIT the note field. ONLY reject as "sentence" when the input has 2+ unrelated content-word errors that make recognition genuinely ambiguous.
3. RECOGNIZED fixed lexeme → meanings populated per <pragmatic_meaning>. This INCLUDES question-form fixed greetings / inquiries like "Comment allez-vous ?" / "Comment ça va ?" / "¿Cómo estás?" / "Wie geht es Ihnen?" / "Come stai?" — these are DICTIONARY-ATTESTED fixed expressions despite their interrogative grammar. Treat them as expressions (partOfSpeech="expression"), populate meanings with the pragmatic greeting function, NOT as sentences. NEVER reject a recognized question-form greeting as "note=sentence" just because of its question mark / interrogative form.

note vs meanings consistency: when note="sentence" is set, meanings MUST be []. When meanings is non-empty, note MUST be omitted. NEVER emit both — that is a contradiction.
</scope_decision>

<pragmatic_meaning priority="critical">
- The meaning is the COMPOSITIONAL OR FIGURATIVE sense the phrase carries as a whole — never the literal sum of parts.
- partOfSpeech reflects the phrase's syntactic role: idiomatic verbal phrase → "verb"; nominal idiom → "noun"; sentential idiom / proverb / interjection → "expression".
- DEFAULT cap: 1 meaning. Use 2 ONLY when the phrase has GENUINELY distinct standalone senses. 3 meanings extremely rare for this case.
</pragmatic_meaning>

<no_padding priority="critical">
A multi-word lemma usually has ONE canonical sense. Resist generating "another sense" just because the slot exists. If the secondary sense is rare / archaic / collocation-bound → DROP.
</no_padding>

<register_matching priority="critical">
Multi-word lemmas often carry a register marker the bare word does not. The TARGET_LANG translation MUST preserve that register.

PREFERRED form for register-distinctive source idioms — the **plain TARGET_LANG word + parenthetical register tag** at the end:
- "<plain TARGET_LANG word>(<register tag>)" — single most-common plain equivalent followed by a brief register label in parentheses.
- Korean register tags: "(속어)" informal / slang-adjacent, "(완곡)" euphemistic, "(비속어)" vulgar-adjacent, "(격식)" formal / ceremonial, "(고어)" archaic. Pick the single most accurate one.
- Other-language tags: analogous concise label in TARGET_LANG (informal / formal / euphemistic / etc.).

ONLY use a register-matching TARGET_LANG idiom INSTEAD of plain+tag when ALL hold:
- The TARGET_LANG idiom is widely recognized at learner level.
- It carries the SAME register and roughly the same figurative imagery.
- The plain word + tag would feel awkward in TARGET_LANG.

NEUTRAL phrases (most compound nouns and neutral fixed phrases): plain TARGET_LANG equivalent with NO tag — adding a register marker to a neutral phrase is misleading.
</register_matching>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Headword preserves the phrase verbatim.
□ Meaning expresses the WHOLE-PHRASE sense.
□ partOfSpeech matches the phrase's syntactic role.
□ ipa OMITTED (multi-word has internal spaces).
□ Meaning count = 1 by default; 2 only for genuinely polysemous phrases.
□ Register check: if source idiom is informal / euphemistic / formal-distinctive, does the TARGET_LANG translation carry the same register?
□ Gender: emit gender on noun meanings only.
□ No slang / vulgar sense leaked through.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>
<pos_allowed_target>$POS_LIST_TARGET</pos_allowed_target>`;

// ============================================================
// Case 3: PROPER_ACRONYM
// ============================================================

const LATIN_PROPER_ACRONYM_STATIC = `<role>WORD_LANG vocabulary expert. Input is an acronym or proper noun. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

$LANG_SPECIFIC

<shape_detection>
- All-uppercase 2–9 chars (optionally with digits / hyphen): treat as ACRONYM.
- Title-Case single token: treat as PROPER NOUN.
</shape_detection>

<acronym_rules priority="critical">
- Canonical meaning[0].definition = "<expanded WORD_LANG name>, <bare category>". Format = "[expansion], [category]" (2–6 words total). Category is the bare noun for the kind of entity (organización / agence / Behörde / agenzia / agency / disease / standard / company / region — NO qualifiers).
- partOfSpeech = "proper noun".
- NEVER add a second sense unless the same acronym has a fully distinct, equally common expansion in modern usage.
</acronym_rules>

<proper_noun_rules priority="critical">
- Canonical meaning[0].definition = "<bare category in WORD_LANG>" (just the kind of entity, e.g. "ciudad" / "ville" / "Stadt" / "città" / "company" / "país").
- partOfSpeech = "proper noun".
- FORBIDDEN qualifiers (cause downstream drift):
  • Country / region / era → drop, keep bare category.
  • Evaluative ("famous", "renombrado", "berühmt", "celebre") → drop.
  • Functional ("known for X", "headquartered in Z") → drop.
- For people: bare category = "persona" / "personne" / "Person" / "persona" (es/fr/de/it).
- For places: bare category = "ciudad" / "ville" / "Stadt" / "città" — never political-status modifier.
- Cap STRICTLY = 1 meaning.
- NEVER emit gender on a proper noun. Gender field applies only to common nouns.
</proper_noun_rules>

<translated_proper_format priority="critical">
For meanings_translated on proper noun / acronym headwords, the translation MUST surface the TARGET_LANG-native form of the name FIRST, then the bare category, comma-separated:

- Proper noun: meanings_translated[0].definition = "<TARGET_LANG transliteration / native form>, <bare category in TARGET_LANG>".
- Acronym: meanings_translated[0].definition = "<TARGET_LANG transliteration of expansion>, <bare category in TARGET_LANG>". When the acronym has an established TARGET_LANG-native form (Korean "미국 항공우주국" for NASA, "마드리드" for Madrid, "파리" for Paris, "베를린" for Berlin, "로마" for Rome), use that established form.
- Bare category in TARGET_LANG: 도시 (city) / 회사 (company) / 국가 (country) / 강 (river) / 인물 (person) / 기관 (agency) — concise nouns only.
- Same forbidden-qualifier rules on the translated side.
- NEVER emit just the bare category alone in meanings_translated when the headword is a proper noun / acronym.
</translated_proper_format>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Exactly 1 meaning.
□ Canonical definition: "<expansion>, <category>" (acronym) OR "<category>" (proper noun) — no qualifiers.
□ Translated definition: "<TARGET_LANG-native name>, <category in TARGET_LANG>" — name FIRST, never omitted.
□ partOfSpeech = "proper noun" both sides.
□ No gender field on any meaning.
□ ipa OMITTED for letter-by-letter acronyms; INCLUDED for pronounceable acronyms read as words and for proper nouns with established WORD_LANG pronunciation.
□ No nationality / era / evaluative modifier.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>
<pos_allowed_target>$POS_LIST_TARGET</pos_allowed_target>`;

// ============================================================
// Case 4: SIMPLE_WORD
// ============================================================

const LATIN_SIMPLE_WORD_STATIC = `<role>WORD_LANG vocabulary expert. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

$LANG_SPECIFIC

<recognition>
Exactly ONE of three shapes:
- RECOGNIZED: headword = originalInput (normalized form — lemmatized, capitalized / diacritics restored), meanings non-empty, note omitted.
- CORRECTED: 1–2 char typo fix to a real WORD_LANG word, confidence 60–85.
- UNRECOGNIZED: meanings=[], note set. Never combine changed-headword + note.
</recognition>

<lemmatization>
- Inflected verb form (conjugated, participle) → headword = infinitive lemma.
- Noun plural → singular.
- Inflected adjective (gender / number agreement) → masculine singular base.
- For German, restore capitalization on noun lemmas.
- For Romance languages, restore diacritics.
- Examples downstream will inflect back to natural forms via marker rules.
</lemmatization>

<standalone_test priority="critical">
Each candidate sense MUST be demonstrable in a single learner sentence using the BARE LEMMA as the headword — not requiring a partner morpheme, not collocation-bound.

FAIL if: sense exists only inside a fixed phrase (the sense belongs to the phrase, not the bare word); sense requires a specific particle / preposition to surface; sense is archaic or literary only.

Cross-language drift: homograph of a foreign word's spelling is NOT a sense of the WORD_LANG word (fr "chair" ≠ en "chair"; de "Gift" ≠ en "gift").
</standalone_test>

<no_padding priority="critical">
**ONE meaning is the DEFAULT.** Most WORD_LANG words have ONE dominant standalone sense at learner level. Use 1.

Before adding a 2nd or 3rd meaning, ALL must be true:
1. Dictionary-attested in modern WORD_LANG for the EXACT bare lemma.
2. Native speakers commonly encounter the sense in standalone usage.
3. The TARGET_LANG translation is materially DIFFERENT from the primary (not a synonym, not a register variant, not a finer specificity of the same concept).
4. A natural learner-grade example can be constructed for this sense distinctly from the primary.

If ANY check fails → DROP the secondary.

TRUE homonyms (2–3 meanings legitimate): emerge when two distinct concepts share the same lemma. These are the exception, not the template.

Padding is the BIGGER risk than under-inclusion here. "I'm not sure / less common" → ERR ON SIDE OF DROP.
</no_padding>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ meanings_translated emitted BEFORE meanings.
□ Same count and order across both arrays.
□ Each surviving sense passes <standalone_test>.
□ Each surviving sense passes <no_padding> 4-check.
□ Sense count reflects HONEST polysemy.
□ Definition length ≤ 6 words.
□ No forbidden patterns ("a type of X", "one of the Y", encyclopedic qualifiers).
□ ipa present (lemma has no spaces, POS ≠ expression).
□ Gender present on every noun meaning (m / f / n / mf).
□ Articles stripped from headword.
□ Diacritics / capitalization restored per language rules.
□ No slang / vulgar secondary sense leaked.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>
<pos_allowed_target>$POS_LIST_TARGET</pos_allowed_target>`;

// ============================================================
// Public: build specialized system prompt for QUICK mode
// ============================================================

export function buildLatinSpecializedSystemPrompt(
  latinCase: LatinCase,
  sourceLang: LatinSourceLang,
  targetLang: string,
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const posList = POS_BY_LANG[sourceLang] ?? POS_BY_LANG["en"];
  // target POS list — normalize zh-CN to its own entry; falls back to en
  // when target is unrecognized.
  const posListTarget = POS_BY_LANG[targetLang]
    ?? POS_BY_LANG[targetLang === "zh-TW" ? "zh-CN" : targetLang]
    ?? POS_BY_LANG["en"];
  const langRules = buildLangSpecificRules(sourceLang);

  const TPL: Record<LatinCase, string> = {
    number_symbol: LATIN_NUMBER_SYMBOL_STATIC,
    set_expression: LATIN_SET_EXPRESSION_STATIC,
    proper_acronym: LATIN_PROPER_ACRONYM_STATIC,
    simple_word: LATIN_SIMPLE_WORD_STATIC,
  };
  return TPL[latinCase]
    .replace(/WORD_LANG/g, sourceName)
    .replace(/TARGET_LANG/g, targetName)
    .replace("$POS_LIST_TARGET", posListTarget)
    .replace("$POS_LIST", posList)
    .replace("$LANG_SPECIFIC", langRules);
}

export function buildLatinSpecializedUserPrompt(
  req: WordLookupRequest,
  latinCase: LatinCase,
  lexiconHint?: string,
): string {
  const sourceName = LANG_NAMES[req.sourceLang] ?? req.sourceLang;
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;
  const lines: string[] = [
    `WORD_LANG: ${sourceName}`,
    `TARGET_LANG: ${targetName}`,
    `Input: "${req.word}"`,
    `Case: ${latinCase}`,
  ];
  if (lexiconHint) lines.push("", lexiconHint);
  lines.push("",
    "originalInput = input verbatim.",
    `Emit meanings_translated (${targetName}) BEFORE meanings (${sourceName}). Same count, same order.`,
    "No examples / synonyms / antonyms (separate ENRICH call).",
  );
  return lines.join("\n");
}

// ============================================================
// ENRICH-side: case-specialized example prompts
// ============================================================
// Mirrors prompts-v3-en.ts. The shared diversity / marker / shape /
// coverage / verify blocks live here as Latin-tuned versions —
// duplicated rather than imported from prompts-v3-en.ts to keep the
// two trees independently evolvable.

const LATIN_DIVERSITY_RULES = `<diversity priority="critical">
The 2–3 examples for one headword MUST NOT look like the same template repeated. Across the slots, rotate AT LEAST TWO of:

axis_subject:
  Don't open every slot with "I" / "Yo" / "Ich" / "Je" / "Io" / "She" / "He" or its WORD_LANG equivalent. Mix in:
  • proper names (Anna, Marco, Sara, Daniel, Lin, Hassan, Priya — fit them to a name common in WORD_LANG culture)
  • plural / group subjects (the children / the team / my parents / our class — WORD_LANG-native forms)
  • inanimate subjects when the sense allows
  • impersonal / existential constructions (es "hay X", fr "il y a X", de "es gibt X", it "c'è X")

axis_scene:
  Pick from work / school / home / travel / food / weather / friendship / hobbies / errands. Never three slots in the same scene.

axis_shape:
  Mix short SVO + slightly longer with time/place + brief subordinate clause OR a question OR an imperative. Three identical shapes = REWRITE one.

axis_tense_mood:
  Rotate when natural. Present + past + future OR declarative + question + imperative.

VOCAB ≠ STYLE. Supporting vocabulary stays simple (everyday ~1,500-word range, or proficiency-tier list when given). What VARIES is the surface shape.
</diversity>`;

const LATIN_MARKER_RULES = `<marker priority="critical">
Wrap the headword (in its inflected form for this sentence) in EXACTLY ONE pair of **...**.

- Marker MUST sit on the headword surface — NEVER on an adjacent verb / preposition / particle / article.
- Marker spans the HEADWORD LEXEME ONLY. NEVER include a preceding verb, adverb, or determiner. NEVER include a following article or preposition unless it is a structural part of the headword lexeme itself.
  • WRONG for headword "libro" (noun, "book"): "María **leyó** un libro interesante." (marker swallowed the verb "leyó" — the headword "libro" is unmarked)
  • RIGHT for headword "libro": "María leyó un **libro** interesante."
  • WRONG for headword "livre" (noun, "book"): "Marie **lit** un livre passionnant." (marker on "lit", verb)
  • RIGHT for headword "livre": "Marie lit un **livre** passionnant."
  • WRONG for headword "SNCF" (proper noun acronym): "Nous **étudions** le fonctionnement de la SNCF." (marker on the wrong word)
  • RIGHT for headword "SNCF": "Nous étudions le fonctionnement de la **SNCF**."
- Include FULL inflection inside markers (conjugated verb forms with all agreement endings; gender / number agreement on adjectives).
- For German separable verbs in separated form: when the prefix is separated from the verb stem, you may keep markers around the inflected stem if the prefix is clearly outside but in the same clause; preferred form keeps the lemma in adjacent infinitive contexts. Avoid two-marker sentences entirely — when the prefix and stem are separated, mark only the more salient component or pick a sentence where they're adjacent.
- French elision: contracted forms inside markers ("J'écris" → "**J'écris**" is awkward; prefer the unmarked subject + **verb** pattern: "J'**écris**").
- For multi-word lemmas (Spanish "por favor", French "s'il vous plaît", Italian "per favore", German "zum Beispiel"): wrap the ENTIRE phrase as a single unit. The marker covers ALL constituent words of the headword phrase — never just one of them.
- LEMMA IDENTITY: bolded substring is the SAME lexeme as the lemma headword. Never a same-spelled different word (e.g. Spanish "como" verb vs "como" preposition — pick the one matching the meaning_index).

Pre-emit check: count the words inside ** markers. They MUST equal the word count of the headword lexeme exactly:
- Single-word headword (libro / livre / Haus / casa) = 1 word inside ** (its inflected form).
- Multi-word headword (por favor / s'il vous plaît / zum Beispiel) = same word count as the headword.
If the marker contains MORE words than the headword, the marker has swallowed surrounding context — REWRITE.
</marker>`;

const LATIN_SHAPE_BASE = `<shape>
- Length: 5–16 words. Hard ceiling 22 for multi-word lemmas / idioms.
- Structure: one main clause baseline; ONE subordinate / relative / temporal clause allowed when natural. Mild scene-setting allowed.
- Polarity: prefer affirmative; negation / question / imperative welcome in 1 of 3 slots when natural.
- Tense / aspect: present default; past / future fine when scene calls for it.
- Tone: casual conversational tone for EVERYDAY vocabulary (daily verbs, common nouns, ordinary adjectives) — friends-talking register, not textbook. PRESERVE formal register for formally-marked headwords (formal/legal/scientific/written-only expressions, technical terms). Inherently negative senses (die / war / illness) → dignified, matter-of-fact scene regardless.
- Terminal punctuation MANDATORY (. ! ? ¿ ¡ for Spanish-specific opening punctuation when needed).
</shape>`;

const LATIN_COVERAGE_BASE = `<coverage>
Default: produce the scheduled number of examples (1 per meaning — example count equals the meaning count). Empty slot reserved for:
(a) sensitive content with no metalinguistic fit
(b) slurs / profanity
(c) slang sense that should have been canonically excluded
For idioms / fixed phrases: use the higher 22-word ceiling.
</coverage>`;

const LATIN_VERIFY_BASE = `<verify_before_emit>
□ Tally per meaning_index matches schedule exactly.
□ Each sentence's demonstrated sense matches its meaning_index.
□ Marker on the headword surface (full inflection inside).
□ Length within shape limits.
□ At least TWO of {subject, scene, shape, tense/mood} vary across slots — NOT three near-identical clones.
□ Terminal punctuation present (including Spanish opening ¿ ¡ where needed).
□ French elision applied to articles / clitic pronouns in examples and translations.
□ German nouns capitalized in examples and translations.
□ Gender / number agreement correct on adjectives, articles, past participles in compound tenses.
□ No translation field in any example.
</verify_before_emit>`;

const LATIN_SIMPLE_EXAMPLES_STATIC = `<role>Example-sentence generator for WORD_LANG vocabulary headwords. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Example count equals meaning count, strict 1:1. For N meanings, emit exactly N examples with meaning_index 0…N-1. NEVER emit more examples than meanings.
If a meaning genuinely cannot support a useful example, DROP that slot.
</quantity>

<coherence priority="critical">
For each sentence, the demonstrated sense MUST match the meaning at its meaning_index.

Sense-anchor rule (applies to ALL polysemy, especially when meanings share the same partOfSpeech):
1. Before drafting the sentence, identify a sense-anchor — a content word (object, action, attribute, collocation, or setting) that is associated ONLY with the assigned meaning and NOT with the other meanings of the same headword. The anchor is what tells a learner "this is sense X, not sense Y".
2. The sentence MUST contain that anchor in a frame where it disambiguates the headword.
3. If no clean anchor exists, REWRITE around a different anchor or DROP the slot. Never emit a sentence that could equally describe a different sense.

Pre-emit check: "Reading ONLY this sentence with no context, which meaning does a learner infer?" Answer MUST equal the assigned meaning_index — not the most familiar sense, the assigned one. If it drifts, REASSIGN or REWRITE.
</coherence>

${LATIN_SHAPE_BASE}

${LATIN_DIVERSITY_RULES}

${LATIN_MARKER_RULES}

<sensitive_content>
"SENSITIVE LOOKUP" hint or known sensitive entity → metalinguistic templates only. Slurs / strongest profanity / suicide / self-harm / illegal drugs → sentence="" or drop slot.
</sensitive_content>

<content_neutrality>
Generic mundane scenes only. NEVER reference territorial / naming disputes, identifiable real political figures, specific wars / atrocities, religious doctrine, ethnic / national stereotypes, real political parties, real-name brands / celebrities / athletes unless headword IS one.
</content_neutrality>

${LATIN_COVERAGE_BASE}

${LATIN_VERIFY_BASE}`;

const LATIN_SET_EXPR_EXAMPLES_STATIC = `<role>Example-sentence generator for a WORD_LANG multi-word lemma (idiom / fixed expression / compound). Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Typically 1 example (cap=1 meaning for this case). 2 examples only when the canonical produced 2 meanings.
</quantity>

<shape>
- Length: 6–22 words. Higher ceiling because multi-word lemmas need room.
- One main clause + optional subordinate / temporal. Conversational register welcomed.
- Dialog-style allowed.
- Terminal punctuation MANDATORY.
</shape>

<diversity priority="critical">
When 2 examples are produced, they MUST differ along AT LEAST TWO of: subject / scene / sentence shape / tense or mood.
</diversity>

${LATIN_MARKER_RULES}

<register_tone priority="critical">
The example's surrounding context MUST match the idiom's register.

- INFORMAL / SLANG-ADJACENT / EUPHEMISTIC idiom: example uses casual / conversational / familiar context — dialog, family scene, friend exchange. AVOID dignified / ceremonial / solemn framings (register clash).
- FORMAL / CEREMONIAL idiom: example uses formal scene (workplace announcement, ceremonial setting).
- NEUTRAL idiom: any everyday scene fits.

Pre-emit check: "Does the surrounding context match the register the idiom signals?" If mismatched → REWRITE.
</register_tone>

<sensitive_content>
Metalinguistic templates for sensitive lookups, empty slot for slurs / profanity.
</sensitive_content>

${LATIN_COVERAGE_BASE}

${LATIN_VERIFY_BASE}`;

const LATIN_PROPER_EXAMPLES_STATIC = `<role>Example-sentence generator for a WORD_LANG proper noun or acronym. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
1 example.
</quantity>

<shape>
- Length: 5–16 words.
- Tier-based example style:

  TIER A — General proper nouns (cities / countries / companies / standard agencies / brands / works / common given names not politically disputed). Use NATURAL conversational examples with VARIED shapes (travel / activity / use / news / event / personal connection). AVOID monotonous metalinguistic templates ("I read about X" / "We learned about X") for general entities — they read as artificial.
    Acceptable example shapes for TIER A (rotate across consecutive proper-noun lookups):
      • Travel / location: "Nuestra familia voló a **Madrid** el verano pasado."
      • Activity at the place: "María estudió arte en **París** durante tres años."
      • Use of the product / service: "Mi padre conduce un **Renault** desde hace años."
      • Reference in context: "**Sony** lanzó una nueva cámara la semana pasada."
      • Personal: "Mi tío trabaja en **IBM** desde el 2010."

  TIER B — Disputed / politically-sensitive / atrocity-related / contested-sovereignty entities. ONLY metalinguistic templates (reading about / learning about / mentioning / discussing).

- AVOID for ALL tiers: evaluative claims, unverifiable superlatives, political framing, religious framing.
- Terminal punctuation MANDATORY.
</shape>

${LATIN_MARKER_RULES}

<diversity priority="critical">
For TIER A proper nouns, DO NOT default to "I read about X" / "We learned about X" / "She mentioned X" templates — those produce monotonous output across multiple proper-noun lookups. Pick a DIFFERENT shape per lookup (travel / activity / use / news / event / personal). Multiple consecutive proper-noun examples must vary their sentence shapes.
</diversity>

<sensitive_proper_nouns>
TIER B handling — disputed political entities / territorial names / historical atrocity terms / contested sovereignty → ONLY metalinguistic templates. No predicates describing properties. If no neutral template fits → sentence="".
</sensitive_proper_nouns>

<verify_before_emit>
□ Sentence makes no evaluative claims about the entity.
□ Marker wraps the proper noun / acronym verbatim.
□ For TIER A: example uses a natural conversational shape, NOT the "I read/learned/heard about X" template.
□ Length within 5–16 words.
□ Terminal punctuation present.
</verify_before_emit>`;

const LATIN_NUMBER_EXAMPLES_STATIC = `<role>Example-sentence generator for a WORD_LANG number / math expression / symbol headword. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 schedule:
- 1 meaning → 1 example (meaning_index 0).
- 2 meanings → 2 examples (one per meaning_index).
When meaning[1] is a cultural / conventional sense (titled work, code, constant), emit a second example demonstrating THAT sense.
</quantity>

<coherence priority="critical">
- meaning_index 0 (literal numeral / symbol): factual scene where the token surfaces as a number / count / page / math expression / symbol in text (email / url / equation).
- meaning_index 1 (cultural / conventional sense): scene where the token clearly refers to THAT specific cultural entity. When meaning[1] is a novel / film / album title, contextualize as a titled work (reading / watching / studying). Never another generic counting sentence for meaning_index 1.
</coherence>

<shape>
- Length: 4–14 words.
- Use the headword surface form (digits or symbol) verbatim inside ** markers.
- AVOID forcing the spelled-out form into the marker — the marker carries the surface input.
- Terminal punctuation MANDATORY.
</shape>

${LATIN_MARKER_RULES}

<verify_before_emit>
□ Tally per meaning_index matches the meanings array.
□ Marker contains the input's surface form on every example.
□ For meaning_index 1 (cultural sense): the sentence demonstrates THAT secondary sense.
□ Sentence is short and factual.
□ Terminal punctuation present.
</verify_before_emit>`;

export function buildLatinExamplesSystemPrompt(
  latinCase: LatinCase,
  sourceLang: LatinSourceLang,
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const TPL: Record<LatinCase, string> = {
    number_symbol: LATIN_NUMBER_EXAMPLES_STATIC,
    set_expression: LATIN_SET_EXPR_EXAMPLES_STATIC,
    proper_acronym: LATIN_PROPER_EXAMPLES_STATIC,
    simple_word: LATIN_SIMPLE_EXAMPLES_STATIC,
  };
  return TPL[latinCase].replace(/WORD_LANG/g, sourceName);
}

// ============================================================
// ENRICH-side: case-specialized syn/ant prompts
// ============================================================

const LATIN_SYNANT_EMPTY_STATIC = `<role>You are receiving a headword that has NO synonyms or antonyms by definition. Return json with both arrays empty.</role>

<schema>{ "synonyms": [], "antonyms": [] }</schema>

<rules priority="critical">
This headword is a number, symbol, proper noun, or acronym. Such headwords do NOT have synonyms or antonyms in any vocabulary-learning sense. Return both arrays empty without exception.
</rules>`;

const LATIN_SYNANT_DEFAULT_STATIC = `<role>List synonyms and antonyms for a WORD_LANG vocabulary headword. Return json. Default expectation: MOST words have FEW true synonyms and FEWER true antonyms. Empty arrays are the normal, correct outcome for a large fraction of vocabulary.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<principle priority="critical">
Bias HARD toward empty arrays. Only list words a literate native would accept as substitutable with the headword in a real sentence without distorting the meaning.

Mental substitution test for EACH candidate: "Can I swap this word for the headword in at least one natural WORD_LANG sentence so a native reads it the same way?" Any hesitation → REJECT.
</principle>

<rules>
- Each entry: ONE bare word or fixed compound. NO parentheticals, NO glosses, NO disclaimers, NO register tags. Parenthetical content = fabrication signal → reject.
- Each entry: real attested WORD_LANG word, genuinely interchangeable with the headword at comparable register and specificity.
- NEVER the headword itself. NEVER inflected forms.
- NEVER derivatives across POS.
- NEVER register variants of the same lexeme.
- NEVER hypernyms, hyponyms, or topical associates.
- NEVER cross arrays.
- Gender: for nouns, synonyms should match the headword's gender when possible (don't list a feminine noun as synonym of a masculine noun unless they're genuinely the same lexeme at different grammatical genders).
- Synonyms ≤ 3 (typically 0–2). Antonyms ≤ 2 (typically 0–1).
</rules>

<empty_cases priority="critical">
These categories MUST return synonyms=[] AND antonyms=[]:
- Numbers, symbols, math expressions.
- Proper nouns (people, places, brands).
- Acronyms.
- Pure function words: articles, determiners, most pronouns, basic prepositions (unless part of a directional pair).
- Fixed expressions / greetings — emit only when a SAME-register equivalent fixed expression exists.
- Punctuation tokens.
- Words whose only attested sense is highly technical / scientific with no everyday equivalent.
</empty_cases>

<antonym_rules priority="critical">
True antonyms are RARE. They exist mainly for:
- Gradable adjectives.
- Directional / spatial pairs.
- A small set of action verbs (open / close, give / take, buy / sell).
- A small set of state nouns (war / peace, life / death).

Most nouns have NO antonym. Most verbs have NO antonym. When in genuine doubt → [].
</antonym_rules>

<peer_group_antonym>
Members of finite semantic groups are PEERS, NOT antonyms.
- Seasons: ONE paired opposite each (spring ↔ autumn, summer ↔ winter).
- Cardinal directions: ONE opposite each.
- Weekdays / months / suits / primary colors / numerals: NO antonym → [].
</peer_group_antonym>

<verify_before_emit>
□ For EACH entry: substitution preserves meaning AND feels natural? If no → REMOVE.
□ For EACH entry: is it a hypernym / hyponym / topical associate / register-variant / derivative / inflected form? If yes → REMOVE.
□ Does the headword fall under <empty_cases>? If yes → both arrays MUST be [].
□ Antonyms: does the headword belong to a category where true antonyms exist? If no → antonyms = [].
□ Final pass: would I rather have a clean [] than a list with one shaky entry? YES → drop the shaky entries.
</verify_before_emit>`;

export function buildLatinSynAntSystemPrompt(latinCase: LatinCase): string {
  if (latinCase === "number_symbol" || latinCase === "proper_acronym") {
    return LATIN_SYNANT_EMPTY_STATIC;
  }
  return LATIN_SYNANT_DEFAULT_STATIC;
}

// ============================================================
// Per-case downstream-cap helpers
// ============================================================

export function getLatinMeaningCap(_latinCase: LatinCase): number {
  // Hard count caps replaced by MIN_RELEVANCE threshold (normalize.ts).
  // MAX_MEANINGS=5 acts as runaway safety net.
  return 5;
}

export function getLatinSynAntCaps(latinCase: LatinCase): { syn: number; ant: number } {
  switch (latinCase) {
    case "number_symbol": return { syn: 0, ant: 0 };
    case "proper_acronym": return { syn: 0, ant: 0 };
    case "set_expression": return { syn: 2, ant: 1 };
    case "simple_word": return { syn: 3, ant: 2 };
  }
}

export function shouldSkipLatinSynAnt(latinCase: LatinCase): boolean {
  const { syn, ant } = getLatinSynAntCaps(latinCase);
  return syn === 0 && ant === 0;
}
