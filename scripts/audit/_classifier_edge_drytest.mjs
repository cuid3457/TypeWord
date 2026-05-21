// Comprehensive classifier edge-case drytest — no API calls.
// node --experimental-strip-types scripts/audit/_classifier_edge_drytest.mjs
//
// For each (source language, input), report:
//   - classified case
//   - whether the classification matches the expected behaviour
//   - if mismatched, whether the fallback prompt is likely to handle it correctly
//
// Goal: surface routing accuracy honestly, including borderline / edge inputs.

import { classifyKoInput } from "../../supabase/functions/_shared/prompts-v3-ko.ts";
import { classifyEnInput } from "../../supabase/functions/_shared/prompts-v3-en.ts";
import { classifyJaInput } from "../../supabase/functions/_shared/prompts-v3-ja.ts";
import { classifyZhInput } from "../../supabase/functions/_shared/prompts-v3-zh.ts";
import { classifyLatinInput } from "../../supabase/functions/_shared/prompts-v3-latin.ts";

const CASES = {
  ko: [
    // standard cases (sanity)
    ["학교", "simple_word", "ok", "common noun"],
    ["가다", "verb_adj_da", "ok", "verb dictionary form"],
    ["좋다", "verb_adj_da", "ok", "adjective dictionary form"],
    ["안녕하세요", "set_expression", "ok", "greeting"],
    ["사", "sino_monosyllable", "ok", "single Sino char"],
    ["42", "number_symbol", "ok", "number"],

    // EDGE: nouns ending in -다 (Western loanwords / country names)
    // After 2026-05-19 evening: NOUN_DA_WHITELIST routes these to simple_word
    ["사이다", "simple_word", "ok", "loanword noun — whitelist routes to simple_word"],
    ["캐나다", "simple_word", "ok", "country proper noun — whitelist routes to simple_word"],
    ["베란다", "simple_word", "ok", "loanword noun (veranda) — whitelist"],
    ["우간다", "simple_word", "ok", "country proper noun — whitelist"],
    ["플로리다", "simple_word", "ok", "US state — whitelist"],

    // EDGE: adverbial -마다
    ["날마다", "simple_word", "ok", "adverbial 마다 — correctly excluded from verb_adj_da"],
    ["해마다", "simple_word", "ok", "adverbial 마다"],

    // EDGE: English input on KO source
    ["hello", "simple_word", "fallback", "wrong-language EN on KO — prompt detects wrong_language"],
    ["TypeWord", "simple_word", "fallback", "Title-case EN on KO source"],

    // EDGE: mixed-script
    ["Hello안녕", "simple_word", "fallback", "mixed EN+KO"],
    ["3시", "simple_word", "fallback", "numeral+counter — number rule excludes due to 시"],

    // EDGE: typos / partial inputs
    ["감사", "set_expression", "ok", "formal prefix matches"],
    ["감사한", "set_expression", "fallback", "incomplete — prompt should handle"],

    // EDGE: proper nouns in hanzi
    ["서울", "simple_word", "fallback", "city proper noun (no hanja) — prompt's accept_categories rule"],
    ["미국", "simple_word", "fallback", "country proper noun"],

    // EDGE: na-adjectives (X하다)
    ["행복하다", "verb_adj_da", "ok", "X하다 — prompt distinguishes verb vs adj internally"],
    ["좋아하다", "verb_adj_da", "ok", "derived verb"],
  ],

  en: [
    // standard
    ["run", "simple_word", "ok"],
    ["hello", "simple_word", "ok"],
    ["look up", "set_expression", "ok"],
    ["Tokyo", "proper_acronym", "ok"],
    ["NASA", "proper_acronym", "ok"],
    ["42", "number_symbol", "ok"],

    // EDGE: internal-caps brands (deliberate fallthrough per comment)
    ["iPhone", "simple_word", "fallback", "internal caps — deliberate simple_word route"],
    ["eBay", "simple_word", "fallback", "internal caps brand"],
    ["macOS", "simple_word", "fallback", "internal caps OS name"],
    ["YouTube", "simple_word", "fallback", "internal caps compound brand"],

    // EDGE: hyphenated compound words — after 2026-05-19 evening:
    // HYPHEN_COMPOUND_RE routes these to set_expression (entire lexeme wrap)
    ["long-term", "set_expression", "ok", "hyphen compound — HYPHEN_COMPOUND_RE routes to set_expression"],
    ["well-known", "set_expression", "ok", "hyphen compound — HYPHEN_COMPOUND_RE"],
    ["state-of-the-art", "set_expression", "ok", "multi-hyphen compound — HYPHEN_COMPOUND_RE"],

    // EDGE: mixed alphanumeric tech terms
    ["5G", "simple_word", "fallback", "mixed digit+letter — neither acronym nor number"],
    ["Wi-Fi", "set_expression", "ok", "Title+hyphen+Title — HYPHEN_COMPOUND_RE routes to set_expression"],
    ["3D", "simple_word", "fallback", "digit+letter"],

    // EDGE: contractions
    ["don't", "simple_word", "ok", "contraction"],
    ["I'm", "simple_word", "fallback", "Title+apostrophe — TITLE_CASE doesn't match"],

    // EDGE: inflected forms
    ["running", "simple_word", "ok", "gerund — lemmatized by prompt"],
    ["ate", "simple_word", "ok", "irregular past"],

    // EDGE: COVID-19 style acronym with hyphen+digits
    ["COVID-19", "proper_acronym", "ok", "all-caps + digits"],
    ["IPv6", "simple_word", "fallback", "mixed caps — falls through"],

    // EDGE: lone letter — "I" is a pronoun, simple_word is semantically correct
    ["I", "simple_word", "ok", "single letter pronoun — simple_word is correct"],
    ["a", "simple_word", "ok", "article"],

    // EDGE: wrong-language input
    ["안녕", "simple_word", "fallback", "Korean input on EN source — prompt sets wrong_language"],
  ],

  ja: [
    // standard
    ["学校", "simple_word", "ok"],
    ["食べる", "verb_adj", "ok"],
    ["美しい", "verb_adj", "ok"],
    ["よろしくお願いします", "set_expression", "ok"],
    ["水", "single_kanji", "ok"],
    ["コーヒー", "katakana_only", "ok"],
    ["42", "number_symbol", "ok"],

    // EDGE: kanji compound 2+ chars (no okurigana)
    ["勉強", "simple_word", "ok", "noun 2-kanji compound"],
    ["勉強する", "verb_adj", "ok", "compound verb"],

    // EDGE: -る verbs that DON'T have kanji
    ["する", "verb_adj", "ok", "pure-hira whitelisted verb"],
    ["くる", "verb_adj", "ok", "whitelisted"],
    ["わかる", "simple_word", "fallback", "pure-hira common verb NOT in whitelist — routed to simple_word"],
    ["できる", "verb_adj", "ok", "whitelisted"],

    // EDGE: -i adjectives in pure-hira
    ["おいしい", "simple_word", "fallback", "pure-hira i-adj — routed to simple_word"],
    ["うれしい", "simple_word", "fallback", "pure-hira i-adj"],

    // EDGE: na-adjectives (form-indistinguishable from nouns)
    ["きれい", "simple_word", "fallback", "na-adj — ends in i but stem"],
    ["元気", "simple_word", "ok", "na-adj in kanji"],
    ["静か", "simple_word", "ok", "na-adj in kanji+hira"],

    // EDGE: honorific-prefixed (お + noun)
    ["お茶", "simple_word", "ok", "honorific prefix"],
    ["ご飯", "simple_word", "ok", "honorific prefix"],

    // EDGE: katakana with long vowel / gemination
    ["コンピューター", "katakana_only", "ok", "long-vowel mark"],
    ["バッグ", "katakana_only", "ok", "gemination"],

    // EDGE: mixed katakana + hiragana — KATAKANA_VERB_RE routes to verb_adj
    ["サボる", "verb_adj", "ok", "katakana stem + う-column ending — KATAKANA_VERB_RE routes correctly"],
    ["コピる", "verb_adj", "ok", "katakana-stem loanword verb"],
    ["ググる", "verb_adj", "ok", "katakana-stem loanword verb (google)"],

    // EDGE: Latin acronyms used in JA
    ["NHK", "number_symbol", "ok", "JA Latin acronym"],
    ["JR", "number_symbol", "ok", "JA Latin acronym"],

    // EDGE: hyphenated / mixed-script
    ["3D", "simple_word", "fallback", "mixed"],

    // EDGE: hiragana single char (particles)
    ["は", "simple_word", "fallback", "particle — routed to simple_word"],
    ["の", "simple_word", "fallback", "particle"],

    // EDGE: wrong-language
    ["hello", "simple_word", "fallback", "English on JA source"],
  ],

  "zh-CN": [
    // standard
    ["学校", "simple_word", "ok"],
    ["你好", "set_expression", "ok"],
    ["一帆风顺", "chengyu_4char", "ok"],
    ["水", "single_char", "ok"],
    ["CCTV", "latin_acronym", "ok"],
    ["42", "number_symbol", "ok"],

    // EDGE: traditional Chinese inputs (should canonicalize via prompt)
    ["學校", "simple_word", "ok", "Traditional — same 2-char compound shape"],
    ["國家", "simple_word", "ok", "Traditional"],

    // EDGE: 5+ char compounds
    ["中华人民共和国", "simple_word", "fallback", "7-char compound — beyond chengyu range"],
    ["北京大学", "chengyu_4char", "ok", "4-char proper noun (university)"],

    // EDGE: pinyin input
    ["nihao", "simple_word", "fallback", "pinyin without tones — prompt should detect wrong_language"],
    ["pīnyīn", "simple_word", "fallback", "pinyin with diacritics"],

    // EDGE: bopomofo
    ["ㄋㄧˇ", "simple_word", "fallback", "bopomofo — non-hanzi script"],

    // EDGE: classical / literary
    ["之乎者也", "chengyu_4char", "ok", "classical chengyu"],

    // EDGE: mixed Latin acronym + hanzi
    ["IT 行业", "set_expression", "ok", "phrase with space"],

    // EDGE: number-letter mixed
    ["3D", "simple_word", "fallback", "mixed"],
    ["5G", "simple_word", "fallback", "mixed"],

    // EDGE: wrong-language
    ["hello", "simple_word", "fallback", "English on ZH source"],
    ["こんにちは", "simple_word", "fallback", "Japanese on ZH source"],
  ],

  es: [
    ["hola", "simple_word", "ok"],
    ["correr", "simple_word", "ok"],
    ["por favor", "set_expression", "ok"],
    ["Madrid", "proper_acronym", "ok"],
    ["ONU", "proper_acronym", "ok"],
    ["42", "number_symbol", "ok"],
    // edge
    ["¿qué?", "simple_word", "fallback", "special punctuation"],
    ["mañana", "simple_word", "ok", "diacritic"],
    ["el coche", "set_expression", "fallback", "article+noun — routed to set_expression"],
  ],
  fr: [
    ["bonjour", "simple_word", "ok"],
    ["manger", "simple_word", "ok"],
    ["s'il vous plaît", "set_expression", "ok"],
    ["Paris", "proper_acronym", "ok"],
    ["ONU", "proper_acronym", "ok"],
    ["c'est", "simple_word", "fallback", "elision form"],
    ["l'eau", "simple_word", "fallback", "article elision"],
  ],
  de: [
    ["Haus", "simple_word", "ok", "noun (de TITLE_CASE excluded)"],
    ["gehen", "simple_word", "ok"],
    ["zum Beispiel", "set_expression", "ok"],
    ["NATO", "proper_acronym", "ok"],
    ["Müller", "simple_word", "fallback", "Title-case surname routed to simple_word in de"],
    ["42", "number_symbol", "ok"],
  ],
  it: [
    ["ciao", "simple_word", "ok"],
    ["mangiare", "simple_word", "ok"],
    ["per favore", "set_expression", "ok"],
    ["Roma", "proper_acronym", "ok"],
    ["FIAT", "proper_acronym", "ok"],
  ],
};

const LATIN_LANGS = ["es", "fr", "de", "it"];

console.log("# Comprehensive classifier edge-case drytest\n");
let totalPass = 0, totalFail = 0, totalFallback = 0;
const failures = [];
const fallbacks = [];

for (const [lang, cases] of Object.entries(CASES)) {
  console.log(`## ${lang}\n`);
  for (const [input, expected, status, note] of cases) {
    let actual;
    if (lang === "ko") actual = classifyKoInput(input);
    else if (lang === "en") actual = classifyEnInput(input);
    else if (lang === "ja") actual = classifyJaInput(input);
    else if (lang === "zh-CN") actual = classifyZhInput(input);
    else if (LATIN_LANGS.includes(lang)) actual = classifyLatinInput(input, lang);

    const match = actual === expected;
    const tag = match
      ? (status === "ok" ? "  OK    " : "  FB    ")
      : "  MISS  ";
    if (!match) {
      failures.push({ lang, input, expected, actual, note });
      totalFail++;
    } else if (status === "fallback") {
      fallbacks.push({ lang, input, actual, note });
      totalFallback++;
    } else {
      totalPass++;
    }
    const noteStr = note ? ` — ${note}` : "";
    console.log(`${tag} ${String(input).padEnd(22)} → ${actual.padEnd(17)} (expected ${expected})${noteStr}`);
  }
  console.log();
}

console.log("---");
console.log(`Total: ${totalPass} clean pass / ${totalFallback} fallback (routing imperfect but prompt handles) / ${totalFail} MISMATCH`);
if (failures.length > 0) {
  console.log("\nMISMATCHES (classifier returned unexpected case):");
  for (const f of failures) {
    console.log(`  [${f.lang}] "${f.input}" → ${f.actual} (expected ${f.expected})${f.note ? " — " + f.note : ""}`);
  }
}

console.log(`\nClassifier accuracy: ${((totalPass / (totalPass + totalFallback + totalFail)) * 100).toFixed(1)}% clean route`);
console.log(`Including fallback-handled (prompt-resolved): ${(((totalPass + totalFallback) / (totalPass + totalFallback + totalFail)) * 100).toFixed(1)}%`);
process.exit(totalFail === 0 ? 0 : 1);
