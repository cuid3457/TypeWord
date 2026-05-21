// prompts-v3-zh.ts
// -----------------------------------------------------------
// ZH (Chinese, Simplified zh-CN) branched prompts for word-lookup-v2.
// Pattern mirrors prompts-v3-ja.ts: classify (regex) → case-specific
// specialized prompt. Each case carries its own cap discipline and
// example-style range.
//
// Cases (6):
//   number_symbol   — pure digits / math / symbol input
//   set_expression  — whitespace OR known greeting prefix (most ZH
//                     fixed expressions are 2–3 chars, no whitespace)
//   chengyu_4char   — exactly 4 Chinese characters (成语 idiom OR
//                     4-char compound; prompt distinguishes)
//   single_char     — single 汉字 (reading-disambiguation +
//                     counter / numeral / noun distinction)
//   latin_acronym   — all-uppercase Latin acronym (CCTV / BTS / KFC)
//                     used in Chinese discourse
//   simple_word     — 2–3 char compounds and everything else
//                     (includes hanzi-form proper nouns like 北京 / 中国)
//
// Each STATIC prompt addresses:
//   (Q1) case-aware branching for ZH source
//   (Q2) example diversity (subject/scene/shape/tense rotation)
//   (Q3) cap discipline (meanings/syn/ant tuned per case)
// -----------------------------------------------------------

import type { WordLookupRequest } from "./types.ts";
import { LANG_NAMES, POS_BY_LANG } from "./prompts-v3.ts";

export type ZhCase =
  | "number_symbol"
  | "set_expression"
  | "chengyu_4char"
  | "single_char"
  | "latin_acronym"
  | "simple_word";

// ============================================================
// Classifier regex set
// ============================================================
const SYMBOL_RE = /^[^\p{L}\p{N}\s]+$/u;
const NUMBER_RE = /^[\d\s+\-*/^!=<>().%,.]+$/;
// All-uppercase Latin acronym 2–9 chars (CCTV / BTS / KFC / NBA / WHO).
const LATIN_ACRONYM_RE = /^[A-Z][A-Z0-9-]{1,9}$/;
const PHRASE_RE = /\s/;
// Single CJK ideograph (basic + extension A).
const SINGLE_CHAR_RE = /^[一-鿿㐀-䶿]$/u;
// Exactly 4 CJK characters — chengyu candidate (or 4-char compound).
const FOUR_CHAR_HANZI_RE = /^[一-鿿㐀-䶿]{4}$/u;
// Greeting / formal-expression prefixes (single-token, whitespace-free).
// Checked BEFORE other shape rules so 「你好吗」 falls in set_expression
// rather than simple_word. Mirrors JA / KO pattern.
const FORMAL_EXPRESSION_PREFIXES = [
  "你好", "您好",
  "谢谢", "感谢",
  "对不起", "不好意思", "抱歉",
  "再见", "拜拜",
  "早上好", "晚上好", "晚安", "早安",
  "请问", "请多",
  "辛苦",
  "麻烦",
  "欢迎",
  "恭喜",
  "祝贺",
  "新年好", "新年快乐",
  "圣诞快乐", "生日快乐",
  "万事",
  "没关系", "没什么",
  "不客气", "不用",
];

/**
 * Classify a Chinese input into one of the case buckets. Regex-based,
 * <1ms. Ordering matters: formal-expression prefix precedes everything
 * else because 「你好吗」 (= 你好 + 吗) would otherwise fall to
 * simple_word.
 */
export function classifyZhInput(word: string): ZhCase {
  const w = (word ?? "").trim();
  if (!w) return "simple_word";
  if (SYMBOL_RE.test(w)) return "number_symbol";
  if (NUMBER_RE.test(w)) return "number_symbol";
  if (LATIN_ACRONYM_RE.test(w)) return "latin_acronym";
  if (PHRASE_RE.test(w)) return "set_expression";
  for (const pfx of FORMAL_EXPRESSION_PREFIXES) {
    if (w.startsWith(pfx)) return "set_expression";
  }
  if (SINGLE_CHAR_RE.test(w)) return "single_char";
  if (FOUR_CHAR_HANZI_RE.test(w)) return "chengyu_4char";
  return "simple_word";
}

// ============================================================
// Shared schema fragment used across all ZH cases
// ZH keeps `reading` REQUIRED (pinyin with tone marks) and OMITS `ipa`
// (pinyin IS the pronunciation layer for Chinese).
// ============================================================

const SHARED_SCHEMA = `Output a strict JSON object matching this schema (do not wrap in markdown fences):

<schema>
{
  "headword": string,                       // canonical Simplified Chinese form (typo fix; traditional → simplified; preferred form)
  "reading"?: string[],                      // see <reading_rule>; required when applicable
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

<simplified_canonical priority="critical">
Canonical headword MUST be Simplified Chinese (简体). If input is in Traditional (繁體), convert to Simplified for the headword. originalInput still echoes the input verbatim. Examples of canonicalization the headword performs:
- 學 → 学 / 漢 → 汉 / 國 → 国 / 愛 → 爱 / 開 → 开 / 來 → 来 / 對 → 对 / 時 → 时
The simplified form anchors all downstream cache entries; emitting a traditional headword would split cache storage.
</simplified_canonical>

<reading_rule>
EMIT reading[] for any Chinese headword (single char or multi-char). Use Hanyu Pinyin with TONE MARKS (mā / má / mǎ / mà / ma), separated by spaces between syllables for multi-char words. Examples of pinyin form: 你好 → "nǐ hǎo"; 中国 → "zhōng guó"; 一帆风顺 → "yī fān fēng shùn"; 水 → "shuǐ"; 行 → ["xíng", "háng"] (multi-reading character).

- For single-character headwords with multiple readings tied to distinct senses, emit one reading per sense (index-aligned with meanings).
- For multi-char compounds with one canonical reading: single-element array.
- NEVER use numeric tone notation ("ni3 hao3" / "mā1"); ALWAYS diacritic marks (nǐ hǎo / mā).
- NEVER include the neutral-tone dot or stress marks — just the 4 tone diacritics + neutral (no mark for neutral).
- Pinyin uses ASCII letters with Unicode diacritics; never IPA, never zhuyin/bopomofo.
- For Latin-acronym headwords (handled in latin_acronym case), OMIT reading.
- For symbol / number headwords, OMIT reading.
</reading_rule>

<forbidden>
- "ipa" key (Chinese uses pinyin = the canonical pronunciation layer).
- "gender" key (Chinese nouns have no grammatical gender).
- "examples", "synonyms", "antonyms" (separate ENRICH call).
- Padding meanings to reach 2–3 when one clean sense suffices.
- Encyclopedic definitions ("有名的", "传统的", "X的一种", "X的行为", "用来X的Y").
- Bopomofo / zhuyin in any field.
- Traditional characters in the canonical headword (originalInput preserves the input form; headword is always simplified).
- ANY non-Chinese characters inside meanings[].definition or meanings[].partOfSpeech (canonical side stays 100% Chinese — no English glosses, no Korean glosses, no Latin script except numerals/symbols embedded in the headword surface itself).
- ANY Chinese characters inside meanings_translated[].definition or meanings_translated[].partOfSpeech (TARGET_LANG side stays 100% TARGET_LANG — see <translation_purity_strict>).
- Putting the reading / pinyin INSIDE meanings[].definition (the reading belongs in the top-level reading[] field; never duplicate it inside a definition text).
- POS name (名词 / 动词 / 形容词 / 副词 / 表达 / 数词 / 符号 / 专有名词 / 叹词 etc.) leaking INTO meanings[].definition or meanings_translated[].definition. The POS belongs in partOfSpeech field ONLY. WRONG: "(动词) 吃、动词"; RIGHT: "(动词) 吃". NEVER emit definitions like "吃、动词" / "to eat, verb" where the trailing token is the POS name.
</forbidden>

<headword_surface_invariant priority="critical">
The "headword" field MUST be a real Chinese-form rendering of the input lemma. For NON-numeric, NON-symbol, NON-Latin-acronym inputs: headword is the canonical Simplified Chinese lemma. For NUMERIC inputs ("123" / "1984" / "3.14") and SYMBOL inputs ("@" / "#"): the headword MUST PRESERVE the input's surface form VERBATIM — DO NOT replace digits with their hanzi-numeral spelling, DO NOT replace a symbol with its name. Example sentences and markers also use the input's surface form. The literal pinyin/character reading goes in meanings[].definition (or in reading[] for hanzi headwords), never in the headword for numeric input.
</headword_surface_invariant>

<definition_format>
- Length: ≤12 chars CJK (canonical Chinese) / ≤6 words (TARGET_LANG when Latin script).
- Shape: single word OR comma-separated 2–3 NEAR-SYNONYMS at SAME specificity (e.g. "happy, joyful" — same sense, alternate wording). NEVER use commas to fuse distinct senses (e.g. "walk, profession" is WRONG — those are separate senses each getting their own meanings[] entry). Never specific + hypernym.
- Every term in the definition is a real existing word in its language.
- relevanceScore: emit a TRUE frequency estimate per sense, NOT a default 80. Anchor primary everyday sense at 90–100. Subsequent senses must reflect actual relative rarity:
  • Dominant single sense (one meaning ≈ 95%+ of usage): primary=100, secondary senses below 60 → DO NOT emit.
  • Strongly skewed (one sense ≈ 80%, others present but rarer): primary=95, secondary 60–75 if attested everyday.
  • Balanced homonyms (multiple senses with roughly equal everyday frequency): each sense 75–95, spread ≤ 15.
  • Senses below 60 (archaic / literary / compound-only / rare) → DO NOT emit.
  Downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Set honestly — review weighting uses these. Don't collapse all to identical scores; emit ALL senses that pass the bar.
- Reading / pinyin goes EXCLUSIVELY in the top-level reading[] field. NEVER repeat the pinyin inside meanings[].definition.
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

- meanings_translated[].definition — 100% TARGET_LANG script only. No Chinese hanzi, no English glosses, no parentheticals (the ONLY exception is the optional register-tag form like "(격식)" / "(속어)" for set_expression / chengyu case).
- meanings_translated[].partOfSpeech — MUST be a TARGET_LANG word taken from the TARGET_LANG list under <pos_allowed>. NEVER emit English POS labels ("verb" / "noun" / "adjective" / "expression") in this field. NEVER emit Chinese POS labels ("动词" / "名词" / "形容词" / "表达" / "符号") in this field. The TARGET_LANG-native term is mandatory — if TARGET_LANG is Korean, partOfSpeech is one of: 명사 / 동사 / 형용사 / 부사 / 전치사 / 접속사 / 감탄사 / 대명사 / 고유명사 / 표현 / 수사 / 기호. If TARGET_LANG is Japanese, English, Spanish, French, German, Italian — use that language's POS list under <pos_allowed>.
- The translated partOfSpeech MUST be derivable from the canonical partOfSpeech via standard alignment (动词 ↔ verb ↔ 동사 ↔ 動詞 etc.). NEVER invent a POS not present in the TARGET_LANG <pos_allowed> list. If no TARGET_LANG analog exists for an obscure ZH POS, use the closest from the allowed list (default to 名词 / 表达 analogs in TARGET_LANG); NEVER coin a new POS term.

Pre-emit checks:
□ meanings_translated[i].definition contains zero Chinese characters.
□ meanings_translated[i].partOfSpeech is from the TARGET_LANG <pos_allowed> list exactly.
□ meanings[i].definition / meanings[i].partOfSpeech contain zero non-Chinese characters (the canonical side is the inverse purity rule).
</translation_purity_strict>`;

const SHARED_TRANSLATION = `<translation_rules>
- meanings_translated entries in TARGET_LANG. Concise dictionary equivalent (single word or 2–3 comma-separated near-synonyms).
- Same count and order as meanings.
- False-friend awareness: translate the SENSE from the canonical definition, never the surface hanzi.
- Register: daily-life concepts (kinship/body/food/weather/common actions) → colloquial spoken form in TARGET_LANG, not formal/literary.
- Sino-loanword false friends (esp. JA ↔ KO ↔ ZH): 经济 (Chinese) = economy (matches JA/KO); 文化 = culture (matches); but ALWAYS translate the SENSE in Chinese usage, not assume Sino-cognate equivalence.
- LOANWORD PRIORITY: when TARGET_LANG has a well-established native form for the Chinese headword, USE THAT FORM, NOT a descriptive paraphrase. The translated definition should be what a TARGET_LANG native learner instantly recognizes.
  • 咖啡 → ko "커피"; ja "コーヒー"; en "coffee"
  • 电脑 / 计算机 → ko "컴퓨터"; ja "コンピューター"
  • 巴士 / 公共汽车 → ko "버스"; ja "バス"
  • 沙发 → ko "소파"; ja "ソファ"
  Descriptive paraphrase is ONLY for concepts that lack a native single-word equivalent. For common everyday loanwords / international concepts, NEVER descriptive — use the established native form.
</translation_rules>

${SHARED_TRANSLATION_PURITY}`;

// ============================================================
// Case 1: NUMBER_SYMBOL — digits / math / symbols
// ============================================================

const ZH_NUMBER_SYMBOL_STATIC = `<role>Chinese vocabulary expert. Input is a number, math expression, or symbol/punctuation. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<pos_classification priority="critical">
- A number / math expression / formula → partOfSpeech="数词" (canonical Chinese). NEVER "表达", NEVER "名词".
- A symbol / punctuation mark → partOfSpeech="符号" (canonical). NEVER "表达".
- Secondary cultural / conventional sense (e.g. 「911」 as emergency code; 「3.14」 as pi) takes the appropriate content POS (名词 / 专有名词), but the primary literal-reading meaning stays "数词".
</pos_classification>

<rules>
- Number: meaning[0] = literal Chinese reading using SINO numerals (一・二・三・四・五・六・七・八・九・十・百・千・万・亿) joined naturally (四十二 / 一千九百八十四 / 一百). Single literal-reading meaning per number.
- Year-shaped 4-digit number (1900–2099): CHINESE canonical reading uses the digit-by-digit form ("一九八四"). However, the TARGET_LANG translation MUST use the TARGET_LANG's conventional year-reading style (not blindly mirror the Chinese digit-by-digit form):
  • English → "nineteen eighty-four" (paired form). WRONG: "one nine eight four" (digit-by-digit). NEVER emit individual digit names when TARGET_LANG is English for a year-shaped input — the paired form is the only natural English year reading.
  • Spanish → "mil novecientos ochenta y cuatro"
  • French → "mille neuf cent quatre-vingt-quatre"
  • German → "neunzehnhundertvierundachtzig"
  • Italian → "millenovecentoottantaquattro"
  • Japanese → "せんきゅうひゃくはちじゅうよん" or "千九百八十四"
  • Korean → "천구백팔십사"
  The translated reading is the natural way a literate speaker of TARGET_LANG would say that year, NOT a digit-by-digit transliteration of the Chinese reading. The Chinese canonical and TARGET_LANG translated reading are INDEPENDENT — each follows its language's year convention.
- Math expression / formula: literal reading, NEVER compute. ("2+3" → "二加三", not "五".)
- Fraction a/b: denominator-first ("3/4" → "四分之三", "1/2" → "二分之一").
- Decimal a.b: digits AFTER the decimal point are read INDIVIDUALLY. "3.14" → "三点一四". TARGET_LANG follows: Korean → "삼 점 일사"; Japanese → "三点一四" or "さん てん いちよん"; English → "three point one four"; Latin targets → individual digit words. NEVER read post-point digits as a multi-digit number.
- Symbol/punctuation: meaning[0] = the symbol's Chinese name (例: "@" → "艾特、at符号"; "#" → "井号、井字号"; "*" → "星号"; "&" → "和号"). Never empty for known symbols.
- Cultural / conventional sense for a SPECIFIC token: when the EXACT token doubles as a culturally established referent that a literate adult would recognize beyond the bare number, emit it as meaning[1]. Categories that qualify:
  • Well-known titled work where the number IS the title (novel / film / album).
  • Emergency-services or operational code (110 = 警察; 119 = 消防 / 急救; 120 = 急救).
  • Historically significant year-name with strong cultural recognition.
  • Math / physics constant (3.14 → π pi; 2.718 → e; 1.618 → 黄金比; 9.8 → 重力加速度).
  • Iconic numeric meme (1984 → Orwell novel; 42 → Hitchhiker's Guide answer; 666 → 兽数; 404 → not-found).
  - meaning[1] uses content POS: "名词" for concept-shaped senses (constant, code, meme reference), "专有名词" for titled works (novel, film, album).
  - meaning[1].definition uses the BARE category in canonical Chinese: "小说" / "电影" / "专辑" / "代号" / "常数" — NOT the author/creator name, NOT title attribution. Same forbidden-qualifier discipline as latin_acronym case.
  - meaning[1] is fundamentally DIFFERENT in POS and category from meaning[0].
  - Cap 2 meanings total.
  - Inclusion test: would a literate Chinese-speaking adult, hearing the bare token by itself with no context, quickly think of a famous titled work / code / constant / meme beyond the bare number? If yes → include. For math constants (3.14, 2.718) and iconic memes (110, 119, 666, 404, 911, 1984), the cultural sense is REQUIRED — not optional.
</rules>

<sino_korean_numerals priority="critical">
When TARGET_LANG is Korean (ko), every number translation MUST use the Sino-Korean numeral system (한자어 수사: 일/이/삼/사/오/육/칠/팔/구/십/백/천/만/억 and compounds 사십이/백오/천구백팔십사). NEVER native Korean numerals (하나/둘/셋/마흔둘/스물 etc.).
</sino_korean_numerals>

${SHARED_TRANSLATION_PURITY}

<verify_before_emit>
□ headword EQUALS originalInput surface verbatim — for numeric input the headword is the digits ("42" / "1984" / "3.14"), NOT the hanzi-numeral spelling ("四十二" / "一九八四"). For symbol input the headword is the symbol ("@" / "#"), NOT its name.
□ Examples / markers use the input's digits / symbol surface — never the hanzi-numeral spelling inside ** markers for a numeric input.
□ Literal reading uses Sino-Chinese numerals (一・二・三・... / 百 / 千 / 万) joined naturally.
□ Number / math token → partOfSpeech="数词" (canonical) on the literal-reading meaning.
□ Symbol / punctuation → partOfSpeech="符号" (canonical).
□ Decimal: post-point digits read individually as a compound digit string in CJK targets ("3.14" → zh "三点一四", ko "삼 점 일사", ja "三点一四"); never as a multi-digit number.
□ Korean number translations use SINO numerals only.
□ Year-shaped 4-digit number uses digit-by-digit form (一九八四), not multi-digit (一千九百八十四).
□ No parallel-reading duplicate meanings.
□ If a cultural / conventional sense exists for the SPECIFIC token, meaning[1] uses content POS (名词 / 专有名词) — never another "数词" entry.
□ meanings_translated[].partOfSpeech is the TARGET_LANG analog from <pos_allowed> (Korean "수사" / "기호" / "명사" / "고유명사" — NEVER the Chinese "数词" / "符号" leaking when TARGET_LANG ≠ Chinese).
□ reading OMITTED (numbers/symbols have no hanzi to romanize).
□ Meaning count ≤ 2.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 2: SET_EXPRESSION — multi-token phrase OR single-token greeting
// ============================================================

const ZH_SET_EXPRESSION_STATIC = `<role>Chinese vocabulary expert. Input is a recognized fixed expression (greeting, polite phrase, idiom — non-4-char). Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<scope_decision priority="critical">
1. SPECIFIC recognized fixed expression a native speaker would identify by name → emit as expression with its pragmatic meaning. Categories:
   • 问候 (greeting): 你好 / 您好 / 早上好 / 晚上好 / 晚安 / 再见 / 拜拜 / 你好吗
   • 感谢 (gratitude): 谢谢 / 感谢 / 多谢 / 谢谢你
   • 道歉 (apology): 对不起 / 不好意思 / 抱歉
   • 应答 (response): 不客气 / 没关系 / 没什么 / 不用谢
   • 请求 (request): 请问 / 麻烦你 / 请多关照
   • 祝福 (blessing): 生日快乐 / 新年快乐 / 圣诞快乐 / 万事如意 / 一切顺利
   • 介绍 (introduction): 初次见面 / 很高兴认识你
   These ARE valid fixed-expression headwords. Recognize them. Do NOT classify variants as "sentence" — they are dictionary-attested set phrases.
2. Composed clause that ISN'T a specific known idiom/expression → note="sentence", meanings=[].
3. Conventionality is the test, not grammar. A native quoting a known proverb → expression. A composed-for-the-moment clause → sentence.
4. Misspelled fixed expression: be GENEROUS with typo correction for common fixed expressions. Single typo character (e.g. "你号" → "你好"; "谢谢你" written variant; "对部起" → "对不起"; "再見" → "再见" with Traditional→Simplified) MUST be accepted: emit the corrected headword in the headword field, populate meanings normally with the pragmatic function of the corrected lexeme, and OMIT the note field. NEVER invent a new meaning by treating the typo as a literal lookup (e.g. "你号" should NOT become "你的号码 = your number" — that is fabrication; emit corrected "你好" greeting meaning instead). ONLY reject as "sentence"/"non_word" when the input has 2+ unrelated character errors making recognition genuinely ambiguous.
5. When unsure → "sentence" (anti-fabrication).

note vs meanings consistency: when note="sentence" / "non_word" is set, meanings MUST be []. When meanings is non-empty, note MUST be omitted. NEVER emit both.
</scope_decision>

<pragmatic_meaning priority="critical">
- The meaning is the PRAGMATIC FUNCTION the phrase as a whole carries — never the literal sum of parts.
  • 你好 → "问候" (greeting; "hello") — NOT "you + good".
  • 不客气 → "对感谢的回应" — NOT "not + polite".
  • 没关系 → "对道歉的安抚回应" — NOT "no + relation".
- partOfSpeech reflects the phrase's role: most fixed expressions → "表达". Sentential idioms / proverbs → "表达". Multi-word noun compounds → "名词".
- DEFAULT cap: 1 meaning. Use 2 ONLY when the expression has GENUINELY distinct pragmatic uses (rare).
</pragmatic_meaning>

<no_padding priority="critical">
A fixed expression usually has ONE canonical pragmatic function. Resist generating "another sense" just because the slot exists.
</no_padding>

<register_matching priority="critical">
ZH fixed expressions carry register signals (formal 您好 vs casual 你好; formal 谢谢您 vs casual 谢谢). The TARGET_LANG translation MUST preserve that register.

PREFERRED form for register-distinctive source idioms — the **plain TARGET_LANG equivalent + parenthetical register tag**:
- "<plain TARGET_LANG word>(<register tag>)"
- Korean register tags: "(속어)" informal, "(완곡)" euphemistic, "(비속어)" vulgar-adjacent, "(격식)" formal, "(고어)" archaic. Pick the single most accurate one.
- Other-language tags: use analogous concise label in TARGET_LANG.

Register categories to detect:
- FORMAL / 敬语 (您 / 请 / formal verb forms) → "(격식)" or analog. NEVER drop the formality marker.
- CASUAL (你 / 拜拜 / casual fillers) → casual tag or no tag (when neutral suffices).
- NEUTRAL → plain equivalent with NO tag.
</register_matching>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Headword preserves the phrase verbatim (no truncation; simplified form).
□ Meaning expresses the WHOLE-PHRASE pragmatic function, not a literal parse.
□ partOfSpeech is "表达" for sentential / greeting expressions; "名词" only for fixed noun compounds.
□ reading present (pinyin with tones for the whole phrase).
□ Meaning count = 1 by default; 2 only for genuinely polysemous expressions.
□ Register check: if source is 敬语/formal/casual-distinctive, does the TARGET_LANG translation carry the same register? If it reads as plain dictionary form → REWRITE with register-matching equivalent.
□ No slang/vulgar sense leaked through.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 3: CHENGYU_4CHAR — exactly 4 Chinese characters
// ============================================================
// 成语 = classical 4-char idiom with non-literal meaning. But not every
// 4-char input is a chengyu; some are 4-char compound nouns. Prompt
// distinguishes.

const ZH_CHENGYU_4CHAR_STATIC = `<role>Chinese vocabulary expert. Input is exactly 4 Chinese characters — likely a 成语 (chengyu / 4-character classical idiom) but possibly a 4-character compound noun. Decide which, then output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<shape_decision priority="critical">
The 4-char input falls into ONE of three categories:

1. CHENGYU (成语 / classical 4-char idiom): non-literal pragmatic meaning, dictionary-attested as a fixed idiom. Examples of the shape (do NOT use these in output): 「一帆风顺」「画蛇添足」「亡羊补牢」「井底之蛙」「指鹿为马」. The meaning is the FIGURATIVE pragmatic sense, NEVER the literal sum of characters.
2. 4-CHAR COMPOUND NOUN: a real 4-char noun lexeme that is NOT a chengyu. Examples of the shape: 「电视节目」「人民日报」「中华民族」. The meaning is the standard compositional sense.
3. NOT a recognized 4-char lexeme: free composition. note="sentence", meanings=[].

DECISION RULE:
- If input is dictionary-attested as a chengyu → treat as CHENGYU.
- If input is a compositional 4-char compound noun → treat as compound.
- If neither → note="sentence".
</shape_decision>

<chengyu_rules priority="critical">
For CHENGYU output:
- partOfSpeech = "表达" (canonical Chinese — chengyu are emitted under the "表达" POS bucket since that is the term present in the canonical <pos_allowed> list; NEVER coin "成语" as a POS string even though linguistically chengyu form a sub-category of fixed expressions).
- meaning[0].definition = the FIGURATIVE pragmatic sense in modern Chinese (NEVER a literal parse). 12 chars or fewer.
- Cap STRICTLY = 1 meaning on the canonical side. Chengyu have one fixed figurative meaning.
- Some chengyu carry literary / formal register; reflect that in the TARGET_LANG translation via register tag where possible (e.g. "(격식)" for Korean).
</chengyu_rules>

<compound_noun_rules priority="critical">
For 4-CHAR COMPOUND NOUN output:
- partOfSpeech = "名词".
- meaning[0].definition = the standard noun sense in modern Chinese.
- Cap 1 meaning (compound nouns rarely have polysemy at this length).
- For proper-noun compounds (中华民族 / 人民日报 / 中国银行): use "专有名词" instead of "名词"; treat per proper-noun translation conventions ("<headword>, <bare category>").
</compound_noun_rules>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Headword is exactly 4 Chinese characters (simplified canonical).
□ reading is the pinyin of all 4 characters with tone marks, space-separated.
□ partOfSpeech reflects the actual lexeme type (成语 idiom → "成语" or "表达"; common noun compound → "名词"; proper noun compound → "专有名词").
□ For chengyu: definition is FIGURATIVE pragmatic sense, NEVER a literal parse. Cap = 1 meaning.
□ For compound noun: definition is the standard noun sense.
□ For neither: note="sentence", meanings=[], meanings_translated=[].
□ No examples / synonyms / antonyms in output.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 4: SINGLE_CHAR — single Chinese character
// ============================================================
// Hardest case: many single hanzi have multiple readings (多音字)
// tied to different senses. Plus numerals / counters / standalone
// nouns share the single-char shape.

const ZH_SINGLE_CHAR_STATIC = `<role>Chinese vocabulary expert. Input is a SINGLE Chinese character. Output strict JSON per <schema>. Apply STANDALONE-ONLY filter with reading disambiguation.</role>

${SHARED_SCHEMA}

<standalone_inclusive priority="critical">
DEFAULT: INCLUDE the character's standalone meanings. Chinese has many legitimate single-character standalone words. Only refuse (note="non_word") when truly no standalone sense exists in modern usage.

INCLUDE every applicable category below as a standalone sense:

1. SINO NUMERAL (一 / 二 / 三 / 四 / 五 / 六 / 七 / 八 / 九 / 十 / 百 / 千 / 万 / 亿): ALWAYS include the numeral sense.
2. COUNTER / MEASURE WORD (个 / 只 / 本 / 张 / 条 / 件 / 双 / 对 / 杯 / 瓶 / 把 / 间 / 次 / 回 / 遍 / 块): include the counter sense.
3. STANDALONE NOUN:
   • Body: 眼 / 口 / 手 / 脚 / 头 / 心 / 牙 / 耳 / 鼻 / 脸 (note: many require 子 suffix in modern usage; standalone usage is dictionary-attested but less colloquial)
   • Nature: 水 / 火 / 山 / 川 / 海 / 河 / 江 / 风 / 雨 / 雪 / 云 / 星 / 月 / 日 / 花 / 草 / 树
   • Place: 国 / 家 / 城 / 街 / 路 / 房
   • Concept: 爱 / 心 / 梦 / 力 / 道 / 法
   • Animal: 猫 / 狗 / 鸟 / 鱼 / 马 / 牛 / 羊 / 龙
4. PRONOUN / DEMONSTRATIVE: 我 / 你 / 他 / 她 / 它 / 这 / 那 / 谁
5. PARTICLE / GRAMMATICAL: 了 / 的 / 着 / 吗 / 呢 / 啊 / 把 / 被 — typically too grammatical to be a learner lookup; if input IS one of these, define the grammatical function in 1 sentence and use "助词" or "副词" as POS.
6. ADVERB / FUNCTION WORD: 也 / 都 / 还 / 又 / 在 / 没 / 不 — define the function.

REJECT ONLY when truly no standalone modern usage exists:
- A character that appears EXCLUSIVELY inside compounds and cannot carry the sense in any natural sentence.
- Genuine character-dictionary-only glosses (文言 / 古汉语 / archaic) with no modern attestation.

DEFAULT BIAS: when in doubt, INCLUDE. The HSK wordlist contains the headword, so the standalone usage was confirmed during list curation.
</standalone_inclusive>

<reading_disambiguation priority="critical">
Single hanzi often has MULTIPLE READINGS (多音字 / polyphone), each tied to a different sense:

- 行 = xíng (verb "to walk / go" / adj "OK") vs háng (noun "row / line / profession")
- 长 = cháng (adj "long") vs zhǎng (verb "to grow / be elder")
- 重 = zhòng (adj "heavy") vs chóng (adv "again / repeat")
- 还 = hái (adv "still / also") vs huán (verb "to return sth")
- 着 = zhe (particle progressive) vs zháo (verb "to touch / catch") vs zhāo (noun "move in game")
- 都 = dōu (adv "all") vs dū (noun "capital city")
- 觉 = jué (verb "to feel / sense") vs jiào (noun "sleep" — as in 睡觉)
- 干 = gàn (verb "to do") vs gān (adj "dry")
- 好 = hǎo (adj "good") vs hào (verb "to like" — literary / less common standalone)

When multiple readings tied to DISTINCT senses exist:
- Emit meanings in order: most common modern STANDALONE usage first.
- reading[] array carries the reading per sense (index-aligned with meanings).
- DROP readings that ONLY surface in compounds.

When all senses share the same reading: reading[] = single-element array.
</reading_disambiguation>

<learner_first_meaning priority="critical">
For 1-character headwords with multiple senses, emit the LEARNER-FIRST sense (HSK 1–3 level) as meaning[0]:

- 上 primary = "上面、上方" (noun "above / top") OR "上去" (verb "to go up") — pick the more commonly looked-up sense at learner level.
- 下 primary = "下面、下方" (noun "below / down") OR verb "to go down".
- 人 primary = "人类、个人" (noun "person / human").
- 月 primary = "月份" (noun "month" — calendar) AND "月亮" (noun "moon") — both N5; emit both as separate senses with reading distinction in some cases (月份 vs 月亮 share reading yuè).
- 日 primary = "日子、天" (noun "day / sun").
- 行 primary depends: if learner asking standalone, "xíng" with verb "to walk / OK" sense is typical; "háng" "row / profession" is secondary.
- 不 primary = "不、没" (adv "no / not") — function word.
- 了 primary = particle "完成时" — define as grammatical function word.

These overrides apply BEFORE polysemy listing.
</learner_first_meaning>

${SHARED_SLANG}

<translation_rules>
- meanings_translated entries in TARGET_LANG. Concise dictionary equivalent (1 word or 2–3 comma-separated near-synonyms).
- TARGET_LANG purity (no Chinese chars, no English parentheticals).
- False-friend awareness: translate the SENSE per canonical definition.
- Proper noun (rare for single hanzi): "<transliteration>, <bare category>".
</translation_rules>

${SHARED_TRANSLATION_PURITY}

<verify_before_emit>
□ headword is the single hanzi character VERBATIM — no reading attached to the headword, no multi-char expansion.
□ meanings_translated emitted FIRST, same count as meanings.
□ Every meanings.definition contains ONLY Chinese — NO pinyin / reading mixed into the definition text. The pinyin is in the top-level reading[] field, NOT inside meanings[].definition.
□ Every meanings.partOfSpeech in Chinese from <pos_allowed>.
□ Every meanings_translated.definition / partOfSpeech in TARGET_LANG only, from TARGET_LANG <pos_allowed> list.
□ reading[] present and aligned to meanings array order — one entry per meaning when senses use different readings (多音字); single-element array when all senses share the same reading.
□ Each surviving sense passes the standalone test (can be a sentence with bare 1-char headword).
□ NO compound-only readings (those belong to compound entries).
□ Meaning count ≤ 2 (1 is normal; 2 for true reading-distinct senses 多音字).
□ If 0 senses survive standalone → note="non_word", meanings=[], meanings_translated=[].
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 5: LATIN_ACRONYM — all-uppercase Latin acronym used in
// Chinese discourse (CCTV / NBA / WTO / KFC / BTS)
// ============================================================

const ZH_LATIN_ACRONYM_STATIC = `<role>Chinese vocabulary expert. Input is a Latin-script acronym used in Chinese discourse. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<acronym_rules priority="critical">
- partOfSpeech = "专有名词" (canonical Chinese).
- meaning[0].definition = "<Chinese expansion / explanation>、<bare category>" — both in Chinese. Examples of the shape: CCTV → "中国中央电视台、电视台"; NBA → "美国职业篮球联赛、体育联盟"; WTO → "世界贸易组织、国际组织"; KFC → "肯德基、快餐连锁".
- Category is the bare noun in Chinese (电视台 / 联盟 / 组织 / 公司 / 协会 — NO qualifiers like "著名的" / "美国的" / "历史悠久的").
- Cap STRICTLY = 1 meaning.
- If the acronym refers to a sensitive entity → use bare category only ("组织" / "机构"), no charged descriptors.
</acronym_rules>

<translated_proper_format priority="critical">
For meanings_translated on Latin-acronym headwords, the translation MUST surface the TARGET_LANG-native form of the name FIRST, then the bare category, comma-separated:

- meanings_translated[0].definition = "<TARGET_LANG transliteration / native form of expansion>, <bare category in TARGET_LANG>". When the acronym has an established TARGET_LANG-native form (Korean "중국중앙텔레비전" for CCTV, "미국프로농구" for NBA), use that established form.
- Bare category in TARGET_LANG: 방송국 (TV station) / 협회 (association) / 회사 (company) / 기관 (organization) / 연맹 (federation).
- Same forbidden-qualifier rules apply on the translated side.
</translated_proper_format>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ headword is the Latin acronym VERBATIM (no expansion in the headword field).
□ Exactly 1 meaning.
□ Canonical definition: "<Chinese expansion>、<bare category>" — never just the bare category alone.
□ Translated definition: "<TARGET_LANG-native name>, <category in TARGET_LANG>" — name FIRST, never omitted.
□ partOfSpeech on canonical side = "专有名词" (Chinese term).
□ partOfSpeech on translated side = the TARGET_LANG-native analog from <pos_allowed>. Critical: for Korean target use "고유명사"; for Japanese target use "固有名詞"; for English target use "proper noun"; for Spanish "nombre propio"; for French "nom propre"; for German "Eigenname"; for Italian "nome proprio". NEVER leak the Chinese "专有名词" into the translated side when TARGET_LANG ≠ Chinese. NEVER duplicate the category word inside the partOfSpeech field (e.g. WRONG: partOfSpeech="专有名词" + definition="세계무역기구, 고유명사" — the "고유명사" inside the definition is a category leak; RIGHT: partOfSpeech="고유명사", definition="세계무역기구, 기관").
□ reading OMITTED (Latin acronym).
□ ipa OMITTED.
□ No nationality / era / evaluative modifier on either side.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 6: SIMPLE_WORD — 2-3 char compounds + everything else
// ============================================================
// Default fallback. Handles hanzi-form proper nouns (北京 / 中国 / 马云)
// via internal proper-noun branch.

const ZH_SIMPLE_WORD_STATIC = `<role>Chinese vocabulary expert. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<standalone_test>
Each meaning MUST be demonstrable in a single learner sentence with the bare headword as a standalone word. Drop:
- Compound-only senses where the bare headword cannot surface
- Constituent-character glosses
- Literary / archaic / 文言 senses
- Cross-language homograph drift (English meaning of same spelling that doesn't exist in modern Chinese)
</standalone_test>

<typo_correction priority="critical">
For inputs that look like a misspelled common Chinese word (especially fixed expressions / greetings written with one wrong character), be GENEROUS with typo correction. Pattern examples (DO NOT use as positive lookup table — just illustrative of the typo→correction principle):
- "你号" → recognize as typo of "你好" (greeting). Emit headword="你好" + meanings populated with greeting function. NEVER literal "你的号码 (your number)" — that is fabrication from individual-character meanings.
- "谢蟹" / "謝謝" → "谢谢" (gratitude)
- "再見" → "再见" (Traditional → Simplified). Always normalize traditional to simplified in canonical headword.
- "對不起" → "对不起"

DECISION:
1. Single character typo or Traditional spelling → CORRECT to standard Simplified form, emit corrected headword + meanings of corrected lexeme, OMIT note field.
2. 2+ unrelated character errors → note="non_word", meanings=[].
3. NEVER fabricate meanings from individual-character interpretation when the input looks like a typo of a real lexeme (you + good for 你号, your + number = WRONG fabrication).
</typo_correction>

<accept_categories priority="critical">
The following categories are ALWAYS legitimate standalone words — INCLUDE them, never refuse with note="non_word":

1. PROPER NOUNS in hanzi form (places, people, countries, brands):
   • Countries: 中国 / 美国 / 日本 / 韩国 / 英国 / 法国 / 德国
   • Cities: 北京 / 上海 / 广州 / 深圳 / 香港 / 台北 / 东京 / 首尔
   • People: canonical Chinese form
   Format: partOfSpeech="专有名词". Definition = "<headword>、<bare category>" — examples of the format: 北京 → "北京、城市"; 中国 → "中国、国家"; 上海 → "上海、城市". The hanzi headword + bare category mirrors the latin_acronym format for visual / structural parity.
   • Translated side follows the proper-noun translation format: "<TARGET_LANG-native form>, <bare category in TARGET_LANG>". Korean "베이징, 도시" for 北京; "중국, 국가" for 中国.

2. COMPOUND NOUNS (2-3 char combining into a single noun lexeme):
   • Daily life: 学校 / 朋友 / 家庭 / 公司 / 餐厅 / 时间 / 工作
   • Abstract: 文化 / 教育 / 经济 / 政治 / 社会 / 自然
   • Concrete: 电车 / 书店 / 医院 / 图书馆 / 公园

3. VERBS (动词 — usually 1-2 chars):
   • 吃 / 喝 / 看 / 听 / 说 / 走 / 跑 / 写 / 读 / 买 / 卖 / 来 / 去
   • Compound verbs: 学习 / 工作 / 喜欢 / 知道 / 认识 / 觉得 / 开始 / 结束

4. ADJECTIVES (形容词):
   • Simple: 好 / 大 / 小 / 多 / 少 / 快 / 慢 / 高 / 低 / 新 / 旧
   • Compound: 漂亮 / 干净 / 重要 / 简单 / 复杂 / 容易 / 困难

5. ADVERBS (副词):
   • 很 / 也 / 都 / 还 / 又 / 已经 / 马上 / 一起 / 经常 / 总是

6. MEASURE-WORD COMPOUNDS (rare bare standalone, usually with numeral):
   • 一个 / 一只 / 一本 / 一杯 — these surface as numeral+counter; the bare counter falls in single_char case.

DEFAULT: when in doubt about a 2-3 char Chinese word that looks like a normal noun/verb/adjective, INCLUDE it.
</accept_categories>

<polysemy>
Emit ALL standalone senses that pass the everyday-frequency bar — a sense an ordinary modern Chinese speaker encounters as a bare-form headword in natural speech, with relevanceScore ≥ 60.

Set relevanceScore honestly: 90–100 primary, 70–89 clearly common secondary, 60–69 attested everyday, below 60 (archaic / literary / compound-only / rare) → DO NOT emit.

You MUST NOT skip a common standalone sense merely because another sense feels more frequent. The downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Emit honestly.

INCLUDE patterns when each is attested as ordinary everyday usage:
- Verb that ALSO functions as adjective in some contexts.
- Noun + verb double-life where both are common.

EXCLUDE:
- Constituent-character meaning (don't gloss 电视 = "electricity + sight"; gloss as "电视=television").
- Senses found only in 文言 / classical usage.
</polysemy>

<no_padding priority="critical">
**SINGLE meaning is the DEFAULT.** Most Chinese compounds have ONE dominant standalone sense. Use 1 meaning unless TWO senses are GENUINELY distinct.

**STRICT secondary-meaning gate** — before adding a 2nd/3rd meaning, ALL must be true:
1. Dictionary-attested in modern Chinese for the EXACT bare headword
2. Native speakers commonly encounter this sense in standalone usage
3. The TARGET_LANG translation is materially DIFFERENT from the primary
4. You can construct a learner-grade example demonstrating THIS sense distinctly

If ANY check fails → DROP the secondary.

REJECT these fabrication patterns:
- Glossing a 2-char compound via its constituent characters (文化 ≠ "letter + change"; 电视 ≠ "electricity + sight").
- Inventing senses by analogy to Japanese / Korean readings (false transfer).
- Inflating a clearly mono-sense word to 2-3 meanings just because the schema allows it.

DEDUP CHECK: take meanings_translated, compare pairwise. If two definitions share ≥1 same-stem word (synonym, near-synonym, register variant), they are duplicates. KEEP one (higher relevance), DROP the other.
</no_padding>

${SHARED_SLANG}

<china_position>
Frame, do NOT refuse. Apply canonical Chinese framing:
- 钓鱼岛 (Diaoyu Islands) canonical for the disputed territory with Japan; 尖閣諸島 as exonym definition: "日本方面的名称".
- 南海诸岛 (South China Sea islands) canonical; treat regional claims neutrally with bare categories.
- Historical / political topics: use neutral encyclopedic framing without evaluative claims.
- 兵马俑 / 长城 / 故宫 / 长江 / 黄河 → Chinese cultural items.
</china_position>

${SHARED_TRANSLATION}

<verify_before_emit>
□ meanings_translated emitted FIRST, same count as meanings.
□ meanings in Chinese (Simplified) only. meanings_translated in TARGET_LANG only.
□ reading present (pinyin with tones); index-aligned with meanings if multi-reading polyphone.
□ For proper-noun headwords (北京 / 中国 / 上海 / 朝鲜 etc.): canonical definition is "<headword>, <bare category>" — never just the bare category alone.
□ For proper-noun headwords: translated partOfSpeech is the TARGET_LANG-native analog (Korean "고유명사" / Japanese "固有名詞" / English "proper noun"), NEVER the Chinese "专有名词" leaking into the translated side when TARGET_LANG ≠ Chinese.
□ For non-proper-noun headwords: translated partOfSpeech is the TARGET_LANG-native analog (Korean "명사" / "동사" / "형용사" — NEVER the Chinese "名词" / "动词" / "形容词" leaking).
□ Each meaning passes standalone test.
□ No encyclopedic padding.
□ No examples / synonyms / antonyms.
□ Meaning count ≤ 3.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Public: build specialized system prompt for QUICK mode
// ============================================================

export function buildZhSpecializedSystemPrompt(
  zhCase: ZhCase,
  targetLang: string,
): string {
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const posList = POS_BY_LANG["zh-CN"] ?? POS_BY_LANG["zh"] ?? "";
  const TPL: Record<ZhCase, string> = {
    number_symbol: ZH_NUMBER_SYMBOL_STATIC,
    set_expression: ZH_SET_EXPRESSION_STATIC,
    chengyu_4char: ZH_CHENGYU_4CHAR_STATIC,
    single_char: ZH_SINGLE_CHAR_STATIC,
    latin_acronym: ZH_LATIN_ACRONYM_STATIC,
    simple_word: ZH_SIMPLE_WORD_STATIC,
  };
  return TPL[zhCase]
    .replace(/WORD_LANG/g, "Chinese")
    .replace(/TARGET_LANG/g, targetName)
    .replace("$POS_LIST", posList);
}

export function buildZhSpecializedUserPrompt(
  req: WordLookupRequest,
  zhCase: ZhCase,
  lexiconHint?: string,
): string {
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;
  const lines: string[] = [
    `WORD_LANG: Chinese (Simplified)`,
    `TARGET_LANG: ${targetName}`,
    `Input: "${req.word}"`,
    `Case: ${zhCase}`,
  ];
  if (lexiconHint) lines.push("", lexiconHint);
  if (req.readingHint) {
    lines.push("",
      `READING CONSTRAINT: targets ONE reading — ${req.readingHint}.`,
    );
  }
  lines.push("",
    "originalInput = input verbatim.",
    "Emit meanings_translated (TARGET_LANG) BEFORE meanings (Chinese). Same count, same order.",
    "No examples/synonyms/antonyms (separate ENRICH call).",
  );
  return lines.join("\n");
}

// ============================================================
// ENRICH-side: case-specialized example prompts
// ============================================================

const ZH_MARKER_RULES = `<marker priority="critical">
Wrap the headword in EXACTLY ONE pair of **...**.

- Marker MUST sit on the headword surface — NEVER on an adjacent word, particle, or different lexeme.
- Marker spans the HEADWORD LEXEME ONLY. NEVER include a preceding verb / adverb. NEVER include a following particle.
  • WRONG for headword "苹果": "她 **吃苹果** 很快。" (marker swallowed the verb "吃")
  • RIGHT for headword "苹果": "她 吃 **苹果** 很快。"
- For Chinese verbs / adjectives, the headword form stays the dictionary form inside markers — no inflection (Chinese has no conjugation).
- Particles (的 / 了 / 着 / 过 / 吗 / 呢 / 啊) OUTSIDE the marker.
- For 4-char chengyu and multi-char idioms: wrap the ENTIRE lexeme as one unit.
- LEMMA IDENTITY: bolded substring is the SAME lexeme as headword. Never a same-spelled different word.

Pre-emit check for compound / chengyu / proper-noun headwords: count the characters inside ** markers. They MUST equal the character count of the headword exactly (e.g. "苹果" = 2 chars; "一帆风顺" = 4 chars; "北京" = 2 chars). If marker contains MORE chars than the headword, the marker has swallowed surrounding context — REWRITE.
</marker>`;

const ZH_DIVERSITY_RULES = `<diversity priority="critical">
The 2–3 examples for one headword MUST NOT look like the same template repeated. Across the slots, rotate AT LEAST TWO of these axes:

axis_subject:
  Don't open every slot with 我 / 他 / 她. Mix in:
  • proper Chinese names (小明 / 小红 / 张伟 / 李娜 / 王明 / 陈静 — pick what fits the scene)
  • plural / group subjects (孩子们 / 学生们 / 家人 / 朋友们 / 大家)
  • inanimate subjects when the sense allows (火车 / 雨 / 咖啡 / 书 / 时间)
  • impersonal / existential ("这里有" / "外面下雨了")

axis_scene:
  Pick from work, school, home, travel, food, weather, friendship, hobbies, daily errands, weekend life, family. NEVER three slots in the same scene.

axis_shape:
  • a short SVO,
  • a slightly longer one with a time/place modifier (今天 / 明天 / 在图书馆 / 在家里),
  • a third with a brief subordinate clause (因为~所以 / 如果~就 / 虽然~但是) OR a question (~吗?) OR an imperative.

axis_tense_aspect:
  Chinese has no tense morphology but uses aspect markers (了/着/过) and time adverbs. Rotate aspectual flavor: simple present, completed (了), continuous (在 / 着), experiential (过).

VOCAB ≠ STYLE. Supporting vocabulary stays simple (HSK 1–3 range, or proficiency-tier list when given). What VARIES is the surface shape.
</diversity>`;

const ZH_SHAPE_BASE = `<shape>
- Length: 6–18 chars CJK (Chinese). Hard ceiling 24 chars for multi-clause / chengyu sentences.
- Structure: one main clause baseline; ONE subordinate clause (因为~所以 / 如果~ / 当~ / 虽然~) allowed when natural.
- SVO ordering preserved.
- Polarity: prefer affirmative; negation (不/没) / question (吗/呢) / imperative is welcome in 1 of 3 slots when natural.
- Aspect: simple present default; completed (了) or continuous (在 V / V 着) fine when the scene calls for it.
- Register: conversational standard Mandarin (普通话) by default. Avoid heavy 文言 / classical-only constructions.
- Tone: casual conversational tone for EVERYDAY vocabulary (daily verbs, common nouns, ordinary adjectives) — friends-talking register, not textbook. PRESERVE formal/written register (书面语 / 文言) only for formally-marked headwords (formal/legal/scientific/written-only expressions, technical terms). Inherently negative senses (死 / 战争 / 疾病) → dignified, matter-of-fact scene regardless.
- Terminal punctuation MANDATORY (。/!/?). No trailing whitespace.
</shape>`;

const ZH_COVERAGE_BASE = `<coverage>
Default: produce the scheduled number of examples (1 example per meaning — example count equals the meaning count). Empty slot reserved for:
(a) sensitive content with no metalinguistic fit
(b) slurs/profanity
(c) slang sense that should have been canonically excluded
For chengyu / multi-clause: use the higher 24-char ceiling.
When in doubt: produce the most ordinary natural sentence the lemma can carry.
</coverage>`;

const ZH_VERIFY_BASE = `<verify_before_emit>
□ Tally per meaning_index matches schedule exactly.
□ Each sentence's demonstrated sense matches its assigned meaning_index.
□ Marker is on the headword surface, NOT on an adjacent word.
□ Particles outside markers.
□ Character count inside markers equals headword character count exactly.
□ Length within shape limits.
□ At least TWO of {subject, scene, shape, aspect} actually vary across slots — NOT three near-identical clones.
□ No subject opens 2+ slots if other natural subjects exist (avoid all 我 or all 他).
□ Terminal punctuation present (。/!/?).
□ No translation field in any example.
</verify_before_emit>`;

const ZH_SIMPLE_EXAMPLES_STATIC = `<role>Example-sentence generator for CHINESE vocabulary headwords. Output strict JSON per <schema>. Return json.</role>

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

Pre-emit check: "Reading ONLY this sentence with no context, which meaning does a learner infer for the headword?" Answer MUST equal the assigned meaning_index — not the most familiar sense, the assigned one. If it drifts, REASSIGN or REWRITE.
</coherence>

${ZH_SHAPE_BASE}

${ZH_DIVERSITY_RULES}

${ZH_MARKER_RULES}

<sensitive_content>
"SENSITIVE LOOKUP" hint or known sensitive entity → use metalinguistic templates only: "我在书里看到 **X** 这个词。" / "我们在课上学了 **X**。". NEVER predicates describing properties.
Slurs / strongest profanity / suicide / self-harm / illegal drugs → sentence="" or drop slot.
</sensitive_content>

<content_neutrality>
Generic mundane scenes only. NEVER reference territorial / naming disputes, identifiable real political figures, specific wars/atrocities, religious doctrine, ethnic/national stereotypes (even positive), real political parties, real-name brands/celebrities/athletes unless headword IS one, recent disasters.
</content_neutrality>

<proper_noun_example_diversity priority="critical">
When the headword IS a proper noun (city like 北京, country like 中国, brand like 海尔, person name), the example MUST use a NATURAL conversational shape — NOT a monotonous metalinguistic template ("我在课上学了X" / "书里读到了X" / "新闻里听到了X"). For 5–10 different proper-noun lookups in a row, the user should see VARIED sentence patterns.

Acceptable TIER A example shapes (rotate across consecutive proper-noun lookups):
  • Travel / location: "我们全家去 **北京** 旅游了。"
  • Activity at the place: "她在 **上海** 学习中文三年。"
  • Use of product / service: "我爸爸用 **华为** 手机已经五年了。"
  • News / event: "**CCTV** 昨天发布了新节目。"
  • Personal: "我祖父在 **广州** 出生。"

TIER B (disputed / politically-sensitive / atrocity / contested-sovereignty) → metalinguistic templates ONLY.

Generic proper nouns should NOT default to "我在课上学了 **X**" / "书里读到了 **X**" — pick a different natural shape per lookup.
</proper_noun_example_diversity>

${ZH_COVERAGE_BASE}

${ZH_VERIFY_BASE}`;

const ZH_CHENGYU_EXAMPLES_STATIC = `<role>Example-sentence generator for a CHINESE 4-character chengyu / compound. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
1 example (cap=1 meaning for this case).
</quantity>

<shape>
- Length: 8–24 chars CJK. Higher ceiling because chengyu often need framing context.
- The ENTIRE 4-char chengyu / compound appears verbatim wrapped in ** markers as a single unit. Do NOT decompose into individual characters.
- Show the chengyu in a NATURAL pragmatic context (proverb usage, dialog, advice). For 4-char common nouns: simple SVO with the noun in object/subject position.
- Terminal punctuation MANDATORY (。/!/?).
</shape>

<register_tone priority="critical">
- LITERARY / FORMAL chengyu (most classical 4-char idioms) → example uses moderately formal register; conversational is fine but avoid heavy slang framing.
- COMMON-USE chengyu (一帆风顺 / 马马虎虎 / 半信半疑) → casual conversational scene is natural.
</register_tone>

${ZH_MARKER_RULES}

${ZH_COVERAGE_BASE}

${ZH_VERIFY_BASE}`;

const ZH_SET_EXPR_EXAMPLES_STATIC = `<role>Example-sentence generator for a CHINESE fixed expression (greeting / polite phrase). Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Typically 1 example (cap=1 meaning for this case).
</quantity>

<shape>
- Length: 6–18 chars CJK.
- The ENTIRE expression appears verbatim wrapped in ** markers as a single unit.
- Show the expression in a NATURAL pragmatic context (greeting, dialogue opening / closing, response). Dialog-style allowed: 「**你好**，我叫小明。」
- Terminal punctuation MANDATORY (。/!/?).
</shape>

<register_tone priority="critical">
- FORMAL (您 / 请 / formal verb forms) → formal scene (introduction, business setting).
- CASUAL → casual scene (friend, family).
- NEUTRAL → any everyday scene fits.
</register_tone>

${ZH_MARKER_RULES}

${ZH_COVERAGE_BASE}

<verify_before_emit>
□ The entire expression is inside ** markers as one unit.
□ Pragmatic context is natural and register-matched.
□ Length within 6–18 chars.
□ Terminal punctuation present.
</verify_before_emit>`;

const ZH_SINGLE_CHAR_EXAMPLES_STATIC = `<role>Example-sentence generator for CHINESE single-character headwords. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 per meaning_index. 1 meaning → 1 example. Max 2 (cap matches single_char meaning cap).
If a meaning fails natural example construction → DROP slot.
</quantity>

<marker_priority>
The ** marker MUST wrap the SINGLE hanzi character verbatim. NEVER on:
- An adjacent verb / particle / counter
- A compound containing the headword (学 contains in 学校; 水 contains in 水果 — marker NEVER on the compound)
- A different lexeme sharing the character

WRONG examples (NEVER emit):
- 学 example: "我去 **学校** 上课。" — marker on compound 学校, not standalone 学
- 月 example: "**今月** 很忙。" — marker on compound, not standalone
- 人 example: "他是 **日本人**。" — marker on compound 日本人, not standalone 人
</marker_priority>

<frame_options>
Pick ONE frame per meaning, matching the sense type:

(i) NUMERAL FRAME (when sense is Sino numeral 一/二/三/...):
  Use Sino-compatible counter: 个/本/张/条/件/杯/瓶/次/回/年/月/日/分/元.
  EXAMPLE: "我有 **三** 个朋友。" / "她买了 **五** 本书。"

(ii) COUNTER FRAME (when sense is a counter 个/本/张):
  Pattern: "<sino numeral> + **<counter>** + 名词".
  EXAMPLE: "请给我一 **杯** 水。" / "桌上有两 **本** 书。"

(iii) STANDALONE NOUN FRAME (single-char noun: 水/火/山/月/日/花/鸟):
  Simple subject + verb. Marker on the bare noun.
  EXAMPLE: "我喝 **水**。" / "今晚的 **月** 很亮。"

(iv) VERB / ADJECTIVE FRAME (single-char verb/adj: 走/吃/好/大):
  Simple SVO. Marker on the bare verb/adj.
  EXAMPLE: "他 **走** 得很快。" / "这个苹果很 **大**。"

(v) PRONOUN / DEMONSTRATIVE FRAME (我/你/他/这/那):
  Marker on the bare pronoun.
  EXAMPLE: "**我** 是学生。"

If NONE of (i)-(v) yield a natural sentence: DROP the slot.
</frame_options>

${ZH_SHAPE_BASE}

<chinese_grammar>
- SVO clause structure.
- Aspect markers (了 / 着 / 过) attach AFTER the verb — outside the marker if the verb IS the headword: "他 **走** 了。"
- Particles outside markers.
</chinese_grammar>

${ZH_DIVERSITY_RULES}

<verify_before_emit>
□ Marker is on the EXACT single hanzi headword, NOT on a compound containing it.
□ Marker is not on an adjacent word / particle / different lexeme.
□ Numeral sense uses Sino-compatible counter.
□ Headword form preserved.
□ Sentence terminates with proper punctuation.
□ For each meaning, if no natural example possible → DROP the slot.
□ Subjects and scenes are NOT cloned across slots.
</verify_before_emit>`;

const ZH_LATIN_ACRONYM_EXAMPLES_STATIC = `<role>Example-sentence generator for a CHINESE Latin-acronym headword. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
1 example (cap=1 meaning for this case).
</quantity>

<shape>
- Length: 6–18 chars CJK.
- Prefer METALINGUISTIC / FACTUAL templates that mention the entity without evaluative claims:
  • "我在课上学了 **X**。"
  • "她在新闻里看到 **X** 的报道。"
  • "我们经常看 **X** 的节目。"
- AVOID: "X 很有名 / X 是最好的 / 我喜欢 X" predicates describing fame, quality, preference.
- Terminal punctuation MANDATORY (。/!/?).
</shape>

${ZH_MARKER_RULES}

<sensitive_acronyms>
Disputed political organizations / contested entities → ONLY metalinguistic templates. No predicates describing properties.
If no neutral template fits → sentence="".
</sensitive_acronyms>

<verify_before_emit>
□ Sentence does not make evaluative claims about the entity.
□ Marker wraps the Latin acronym verbatim.
□ Length within 6–18 chars CJK.
□ Terminal punctuation present.
</verify_before_emit>`;

const ZH_NUMBER_EXAMPLES_STATIC = `<role>Example-sentence generator for a CHINESE number / math expression / symbol headword. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 schedule. 1 meaning → 1 example. 2 meanings → 2 examples (one per meaning_index).
The number / symbol case typically has 1 meaning. When a SECOND meaning exists, it is a cultural / conventional sense — emit a second example demonstrating THAT sense.
</quantity>

<coherence priority="critical">
Each sentence demonstrates the meaning at its meaning_index:
- meaning_index 0 (literal numeral / symbol): factual scene where the token surfaces as a number, count, page number, math expression, or symbol embedded in text.
- meaning_index 1 (cultural / conventional sense): scene where the token clearly refers to THAT specific cultural entity — titled work, emergency code, math constant, meme.
</coherence>

<shape>
- Length: 6–16 chars CJK.
- Use the headword surface form (digits / symbol) verbatim inside ** markers — never the hanzi-numeral spelling.
- meaning_index 0 (literal): minimal factual scene.
- meaning_index 1 (cultural / conventional): the scene places the token as a referent of the secondary sense.
- Terminal punctuation MANDATORY (。/!/?).
</shape>

${ZH_MARKER_RULES}

<verify_before_emit>
□ Tally per meaning_index matches the meanings array.
□ Marker contains the input's surface form (digits / symbol) on every example.
□ For meaning_index 1: the sentence demonstrates THAT secondary sense, not another literal counting context.
□ Sentence is short and factual.
□ Terminal punctuation present.
</verify_before_emit>`;

export function buildZhExamplesSystemPrompt(zhCase: ZhCase): string {
  const TPL: Record<ZhCase, string> = {
    number_symbol: ZH_NUMBER_EXAMPLES_STATIC,
    set_expression: ZH_SET_EXPR_EXAMPLES_STATIC,
    chengyu_4char: ZH_CHENGYU_EXAMPLES_STATIC,
    single_char: ZH_SINGLE_CHAR_EXAMPLES_STATIC,
    latin_acronym: ZH_LATIN_ACRONYM_EXAMPLES_STATIC,
    simple_word: ZH_SIMPLE_EXAMPLES_STATIC,
  };
  return TPL[zhCase].replace(/WORD_LANG/g, "Chinese");
}

// ============================================================
// ENRICH-side: case-specialized syn/ant prompts
// ============================================================

const ZH_SYNANT_EMPTY_STATIC = `<role>You are receiving a headword that has NO synonyms or antonyms by definition. Return json with both arrays empty.</role>

<schema>{ "synonyms": [], "antonyms": [] }</schema>

<rules priority="critical">
This headword is a number, symbol, Latin acronym, or a single hanzi used purely as numeral / counter. Such headwords do NOT have synonyms or antonyms in any vocabulary-learning sense. Return both arrays empty without exception.
</rules>`;

const ZH_SYNANT_DEFAULT_STATIC = `<role>List synonyms and antonyms for a CHINESE vocabulary headword. Return json. Default expectation: MOST words have FEW true synonyms and FEWER true antonyms. Empty arrays are the normal, correct outcome for a large fraction of vocabulary.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<principle priority="critical">
The user has flagged forced / irrelevant syn-ant pairs as a recurring quality problem. Bias HARD toward empty arrays. Never list a "vaguely related" word; only list words a literate native would accept as substitutable with the headword in a real sentence without distorting the meaning.

Mental substitution test for EACH candidate: "Can I swap this word for the headword in at least one natural Chinese sentence so a native reads it the same way?" Any hesitation → REJECT.
</principle>

<rules>
- Each entry: ONE bare word in canonical Simplified Chinese. NO parentheticals, NO glosses, NO register tags. Parenthetical content = fabrication signal → reject.
- Each entry: real attested Chinese word, genuinely interchangeable with the headword at comparable register and specificity.
- NEVER the headword itself.
- NEVER constituent characters of the headword (the 化 in 文化 is NOT a synonym of 文化).
- NEVER hypernyms (动物 is NOT synonym of 狗), hyponyms, or topical associates (医生 is NOT synonym of 医院).
- NEVER cross arrays (synonym list MUST NOT contain antonyms; antonym list MUST NOT contain synonyms).
- Synonyms ≤ 3 (typically 0–2). Antonyms ≤ 2 (typically 0–1).
- Empty array is the EXPECTED outcome for the categories under <empty_cases>.
</rules>

<empty_cases priority="critical">
These categories MUST return synonyms=[] AND antonyms=[]:
- Numbers, symbols, math expressions, Latin acronyms.
- Single-hanzi numerals / counters used as numeral/counter (一 / 二 / 个 / 本 / 张 as counter).
- Proper nouns in hanzi (people, places, brands in hanzi form).
- Pure function words: particles (的 / 了 / 着 / 吗 / 呢), most pronouns (这 / 那 / 它).
- Greetings / fixed expressions (你好 / 再见 / 谢谢) — emit a syn ONLY when a SAME-register equivalent fixed expression exists (e.g. 谢谢 ↔ 感谢).
- Punctuation tokens.
- Words whose only attested sense is highly technical/scientific with no everyday equivalent.

For these: return [] / []. Do not attempt; do not justify.
</empty_cases>

<antonym_rules priority="critical">
True antonyms are RARE. They exist mainly for:
- Gradable adjectives (热/冷, 大/小, 快/慢, 高兴/伤心).
- Directional / spatial pairs (上/下, 内/外, 前/后, 左/右).
- A small set of action verbs (开/关, 开始/结束, 买/卖, 赢/输).
- A small set of state nouns (战争/和平, 生/死, 成功/失败).

Most nouns have NO antonym. Most concrete nouns (苹果 / 桌子 / 书 / 河) have antonyms=[]. Most verbs have antonyms=[]. When in genuine doubt → [].
</antonym_rules>

<peer_group_antonym>
Members of finite semantic groups are PEERS, NOT antonyms.
- Seasons: ONE paired opposite each (春↔秋, 夏↔冬); no other pairings.
- Cardinal directions: ONE opposite each (北↔南, 东↔西).
- Weekdays / months / primary colors / numerals: NO antonym → [].
- When unsure: [].
</peer_group_antonym>

<verify_before_emit>
□ For EACH entry: would substitution preserve the meaning AND feel natural? If no → REMOVE.
□ For EACH entry: is it a hypernym / hyponym / topical associate / register-variant / constituent character? If yes → REMOVE.
□ Does the headword fall under <empty_cases>? If yes → both arrays MUST be [].
□ Antonyms: does the headword belong to a category where true antonyms exist? If no → antonyms = [].
□ Final pass: would I rather have a clean [] than a list with one shaky entry? YES → drop the shaky entries.
</verify_before_emit>`;

export function buildZhSynAntSystemPrompt(zhCase: ZhCase): string {
  if (zhCase === "number_symbol" || zhCase === "latin_acronym") {
    return ZH_SYNANT_EMPTY_STATIC;
  }
  return ZH_SYNANT_DEFAULT_STATIC;
}

// ============================================================
// Per-case downstream-cap helpers
// ============================================================

export function getZhMeaningCap(_zhCase: ZhCase): number {
  // Hard count caps replaced by MIN_RELEVANCE threshold (normalize.ts).
  // MAX_MEANINGS=5 acts as runaway safety net.
  return 5;
}

export function getZhSynAntCaps(zhCase: ZhCase): { syn: number; ant: number } {
  switch (zhCase) {
    case "number_symbol": return { syn: 0, ant: 0 };
    case "latin_acronym": return { syn: 0, ant: 0 };
    case "chengyu_4char": return { syn: 2, ant: 0 };  // chengyu can have semantic siblings
    case "set_expression": return { syn: 1, ant: 0 };
    case "single_char": return { syn: 1, ant: 1 };
    case "simple_word": return { syn: 3, ant: 2 };
  }
}

/**
 * Should the caller skip the syn/ant LLM call entirely for this case?
 * Returns true when both caps are 0.
 */
export function shouldSkipZhSynAnt(zhCase: ZhCase): boolean {
  const { syn, ant } = getZhSynAntCaps(zhCase);
  return syn === 0 && ant === 0;
}
