// prompts-v3-ja.ts
// -----------------------------------------------------------
// JA-specific branched prompts for word-lookup-v2.
// Pattern mirrors prompts-v3-en.ts / prompts-v3-ko.ts: classify (regex)
// → case-specific specialized prompt. Each case carries its own cap
// discipline and example-style range, so the single generic
// COMBINED_QUICK no longer averages every Japanese lookup into the
// same shape.
//
// Cases (6 — JA has the most script complexity of any source we handle):
//   number_symbol   — pure digits / math / symbol / Latin acronym
//   set_expression  — whitespace OR known greeting/honorific prefix
//                     (most JA fixed expressions are single-token
//                     written, no internal whitespace)
//   verb_adj        — kanji + okurigana ending in う-column or い,
//                     plus pure-hira common verbs (する/くる/ある/いる)
//   katakana_only   — pure katakana input (≈95% loanword 外来語)
//   single_kanji    — single CJK character (reading-disambiguation +
//                     counter / numeral / noun distinction)
//   simple_word     — kanji compound, mixed, edge cases (~50% of
//                     lookups)
//
// Each STATIC prompt addresses three user-flagged regressions:
//   (Q1) case-aware branching for JA source
//   (Q2) example diversity (subject/scene/shape/tense/mood rotation)
//   (Q3) cap discipline (meanings/syn/ant tuned per case)
// -----------------------------------------------------------

import type { WordLookupRequest } from "./types.ts";
import { LANG_NAMES, POS_BY_LANG } from "./prompts-v3.ts";

export type JaCase =
  | "number_symbol"
  | "set_expression"
  | "verb_adj"
  | "katakana_only"
  | "single_kanji"
  | "simple_word";

// ============================================================
// Classifier regex set
// ============================================================
// Pure symbol / punctuation (no letters, no digits, no whitespace).
const SYMBOL_RE = /^[^\p{L}\p{N}\s]+$/u;
// Pure digits / math / fractional expression.
const NUMBER_RE = /^[\d\s+\-*/^!=<>().%,.]+$/;
// All-uppercase Latin acronym 2–9 chars (NHK / JR / NHK / JAL / ANA).
const LATIN_ACRONYM_RE = /^[A-Z][A-Z0-9-]{1,9}$/;
// Internal whitespace → set_expression candidate.
const PHRASE_RE = /\s/;
// Single CJK ideograph (basic + extension A).
const SINGLE_KANJI_RE = /^[一-鿿㐀-䶿]$/u;
// Pure katakana run (including the prolonged-sound mark ー).
const KATAKANA_ONLY_RE = /^[ァ-ヺーー・]+$/u;
// Verb / adjective shape: starts with at least one kanji, optionally
// more kanji, then ends in a hiragana that is u-column (verb) or い
// (i-adjective). Captures 食べる / 飲む / 行く / 来る / 高い / 美しい.
// Allows the okurigana run to be multi-char (起きる / 食べる / 美しい /
// 楽しい) by permitting any hiragana before the final terminal.
const KANJI_VERB_ADJ_RE = /^[一-鿿㐀-䶿]+[ぁ-ゖ]*[うくぐすずつづぬふぶむるい]$/u;
// Pure-hiragana common verbs that have no canonical kanji form, OR
// whose dictionary entry is conventionally hiragana. Whitelist —
// extending this list is the only way to add coverage; the model is
// not allowed to invent kana-only verbs from a final う-column kana
// because too many noun lookups (e.g. ありがとう) would collide.
const PURE_HIRA_VERBS = new Set<string>([
  "する", "くる", "ある", "いる", "やる", "できる",
  "いう", "もらう", "あげる", "なる", "おく",
  "くれる", "みせる",
]);
// Katakana-stem loanword verbs (外来語+る pattern): サボる ("skip class"),
// コピる ("photocopy"), ググる ("google"), ハモる ("harmonize"). These end
// in a う-column hiragana kana (almost always る) after a katakana stem.
// They are 動詞 (verb) by usage even though the stem is loanword-katakana.
const KATAKANA_VERB_RE = /^[ァ-ヺーー・]+[うくぐすずつづぬふぶむる]$/u;
// Greeting / honorific / fixed-expression prefixes (single-token,
// whitespace-free). Checked BEFORE verb_adj so 「ありがとうございます」
// doesn't get verb-classified by the trailing す. Mirrors KO's
// FORMAL_EXPRESSION_PREFIXES design.
const FORMAL_EXPRESSION_PREFIXES = [
  "よろしく", "おねがい", "お願い",
  "ありがと",
  "すみません", "すいません",
  "ごめん",
  "いただきま", "いただき",
  "ごちそう",
  "おつかれ", "お疲れ",
  "ごくろう", "ご苦労",
  "こんにち", "こんばん",
  "おはよう",
  "おやすみ",
  "はじめまして",
  "おせわ", "お世話",
  "しつれい", "失礼",
  "おさき", "お先",
  "もうしわけ", "申し訳",
  "おかげ", "お陰",
  "おまた", "お待た",
  "いってきま", "行ってきま",
  "いってらっ", "行ってらっ",
  "ただいま",
  "おかえり",
  "かしこまり",
  "なんとも",
];

/**
 * Classify a Japanese input into one of the case buckets. Regex-based,
 * <1ms. Ambiguous cases fall back to `simple_word`. Ordering matters:
 * formal-expression prefix check precedes verb_adj because greetings
 * like ありがとうございます end in す (verb-shape) but are expressions.
 */
export function classifyJaInput(word: string): JaCase {
  const w = (word ?? "").trim();
  if (!w) return "simple_word";
  if (SYMBOL_RE.test(w)) return "number_symbol";
  if (NUMBER_RE.test(w)) return "number_symbol";
  if (LATIN_ACRONYM_RE.test(w)) return "number_symbol";
  if (PHRASE_RE.test(w)) return "set_expression";
  for (const pfx of FORMAL_EXPRESSION_PREFIXES) {
    if (w.startsWith(pfx)) return "set_expression";
  }
  if (PURE_HIRA_VERBS.has(w)) return "verb_adj";
  if (SINGLE_KANJI_RE.test(w)) return "single_kanji";
  // Katakana-stem verbs (サボる / コピる / ググる) MUST be checked BEFORE
  // KATAKANA_ONLY_RE because a pure-katakana verb would otherwise be
  // misrouted to katakana_only (loanword noun case).
  if (KATAKANA_VERB_RE.test(w)) return "verb_adj";
  if (KATAKANA_ONLY_RE.test(w)) return "katakana_only";
  if (KANJI_VERB_ADJ_RE.test(w)) return "verb_adj";
  return "simple_word";
}

// ============================================================
// Shared schema fragment used across all JA cases
// JA keeps `reading` REQUIRED for any non-kana headword (kanji needs
// furigana), and OMITS `ipa` (kana IS the pronunciation layer).
// ============================================================

const SHARED_SCHEMA = `Output a strict JSON object matching this schema (do not wrap in markdown fences):

<schema>
{
  "headword": string,                       // corrected Japanese lemma (typo fix; canonical form; preferred script)
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

<reading_rule>
EMIT reading[] when the headword contains at least one kanji character.
- One reading string per sense (parallel to meanings array order). When the headword has the SAME reading across all senses, emit a single-element array; when senses use DIFFERENT readings (true 同形異音語 like 行=い・く vs ぎょう vs こう), emit one reading per sense in the same order.
- Use hiragana (modern standard furigana). Katakana only when the headword itself is katakana (then reading echoes the headword surface).
- For pure-katakana / pure-hiragana / Latin-acronym / symbol headwords, OMIT reading.
- Long-vowel marks (ー) preserved on katakana; hiragana long vowels expanded normally (おとうさん, not おとーさん).
- Compound-verb okurigana included in the reading (食べる → たべる, 美しい → うつくしい).
</reading_rule>

<forbidden>
- "ipa" key (Japanese uses kana = phonemic for native words; loanwords use katakana reading).
- "gender" key (Japanese nouns have no grammatical gender).
- "examples", "synonyms", "antonyms" (separate ENRICH call).
- Padding meanings to reach 2–3 when one clean sense suffices.
- Encyclopedic definitions ("有名な", "伝統的な", "X の一種", "X の行為", "X するための Y").
- Romaji in any field (use kana for reading; kanji for headword when natural).
- ANY non-Japanese characters inside meanings[].definition or meanings[].partOfSpeech (canonical side stays 100% Japanese — no English glosses, no Korean glosses, no Latin script except numerals embedded in the headword surface itself).
- ANY Japanese characters inside meanings_translated[].definition or meanings_translated[].partOfSpeech (TARGET_LANG side stays 100% TARGET_LANG — see <translation_purity_strict>).
- Putting the reading / furigana INSIDE meanings[].definition (the reading belongs in the top-level reading[] field; never duplicate it inside a definition text).
- POS name (名詞 / 動詞 / 形容詞 / 副詞 / 表現 / 数詞 / 記号 / 固有名詞 / 感嘆詞 etc.) leaking INTO meanings[].definition or meanings_translated[].definition. The POS belongs in partOfSpeech field ONLY. WRONG: "(動詞) 掛ける、動詞"; RIGHT: "(動詞) 掛ける". NEVER emit definitions like "掛ける、動詞" / "to eat, verb" where the trailing token is the POS name.
</forbidden>

<headword_surface_invariant priority="critical">
The "headword" field MUST be a real Japanese-form rendering of the input lemma. For NON-numeric, NON-symbol inputs: the headword is the canonical Japanese lemma (kanji+okurigana / kana / katakana as appropriate). For NUMERIC inputs (digits like "42" / "1984" / "3.14") and SYMBOL inputs ("@" / "#"): the headword MUST PRESERVE the input's surface form VERBATIM — DO NOT replace digits with their kanji-numeral spelling, DO NOT replace a symbol with its name. Example sentences and markers also use the input's surface form. The literal reading goes in meanings[].definition, never in the headword. originalInput always echoes the input verbatim regardless.
</headword_surface_invariant>

<definition_format>
- Length: ≤12 chars CJK (canonical Japanese) / ≤6 words (TARGET_LANG when Latin script).
- Shape: single word OR comma-separated 2–3 NEAR-SYNONYMS at SAME specificity (e.g. "happy, joyful" — same sense, alternate wording). NEVER use commas to fuse distinct senses (e.g. "see, watch, look after" is WRONG — those are separate senses each getting their own meanings[] entry). Never specific + hypernym.
- Every term in the definition is a real existing word in its language.
- relevanceScore: emit a TRUE frequency estimate per sense, NOT a default 80. Anchor primary everyday sense at 90–100. Subsequent senses must reflect actual relative rarity:
  • Dominant single sense (one meaning ≈ 95%+ of usage): primary=100, secondary senses below 60 → DO NOT emit.
  • Strongly skewed (one sense ≈ 80%, others present but rarer): primary=95, secondary 60–75 if attested everyday.
  • Balanced homonyms (multiple senses with roughly equal everyday frequency): each sense 75–95, spread ≤ 15.
  • Senses below 60 (archaic / literary / collocation-only / rare) → DO NOT emit.
  Downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Set honestly — review weighting uses these. Don't collapse all to identical scores; emit ALL senses that pass the bar.
- Reading / furigana goes EXCLUSIVELY in the top-level reading[] field. NEVER repeat the reading inside meanings[].definition (e.g. WRONG: "(名詞) 水, みず" — RIGHT: definition="水", reading=["みず"]).
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

- meanings_translated[].definition — 100% TARGET_LANG script only. No Japanese kanji / kana, no English glosses, no parentheticals (the ONLY exception is the optional register-tag form like "(격식)" / "(속어)" for set_expression case).
- meanings_translated[].partOfSpeech — MUST be a TARGET_LANG word taken from the TARGET_LANG list under <pos_allowed>. NEVER emit English POS labels ("verb" / "noun" / "adjective" / "expression") in this field. NEVER emit Japanese POS labels ("動詞" / "名詞" / "形容詞" / "表現" / "記号") in this field. The TARGET_LANG-native term is mandatory — if TARGET_LANG is Korean, partOfSpeech is one of: 명사 / 동사 / 형용사 / 부사 / 전치사 / 접속사 / 감탄사 / 대명사 / 고유명사 / 표현 / 수사 / 기호. If TARGET_LANG is Chinese, English, Spanish, French, German, Italian — use that language's POS list under <pos_allowed>.
- The translated partOfSpeech MUST be derivable from the canonical partOfSpeech via standard alignment (動詞 ↔ verb ↔ 동사 ↔ verbo etc.). NEVER invent a POS not present in the TARGET_LANG <pos_allowed> list. If no TARGET_LANG analog exists for an obscure JA POS, use the closest from the allowed list (default to 名詞 / 表現 analogs in TARGET_LANG); NEVER coin a new POS term.

Pre-emit checks:
□ meanings_translated[i].definition contains zero Japanese characters.
□ meanings_translated[i].partOfSpeech is from the TARGET_LANG <pos_allowed> list exactly (the Korean / Chinese / English / Latin native term — never "verb"/"動詞" leaking into non-EN / non-JA target).
□ meanings[i].definition / meanings[i].partOfSpeech contain zero non-Japanese characters (the canonical side is the inverse purity rule).
</translation_purity_strict>`;

const SHARED_TRANSLATION = `<translation_rules>
- meanings_translated entries in TARGET_LANG. Concise dictionary equivalent (single word or 2–3 comma-separated near-synonyms).
- Same count and order as meanings.
- False-friend awareness: translate the SENSE from the canonical definition, never the surface kanji.
- Register: daily-life concepts (kinship/body/food/weather/common actions) → colloquial spoken form in TARGET_LANG, not Sino-formal.
- Loanword origin DOES NOT determine translation: コーヒー → "coffee" only if the Japanese sense matches the English sense (it does). False-friend loanwords: マンション → "apartment building" (NOT "mansion"), クレーム → "complaint" (NOT "claim"), バイク → "motorcycle" (NOT "bike=bicycle"), ペーパードライバー → "driver who rarely drives" (NOT literal).
- LOANWORD PRIORITY: when TARGET_LANG has a well-established native form (often a loanword adapted from the source language or from English) for the headword, USE THAT FORM, NOT a descriptive paraphrase. The translated definition should be what a TARGET_LANG native learner instantly recognizes.
  • コーヒー → ko "커피"; zh "咖啡"; en "coffee"
  • コンピューター → ko "컴퓨터"; zh "电脑/计算机"
  • スマートフォン → ko "스마트폰" (NOT "휴대용 전화기")
  • アイスクリーム → ko "아이스크림" (NOT "얼린 달콤한 디저트")
  • ホテル / バス / ラジオ → ko "호텔" / "버스" / "라디오"
  Descriptive paraphrase is ONLY for concepts that lack a native single-word equivalent. For common everyday loanwords, NEVER descriptive — use the established native form.
</translation_rules>

${SHARED_TRANSLATION_PURITY}`;

// ============================================================
// Case 1: NUMBER_SYMBOL — digits / math expressions / lone symbols
// + Latin acronyms (NHK / JR / JAL)
// ============================================================

const JA_NUMBER_SYMBOL_STATIC = `<role>Japanese vocabulary expert. Input is a number, math expression, symbol/punctuation, or Latin-script acronym. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<pos_classification priority="critical">
- A number / math expression / formula → partOfSpeech="数詞" (canonical Japanese). NEVER "表現", NEVER "名詞".
- A symbol / punctuation mark → partOfSpeech="記号" (canonical). NEVER "表現".
- A Latin acronym (NHK / JR / NASA) → partOfSpeech="固有名詞".
- Secondary cultural / conventional sense (e.g. 「911」 as emergency code) takes the appropriate content POS (名詞 / 固有名詞), but the primary literal-reading meaning stays "数詞".
</pos_classification>

<rules>
- Number: meaning[0] = literal Japanese reading using SINO numerals (一・二・三・四・五・六・七・八・九・十・百・千・万・億) joined naturally (四十二 / 千九百八十四 / 百). NEVER native numerals (ひとつ・ふたつ・etc.) — those are a different lexeme family. Single literal-reading meaning per number.
- Year-shaped 4-digit number (1900–2099): the literal reading uses the conventional sequential form ("せんきゅうひゃくはちじゅうよん" — written as 千九百八十四), NOT a digit-by-digit reading.
- Math expression / formula: literal reading, NEVER compute. ("2+3" → "に たす さん" / "二たす三", not "五".)
- Fraction a/b: denominator-first ("3/4" → "四分の三", "1/2" → "二分の一").
- Decimal a.b: digits AFTER the decimal point are read INDIVIDUALLY. "3.14" → "さん てん いちよん" / "三点一四". Korean target → "삼 점 일사"; Chinese target → "三点一四"; English target → "three point one four"; Latin targets → individual digit words. NEVER read post-point digits as a multi-digit number.
- Symbol/punctuation: meaning[0] = the symbol's Japanese name (例: "@" → "アットマーク"; "#" → "ハッシュ、シャープ"; "*" → "アスタリスク"). Never empty for known symbols.
- Latin acronym: meaning[0].definition = "<Japanese expansion>、<bare category>" — both in Japanese. Examples: NHK → "日本放送協会、放送局"; JR → "ジェイアール、鉄道会社"; JAL → "日本航空、航空会社". Cap 1 meaning. partOfSpeech="固有名詞".
- Cultural / conventional sense for a SPECIFIC token: when the EXACT token doubles as a culturally established referent (a well-known novel/film/album title carrying that number as its name, an emergency-services code 「110番」「119番」, a historically significant year-name, a math constant), emit it as meaning[1] with content POS:
  • meaning[1].partOfSpeech = "名詞" for concept-shaped senses (math constant, code), "固有名詞" for titled works (novel/film/album).
  • meaning[1].definition uses the BARE category in canonical Japanese: "小説" / "映画" / "アルバム" / "番号" / "定数" — NOT the author/creator name, NOT title attribution ("ジョージ・オーウェルの小説" → just "小説"). Same forbidden-qualifier discipline as proper_noun handling.
  • meaning[1] is fundamentally DIFFERENT in POS and category from meaning[0].
  • Cap 2 meanings total.
  • Inclusion test: would a literate Japanese adult, hearing the bare token by itself with no context, quickly think of a famous titled work / code / constant beyond the bare number? If yes → include. Bias toward inclusion when in genuine doubt.
</rules>

<sino_korean_numerals priority="critical">
When TARGET_LANG is Korean (ko), every number translation MUST use the Sino-Korean numeral system (한자어 수사: 일/이/삼/사/오/육/칠/팔/구/십/백/천/만/억 and compounds 사십이/백오/천구백팔십사). NEVER native Korean numerals (하나/둘/셋/마흔둘/스물 etc.).
</sino_korean_numerals>

<verify_before_emit>
□ headword EQUALS originalInput surface verbatim — for numeric input the headword is the digits ("42" / "1984" / "3.14"), NOT the kanji-numeral spelling ("四十二" / "千九百八十四"). For symbol input the headword is the symbol ("@" / "#"), NOT its name. The literal reading lives in meanings[].definition only.
□ Examples / markers also use the input's digits / symbol surface — never the kanji-numeral spelling inside ** markers for a numeric input.
□ Literal reading uses Sino-Japanese numerals (一・二・三・... / 百 / 千) joined naturally, not native (ひとつ・ふたつ).
□ Number / math token → partOfSpeech="数詞" on the literal-reading meaning.
□ Symbol / punctuation → partOfSpeech="記号".
□ Latin acronym → partOfSpeech="固有名詞", definition "<expansion>、<category>" in Japanese.
□ Decimal: post-point digits read individually as a compound digit string in CJK targets ("3.14" → ja "三点一四", ko "삼 점 일사", zh "三点一四"); never as a multi-digit number.
□ Korean number translations use SINO numerals only.
□ No parallel-reading duplicate meanings.
□ If a cultural / conventional sense exists for the SPECIFIC token, meaning[1] uses content POS (名詞 / 固有名詞) — never another "数詞" entry.
□ reading OMITTED (numbers/symbols/Latin acronyms have no kanji).
□ Meaning count ≤ 2.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 2: SET_EXPRESSION — multi-token phrase OR single-token greeting
// / honorific fixed expression (most JA expressions are written as
// one token without internal whitespace)
// ============================================================

const JA_SET_EXPRESSION_STATIC = `<role>Japanese vocabulary expert. Input is a recognized fixed expression (greeting, honorific phrase, idiom, set phrase). Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<scope_decision priority="critical">
1. SPECIFIC recognized fixed expression a native speaker would identify by name → emit as expression with its pragmatic meaning. Includes formality variants. Categories:
   • 挨拶 (greeting): こんにちは / おはようございます / こんばんは / おやすみなさい / さようなら / じゃあね / お疲れ様です / ご苦労様 / 行ってきます / 行ってらっしゃい / ただいま / おかえりなさい
   • 感謝 (gratitude): ありがとうございます / ありがとう / どうもありがとう / 助かります / 恐れ入ります
   • 謝罪 (apology): すみません / ごめんなさい / 申し訳ありません / 失礼しました / 失礼します
   • 依頼 (request): よろしくお願いします / お願いします / お世話になります / よろしく
   • 食事 (mealtime): いただきます / ごちそうさまでした / ごちそうさま
   • 応答 (response): どういたしまして / かしこまりました / 承知しました / もちろんです / 大丈夫です
   • 紹介 (introduction): はじめまして / よろしくお願いいたします / お世話になっております
   • 感嘆 (interjection / set short phrase): もちろん / なるほど / そうですね / お疲れさま
   These ARE valid fixed-expression headwords. Recognize them. Do NOT classify formality variants as "sentence" — they are dictionary-attested set phrases.
2. Composed clause that ISN'T a specific known idiom/expression → note="sentence", meanings=[].
3. Conventionality is the test, not grammar. A native quoting a known proverb → expression. A composed-for-the-moment clause → sentence.
4. Misspelled fixed expression: treat as known only if a native would recognize with HIGH probability. Single clearly-wrong content word → "sentence".
5. When unsure → "sentence" (anti-fabrication).
</scope_decision>

<pragmatic_meaning priority="critical">
- The meaning is the PRAGMATIC FUNCTION the phrase as a whole carries — never the literal sum of parts.
  • よろしくお願いします → "丁寧な依頼の挨拶" (NOT a parse of よろしく + お願い + します).
  • いただきます → "食事の前の挨拶" (NOT "I will receive").
  • お疲れ様です → "労いの挨拶" (NOT "you are tired").
  • どういたしまして → "感謝への返答" / "You're welcome".
- partOfSpeech reflects the phrase's role: most fixed expressions → "表現". Sentential idioms / proverbs → "表現". Multi-word noun compounds → "名詞".
- DEFAULT cap: 1 meaning. Use 2 ONLY when the expression has GENUINELY distinct pragmatic uses (rare).
</pragmatic_meaning>

<no_padding priority="critical">
A fixed expression usually has ONE canonical pragmatic function. Resist generating "another sense" just because the slot exists. If the secondary sense is rare / archaic / context-bound → DROP.
</no_padding>

<register_matching priority="critical">
JA fixed expressions carry strong register signals (丁寧体 vs 敬語 vs ぞんざい). The TARGET_LANG translation MUST preserve that register, not collapse to a plain dictionary form.

PREFERRED form for register-distinctive source idioms — the **plain TARGET_LANG equivalent + parenthetical register tag** at the end:
- "<plain TARGET_LANG word>(<register tag>)" — single most-common plain equivalent followed by a brief register label in parentheses.
- The register tag MUST be in TARGET_LANG — NEVER copy a Korean register tag into a non-Korean TARGET_LANG output.
- Korean target → "(속어)" / "(완곡)" / "(비속어)" / "(격식)" / "(고어)".
- English target → "(informal)" / "(slang)" / "(formal)" / "(euphemistic)" / "(archaic)".
- Spanish target → "(informal)" / "(formal)" / "(coloquial)" / "(culto)".
- French target → "(familier)" / "(formel)" / "(soutenu)" / "(populaire)".
- German target → "(umgangssprachlich)" / "(formell)" / "(gehoben)" / "(salopp)".
- Italian target → "(informale)" / "(formale)" / "(colloquiale)" / "(letterario)".
- Chinese target → "(口语)" / "(书面)" / "(俗语)" / "(敬语)".
- NEVER use "(격식)" / "(존댓말)" / etc. when TARGET_LANG ≠ Korean.

ONLY use a register-matching TARGET_LANG idiom INSTEAD of the plain+tag form when ALL hold:
- The TARGET_LANG idiom is widely recognized at learner level.
- It carries the SAME register and roughly the same figurative imagery as the source.
- The plain word + tag would feel awkward / incomplete in TARGET_LANG.

If neither path applies cleanly, the meaning is better dropped than misrepresented.

Register categories to detect:
- 敬語 / 丁寧体 / 格式 (honorific / polite / ceremonial) → "(격식)" or analog. NEVER drop the formality marker.
- ぞんざい / くだけた (casual / blunt) → "(반말)" / informal tag.
- NEUTRAL fixed expression → plain TARGET_LANG equivalent with NO tag.

The register IS part of the meaning. A learner who memorizes the plain translation for a 敬語 greeting (with no register signal) will misuse the source phrase.
</register_matching>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Headword preserves the phrase verbatim (no truncation, no normalization to constituent words).
□ Meaning expresses the WHOLE-PHRASE pragmatic function, not a literal parse.
□ partOfSpeech is "表現" for sentential / greeting expressions; "名詞" only for fixed noun compounds.
□ reading present when the expression contains kanji (お願い → "おねがい", お疲れ様 → "おつかれさま"); OMITTED for pure-kana expressions.
□ Meaning count = 1 by default; 2 only for genuinely polysemous expressions.
□ Register check: if source is 敬語/丁寧体/casual-distinctive, does the TARGET_LANG translation carry the same register? If it reads as plain dictionary form → REWRITE with register-matching equivalent.
□ No slang/vulgar sense leaked through.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 3: VERB_ADJ — Japanese verb or i-adjective in dictionary form
// (kanji + okurigana ending in う-column or い; or whitelist pure-hira
// verb する/くる/ある/いる/etc.)
// ============================================================

const JA_VERB_ADJ_STATIC = `<role>Japanese vocabulary expert. Input is a Japanese verb or i-adjective in dictionary form. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<sense_extraction>
- Emit ALL standalone senses that pass the everyday-frequency bar — a sense an ordinary speaker encounters as the main predicate of a natural sentence, with relevanceScore ≥ 60.
- Set relevanceScore honestly: 90–100 primary, 70–89 clearly common secondary, 60–69 attested everyday, below 60 (literary / archaic / collocation-only / auxiliary-slot) → DO NOT emit.
- Each sense MUST be encountered by ordinary speakers in natural usage AS A STANDALONE VERB/ADJECTIVE — not as an auxiliary, not as a fixed-collocation slot.
- Polysemous verbs commonly carry 2–4 everyday standalone senses — emit them ALL when each passes the bar.
- The downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Emit honestly — pad-up and drop-down are both wrong.
</sense_extraction>

<note_consistency priority="critical">
The "note" field and the meanings array are mutually exclusive. If you set note="sentence" / "non_word" / "wrong_language", meanings MUST be []. If meanings is non-empty (1+ entries), note MUST be omitted. NEVER emit both note="sentence" AND non-empty meanings — that is a contradiction.
</note_consistency>

<part_of_speech priority="critical">
- partOfSpeech in canonical Japanese: "動詞" (verb) or "形容詞" (i-adjective).
- DICTIONARY-FORM ENDING is the primary cue:
  • ends in う-column kana (う/く/ぐ/す/つ/ぬ/ぶ/む/る) → "動詞" (verb).
  • ends in い with preceding kanji/kana (高い / 美しい / 楽しい / 安い / 寒い / 暑い) → "形容詞" (i-adjective).
- partOfSpeech in TARGET_LANG: "verb" / "adjective" / equivalent.

CRITICAL — する compound verb ambiguity. 「Xする」 is verb (動詞). The NAKED noun X is a different lexeme (e.g. 勉強 = noun "study"; 勉強する = verb "to study"). The headword 勉強する is a verb. The bare 勉強 falls under simple_word as a noun. Do NOT include the noun sense here.

CRITICAL — i-adjective standalone test:
- 高い / 安い / 寒い / 暑い / 楽しい / 嬉しい / 悲しい / 怖い / 痛い / 眠い / 忙しい — pure i-adjective, "形容詞".
- いっぱい / きれい / きらい — these END in い but are NA-ADJECTIVES (or nouns). DO NOT classify as i-adjective. They fall under simple_word.
  • きれい → na-adjective "綺麗" or noun usage; not 形容詞 in conjugation.
  • いっぱい → adverb / noun usage; not 形容詞.
  • きらい → na-adjective "嫌い"; not 形容詞 in conjugation.
- Decision rule for い-final input: if the い is PRECEDED by another い/え-row kana that forms part of the stem (not okurigana), it's likely na-adjective or noun — fall through to simple_word. If preceded by kanji or a clear stem syllable, it's i-adjective.

ない as i-adjective: ない is the negative i-adjective form; 無い (rare standalone) is the kanji. Standalone "ない" lookup → 形容詞 "non-existent".
</part_of_speech>

<verb_dedup priority="critical">
Verb senses with overlapping translations are duplicates — combine or drop:
- 止まる = "to stop, cease" + "to end, halt" → combine into 1 meaning "止まる、停止する"
- 始まる = "to start" + "to begin" → 1 meaning
- 戻る = "to return" + "to go back" → 1 meaning
- 入る = "to enter" + "to go in" → 1 meaning

DEDUP CHECK: for verb headwords, if two definitions describe the SAME action (just synonyms), they are duplicates. Combine into one comma-separated entry. Use 2 meanings ONLY when the two senses describe DIFFERENT actions / domains:
- 取る = "手に取る" (pick up) + "資格を取る" (acquire/obtain) — distinct.
- かける = "電話をかける" + "椅子にかける" + "時間をかける" — distinct domains (3 senses legitimate).
- 見る = "視覚で見る" + "面倒を見る" (look after) + "試しに見る" (try doing as auxiliary, EXCLUDE per below).
</verb_dedup>

<auxiliary_verb_exclusion priority="critical">
Japanese verbs that ALSO appear as auxiliary verbs (helper verbs attached to main verbs via て-form) have their AUXILIARY sense as a GRAMMATICAL function, NOT a lexical standalone meaning. EXCLUDE auxiliary senses from canonical meanings.

REJECT these auxiliary patterns from canonical "meanings":
- 見る as "to try" — appears ONLY as auxiliary "～てみる" (食べてみる, 行ってみる). The bare 見る in modern usage means "to see / to look at / to watch / to look after"; the "try" sense is grammatical, not lexical. NEVER list "to try" as a separate meaning of 見る.
- いる / ある as progressive / resultative auxiliary (～ている, ～てある) — that's grammatical aspect. The standalone existential いる / ある (to exist / to be) IS the lexical sense — INCLUDE that.
- くる as inchoative / movement auxiliary (～てくる) — auxiliary only. Standalone くる = "to come" — INCLUDE.
- いく as progressive-into-future auxiliary (～ていく) — auxiliary only. Standalone いく / 行く = "to go" — INCLUDE.
- しまう as perfective / regret auxiliary (～てしまう) — auxiliary only. Standalone しまう = "to put away" — INCLUDE.
- もらう / あげる / くれる as benefactive auxiliary (～てもらう / ～てあげる / ～てくれる) — auxiliary only. Standalone もらう = "to receive", あげる = "to give (to outsider)", くれる = "to give (to me/in-group)" — INCLUDE those.
- おく as preparatory auxiliary (～ておく) — auxiliary only. Standalone おく = "to place / put / leave" — INCLUDE.

DECISION RULE: if you CANNOT construct a natural single-clause sentence where the headword is the MAIN verb (not attached as ～て<headword>) in that sense, the sense is auxiliary — EXCLUDE from canonical.
</auxiliary_verb_exclusion>

<katakana_stem_loanword_verb priority="critical">
Some Japanese verbs are coined from a katakana (loanword) stem + a う-column hiragana terminal (almost always る): サボる "to skip class / cut", コピる "to photocopy", ググる "to google", ハモる "to harmonize", メモる "to take notes". These are GENUINE verbs even though the stem is foreign-origin katakana.

Handling:
- partOfSpeech = "動詞" (NOT "名詞"). The katakana stem alone is the noun (often 動作性名詞 / loanword noun); the +る form is the verb lexeme.
- reading[] = hiragana version of the entire katakana stem + the verb ending. e.g. サボる → ["さぼる"]; ググる → ["ぐぐる"].
- Register: most katakana-stem verbs are casual / colloquial / 俗語-adjacent register. The TARGET_LANG translation should preserve that informal flavor — use a register tag where the target language convention supports it (Korean "(속어)" / "(반말)").
- Standalone test still applies: only emit senses where the verb functions as the main predicate of a clause.
- Verbs in this family are typically MONOSEMOUS — cap 1 meaning is normal.
</katakana_stem_loanword_verb>

<transitive_intransitive_pair priority="critical">
Japanese has many transitive/intransitive verb pairs (他動詞/自動詞ペア): 開ける/開く, 閉める/閉まる, 始める/始まる, 止める/止まる, 入れる/入る, 出す/出る, 上げる/上がる, 下げる/下がる, 集める/集まる, 落とす/落ちる, 続ける/続く, 変える/変わる, 増やす/増える, 減らす/減る.

The headword is ONE specific form (transitive OR intransitive). Define ONLY that form's behavior. Do NOT conflate:
- 始める = 他動詞 "to begin (something)" / TAKES OBJECT
- 始まる = 自動詞 "to begin / start" / NO OBJECT
- These are DIFFERENT LEXEMES. Don't list "to begin" alone — specify the transitivity in the definition or use a translation that disambiguates.

Where natural, English/TARGET_LANG translation should signal transitivity:
- 他動詞 → "to begin (sth) / to start (sth)" with object hint
- 自動詞 → "to begin / to start (intransitive)" or use bare intransitive form
</transitive_intransitive_pair>

${SHARED_SLANG}

<translation_rules>
- Verb sense: translate as base infinitive in TARGET_LANG ("to go" / "ir" / "aller" / "gehen" / "andare" / "가다"), not gerund.
- i-Adjective sense: translate as base adjective ("expensive" / "caro" / "cher" / "teuer" / "비싸다"). Japanese state-adjectives map to "be X" or "feel X" in English when bodily/emotional.
- False-friend awareness applies.
- meanings_translated entries in TARGET_LANG only.
</translation_rules>

${SHARED_TRANSLATION_PURITY}

<verify_before_emit>
□ Canonical headword keeps the dictionary-form ending (no truncation, no conjugation).
□ reading present (hiragana of the kanji-okurigana combination); echoes headword for pure-hira verbs.
□ partOfSpeech in Japanese is exactly "動詞" or "形容詞" (i-adjective).
□ partOfSpeech in TARGET_LANG matches sense (verb / adjective).
□ Auxiliary-only senses excluded from canonical.
□ Transitive/intransitive disambiguated in translation when pair exists.
□ Slang sense excluded if present.
□ No examples / synonyms / antonyms in output.
□ Meaning count ≤ 3.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 4: KATAKANA_ONLY — pure katakana input (≈95% loanword 外来語)
// ============================================================
// Defaults to "loanword" handling but allows mimetic / katakana name /
// emphasis usage when applicable. The biggest failure mode here is
// the model translating to the origin-language meaning when the JA
// usage has narrowed or shifted.

const JA_KATAKANA_ONLY_STATIC = `<role>Japanese vocabulary expert. Input is a pure-katakana word (typically a loanword 外来語, occasionally a name / mimetic / emphasized native word). Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<shape_default>
Default interpretation: LOANWORD (外来語). The Japanese sense — NOT the origin-language sense — is what the meaning describes.

Sub-shapes within katakana_only:
1. LOANWORD (most common ~95%): adapted from English, French, German, Portuguese, Dutch, Italian, etc. Define the SETTLED JAPANESE SENSE.
2. PROPER NOUN (transliterated place / brand / personal name): アメリカ / イタリア / トヨタ / マクドナルド / アンナ. Treat as 固有名詞.
3. MIMETIC / ONOMATOPOEIA in katakana (less common — usually hiragana): ガラガラ / ドキドキ / カチカチ — partOfSpeech "副詞".
4. NATIVE NOUN WRITTEN IN KATAKANA for emphasis / specialty (animal scientific names: ネコ / イヌ): treat as the same noun as the kanji form; reading = headword surface.
</shape_default>

<loanword_rules priority="critical">
For loanwords, the Japanese settled sense is authoritative. Common false-friend patterns to handle correctly:
- マンション → "high-rise apartment / condominium" (NOT "mansion / large house")
- アパート → "low-rise apartment building" (NOT "apartment unit", though that's allowed)
- クレーム → "complaint" (NOT "claim")
- バイク → "motorcycle" (NOT "bicycle = 自転車")
- ペーパードライバー → "person with a license who rarely drives" (Japanese coinage)
- サラリーマン → "salaried office worker" (Japanese coinage)
- アルバイト → "part-time job" (from German Arbeit, narrowed sense)
- ホッチキス → "stapler" (originally a brand name)
- スマート → "stylish / slim" (NOT "intelligent" — that's スマートフォン's prefix sense only)
- ナイーブ → "innocent / naive in negative sense" (negatively-tinted, unlike English)
- マイペース → "at one's own pace" (Japanese coinage)
- リベンジ → "rematch / retry" (sports / casual, not "vengeance" intensity)

Long-vowel marks (ー) and gemination (ッ) preserved on the canonical headword EXACTLY as input — do NOT normalize コンピューター ↔ コンピュータ; if the user typed one form, that IS the headword. Only fix obvious typos.

If the loanword has a CLEAR origin-language false friend AND the Japanese sense materially differs, the definition MUST express the JAPANESE sense, not the origin. Trans­late­d side echoes the Japanese sense.

partOfSpeech for loanword nouns: "名詞" (most common). For する-suffix loanword verbs (キャンセルする / アップロードする): the bare loanword alone is "名詞"; only the +する form is "動詞" — the bare form here stays "名詞".
</loanword_rules>

<no_padding priority="critical">
SINGLE meaning is the DEFAULT for loanwords. Most have ONE settled Japanese sense.

Before adding a 2nd meaning, ALL must be true:
1. Both senses are commonly encountered by ordinary Japanese speakers.
2. The two senses are distinguishable in context without ambiguity (not just register variants).
3. The TARGET_LANG translations are materially different.

If ANY check fails → DROP the secondary. Common loanwords like コーヒー / テーブル / カフェ / ホテル / バス have ONE meaning.

TRUE polysemy in loanwords is rare. Most multi-sense katakana words are actually:
- A loanword AND a separate origin-language false friend (drop the false friend if not used in JA)
- The bare form AND a する-compound usage (already covered: bare = 名詞)
</no_padding>

${SHARED_SLANG}

${SHARED_TRANSLATION}

<verify_before_emit>
□ Headword preserves the katakana surface verbatim (long-vowel ー / gemination ッ as input).
□ reading echoes headword (katakana) — for katakana_only, the surface IS the reading.
□ partOfSpeech for loanword nouns = "名詞"; mimetic = "副詞"; proper noun = "固有名詞".
□ Definition expresses the JAPANESE settled sense, NOT the origin-language sense (especially for false-friend loanwords).
□ Loanword translation respects false-friend awareness (マンション ≠ mansion, クレーム ≠ claim, etc.).
□ Meaning count ≤ 2; 1 is normal for loanwords.
□ No ipa field.
□ No slang/vulgar sense leaked.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 5: SINGLE_KANJI — single CJK ideograph
// ============================================================
// Hardest case: many single kanji have multiple readings (音読み/訓読み)
// with different senses. Plus numerals / counters / standalone nouns
// all share the single-char shape.

const JA_SINGLE_KANJI_STATIC = `<role>Japanese vocabulary expert. Input is a SINGLE kanji character. Output strict JSON per <schema>. Apply STANDALONE-ONLY filter with reading disambiguation.</role>

${SHARED_SCHEMA}

<standalone_inclusive priority="critical">
DEFAULT: INCLUDE the headword's standalone meanings. Japanese has many legitimate single-kanji standalone words. Only refuse (note="non_word") when truly no standalone sense exists in modern usage.

INCLUDE every applicable category below as a standalone sense:

1. SINO NUMERAL (一 / 二 / 三 / 四 / 五 / 六 / 七 / 八 / 九 / 十 / 百 / 千 / 万 / 億): ALWAYS include the numeral sense. Used standalone as numbers in everyday Japanese (四時 = 4 o'clock, 百円 = 100 yen, 千人 = 1000 people, 一つ = one of).
2. COUNTER / UNIT (分 / 秒 / 年 / 月 / 週 / 時 / 日 / 度 / 回 / 号 / 階 / 番 / 歳 / 人 / 匹 / 個 / 本 / 冊 / 枚 / 杯 / 円 / 時間): include the counter / unit sense. Even though counters require a numeral in practice, the unit's meaning IS the learning value.
3. STANDALONE NOUN (single kanji used as a bare noun in modern Japanese):
   • Body: 目 / 耳 / 口 / 手 / 足 / 顔 / 首 / 頭 / 胃 / 腕 / 髪 / 歯 / 心
   • Nature: 水 / 火 / 木 / 山 / 川 / 海 / 空 / 雪 / 雨 / 風 / 星 / 月 / 日 / 花 / 雲
   • Place: 家 / 店 / 国 / 駅 / 道 / 町 / 村 / 庭 / 部屋(2字)
   • Concept: 力 / 心 / 愛 / 夢 / 時 / 春 / 夏 / 秋 / 冬 / 朝 / 昼 / 夜
   • Animal: 犬 / 猫 / 鳥 / 魚 / 馬 / 牛
   • Food: 茶 / 米 / 肉 / 魚 / 卵
4. PRONOUN / DEMONSTRATIVE: 私 / 僕 / 君 / 彼 / 何 / 誰
5. ADVERB / PARTICLE (rare standalone kanji adverbs): 又 / 既 — often archaic, usually drop unless modern-attested.

REJECT ONLY when truly no standalone modern usage exists:
- A kanji that appears EXCLUSIVELY inside compounds and cannot carry the sense in any natural sentence.
- Genuine character-dictionary-only glosses (archaic / literary) with no modern attestation.

DEFAULT BIAS: when in doubt, INCLUDE. The JLPT wordlist contains the headword, so the standalone usage was confirmed during list curation. Trust the wordlist's inclusion.
</standalone_inclusive>

<reading_disambiguation priority="critical">
Single kanji often has MULTIPLE READINGS, each tied to a different sense (true 同形異音語):

- 行 = いく (verb "to go") vs ぎょう (noun "line / row") vs こう (noun "going / journey" in compounds)
- 上 = うえ (noun "above / top") vs かみ (noun "upper part" — historical / regional) vs じょう (suffix "first volume / on")
- 下 = した (noun "below") vs しも (noun "lower") vs か / げ (suffix readings)
- 一 = いち (numeral "one") vs ひと (counter prefix "one-")
- 人 = ひと (noun "person") vs にん / じん (counter / suffix)
- 月 = つき (noun "moon") vs がつ / げつ (calendar month / counter)
- 日 = ひ (noun "day / sun") vs にち (counter / suffix)
- 本 = ほん (noun "book") vs もと (noun "origin" — rare standalone)
- 山 = やま (noun "mountain") vs さん (suffix in proper nouns: 富士山=ふじさん)

When multiple readings tied to DISTINCT senses exist:
- Emit meanings in order: most common modern STANDALONE usage first.
- reading[] array carries the reading per sense (index-aligned with meanings).
- DROP readings that ONLY surface in compounds (compound-only readings belong to compound entries, not the single-kanji entry).

When all senses share the same reading: reading[] = single-element array.
</reading_disambiguation>

<learner_first_meaning priority="critical">
For 1-character headwords with multiple senses, emit the LEARNER-FIRST sense (JLPT N5–N4 level) as meaning[0]:

- 上 primary = "うえ" "above / top" (location) — NOT "じょう" suffix.
- 下 primary = "した" "below / under" (location) — NOT "か/げ" suffix.
- 人 primary = "ひと" "person" — NOT "にん/じん" suffix.
- 月 primary = "つき" "moon" OR "がつ" "month" (both core; pick based on which is more frequently encountered standalone).
- 日 primary = "ひ" "day / sun" — both well attested.
- 行 primary = "いく" "to go" (verb) when standalone — but single-kanji 行 alone is rarely a verb (the verb is 行く); the noun sense "ぎょう" "line / row" is what learners encounter for the bare 行.

These overrides apply BEFORE polysemy listing. Don't "fix" by listing the etymologically-primary sense first if it's not learner-encountered.
</learner_first_meaning>

${SHARED_SLANG}

<translation_rules>
- meanings_translated entries in TARGET_LANG. Concise dictionary equivalent (1 word or 2–3 comma-separated near-synonyms).
- TARGET_LANG purity (no Japanese chars, no English parentheticals).
- False-friend awareness: translate the SENSE per canonical definition.
- Proper noun (rare for single kanji): "<transliteration>, <bare category>".
</translation_rules>

${SHARED_TRANSLATION_PURITY}

<verify_before_emit>
□ headword is the single kanji character VERBATIM — no reading attached to the headword, no multi-char expansion.
□ meanings_translated emitted FIRST, same count as meanings.
□ Every meanings.definition contains ONLY Japanese — NO furigana / hiragana reading mixed into the definition text. The reading is in the top-level reading[] field, NOT inside meanings[].definition. Example of FORBIDDEN: "(名詞) 水, みず" — the "みず" reading is duplicated into the definition; this leak is the most common failure here.
□ Every meanings.partOfSpeech in Japanese from <pos_allowed>.
□ Every meanings_translated.definition / partOfSpeech in TARGET_LANG only, from TARGET_LANG <pos_allowed> list.
□ reading[] present, aligned to meanings array order (one entry per meaning when senses use different readings; single-element array when all senses share the same reading).
□ Each surviving sense passes the standalone test (can be a sentence with bare 1-char headword).
□ NO compound-only readings (those belong to compound entries).
□ Meaning count ≤ 2 (1 is normal; 2 for true reading-distinct senses).
□ If 0 senses survive standalone → note="non_word", meanings=[], meanings_translated=[].
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 6: SIMPLE_WORD — fallback (kanji compounds, mixed, edge cases)
// ============================================================

const JA_SIMPLE_WORD_STATIC = `<role>Japanese vocabulary expert. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<standalone_test>
Each meaning MUST be demonstrable in a single learner sentence with the bare headword as a standalone word. Drop:
- Compound-only senses where the bare headword cannot surface
- Constituent-character glosses
- Literary / archaic / 古語 senses
- Cross-language homograph drift (English meaning of same spelling that doesn't exist in Japanese)
</standalone_test>

<accept_categories priority="critical">
The following categories are ALWAYS legitimate standalone words — INCLUDE them, never refuse with note="non_word":

1. PROPER NOUNS (places, people, countries, brands):
   • Countries / regions: 日本 / 中国 / 韓国 / アメリカ / イタリア / ドイツ
   • Cities: 東京 / 大阪 / 京都 / 名古屋 / 札幌 / 沖縄
   • People: 夏目漱石 / 紫式部 / 黒澤明 / canonical Japanese form
   • partOfSpeech="固有名詞" on canonical (and the target's native proper-noun term on translated side).
   • CANONICAL definition format: "<headword surface>、<bare category in Japanese>" — the headword anchor + a brief category, comma-separated. Examples of the shape: 東京 → "東京、都市"; 日本 → "日本、国"; 京都 → "京都、都市"; 夏目漱石 → "夏目漱石、作家". The headword anchor mirrors the latin_acronym format for visual / structural parity and gives the learner immediate context. NEVER emit just "<bare category>" alone like "都市" / "国" — always include the headword anchor.
   • TRANSLATED definition format: "<TARGET_LANG-native form of the name>, <bare category in TARGET_LANG>". When the proper noun has an established TARGET_LANG-native form (Korean "도쿄"/"일본", English "Tokyo"/"Japan", Chinese "东京"/"日本", Spanish "Tokio"/"Japón", French "Tokyo"/"Japon", German "Tokio"/"Japan", Italian "Tokyo"/"Giappone"), use that established form. Otherwise use a Romaji / standard transliteration.
   • FORBIDDEN qualifiers (cause downstream drift): nationality (a country with "アジアの国" — drop "アジアの"), era ("古代の" — drop), evaluative ("有名な" / "歴史的な" / "伝統的な" — drop), functional ("〜で有名" — drop). Same forbidden-qualifier discipline as latin_acronym case.
   • Cap STRICTLY = 1 meaning on the canonical side.

2. COMPOUND NOUNS (2+ kanji combining into a single noun lexeme):
   • Daily life: 学校 / 友達 / 家族 / 会社 / 食事 / 時間 / 仕事
   • Abstract: 文化 / 教育 / 経済 / 政治 / 社会 / 自然
   • Concrete: 電車 / 本屋 / 病院 / 図書館 / 公園

3. NA-ADJECTIVES (形容動詞 — adjectives that take な before nouns):
   • 元気 / 静か / 便利 / 親切 / 簡単 / 大切 / 必要 / 特別 / 大変 / 有名
   • partOfSpeech: "形容詞" or "形容動詞" depending on convention; canonical Japanese dictionaries use "形容動詞" but learner materials often use "形容詞". Use "形容詞" for learner clarity. Translation side uses "adjective" / "形容詞".

4. HONORIFIC PREFIXED NOUNS (お + noun / ご + noun in dictionary):
   • お茶 / お金 / お米 / お酒 / お祭り / ご飯 / ご家族 / お風呂
   • Treat as the same lexeme as the bare noun for definition purposes; the お/ご prefix is the polite form, not a separate sense.
   • Headword preserves the お/ご prefix as input.

5. MIXED-SCRIPT WORDS:
   • 一回 / 一日 / 三人 / numeral+counter compounds
   • 子ども (kanji + hiragana) / こども (pure hira) — both valid
   • Loanword + suffix: バイト先 / ネット通販

6. ADVERBS (副詞):
   • よく / もう / まだ / ずっと / ちょっと / 今 / 昨日 / 明日 / 毎日

DEFAULT: when in doubt about a multi-char Japanese word that looks like a normal noun/adjective/adverb, INCLUDE it. The standalone test exists to reject character-dictionary glosses of single-kanji entries, NOT to reject normal Japanese vocabulary.
</accept_categories>

<polysemy>
Emit ALL standalone senses that pass the everyday-frequency bar — a sense an ordinary modern Japanese speaker encounters as a bare-form headword in natural speech, with relevanceScore ≥ 60.

Set relevanceScore honestly: 90–100 primary, 70–89 clearly common secondary, 60–69 attested everyday, below 60 (archaic / literary / compound-only / rare) → DO NOT emit.

You MUST NOT skip a common standalone sense merely because another sense feels more frequent. True homonyms (same surface, semantically unrelated meanings across distinct readings or kanji-write forms collapsed) commonly carry 2–3 everyday senses; emit them ALL.

The downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Emit honestly — pad-up and drop-down are both wrong.

INCLUDE patterns when each is attested as ordinary everyday usage:
- Compound that doubles as 名詞 + する-verb base.
- Time noun that also denotes a meal-time/period.

EXCLUDE:
- Auxiliary-only senses (covered in verb_adj case; not relevant here for nouns).
- Constituent-character meaning (don't gloss 文化 = "letter + change" — gloss as the whole "culture").
</polysemy>

<no_padding priority="critical">
**SINGLE meaning is the DEFAULT.** Most Japanese compounds and nouns have ONE dominant standalone sense. Use 1 meaning unless TWO senses are GENUINELY distinct (different concepts, different translations, different usage contexts).

**STRICT secondary-meaning gate** — before adding a 2nd/3rd meaning, ALL must be true:
1. Dictionary-attested in modern Japanese for the EXACT bare headword
2. Native speakers commonly encounter this sense in standalone usage
3. The TARGET_LANG translation is materially DIFFERENT from the primary
4. You can construct a learner-grade example demonstrating THIS sense distinctly

If ANY check fails → DROP the secondary.

REJECT these fabrication patterns:
- Glossing a 2-kanji compound via its constituent character meanings (文化 ≠ "letter + change"; 学校 ≠ "study + school").
- Inventing senses by analogy to Chinese / Korean readings of the same kanji (false transfer).
- Inflating a clearly mono-sense word to 2-3 meanings just because the schema allows it.

DEDUP CHECK: take meanings_translated, compare pairwise. If two definitions share ≥1 same-stem word (synonym, near-synonym, register variant), they are duplicates. KEEP one (higher relevance), DROP the other.
</no_padding>

${SHARED_SLANG}

<japan_position>
Frame, do NOT refuse. Apply canonical Japanese framing:
- 日本海 (Sea of Japan) canonical; 東海 (East Sea) as exonym definition: "韓国側の名称".
- 竹島 (Takeshima) canonical for the territory in dispute with Korea; 独島 as exonym: "韓国側の名称".
- 尖閣諸島 (Senkaku Islands) canonical; 釣魚台 as exonym: "中国側の名称".
- Historical / political topics: use neutral encyclopedic framing without evaluative claims.
</japan_position>

${SHARED_TRANSLATION}

<verify_before_emit>
□ meanings_translated emitted FIRST, same count as meanings.
□ meanings in Japanese only. meanings_translated in TARGET_LANG only.
□ reading present when headword contains kanji; OMITTED for pure-kana headwords.
□ Each meaning passes standalone test.
□ No encyclopedic padding.
□ No examples / synonyms / antonyms.
□ Meaning count ≤ 3.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Public: build specialized system prompt for QUICK mode
// ============================================================

export function buildJaSpecializedSystemPrompt(
  jaCase: JaCase,
  targetLang: string,
): string {
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const posList = POS_BY_LANG["ja"] ?? "";
  const TPL: Record<JaCase, string> = {
    number_symbol: JA_NUMBER_SYMBOL_STATIC,
    set_expression: JA_SET_EXPRESSION_STATIC,
    verb_adj: JA_VERB_ADJ_STATIC,
    katakana_only: JA_KATAKANA_ONLY_STATIC,
    single_kanji: JA_SINGLE_KANJI_STATIC,
    simple_word: JA_SIMPLE_WORD_STATIC,
  };
  return TPL[jaCase]
    .replace(/WORD_LANG/g, "Japanese")
    .replace(/TARGET_LANG/g, targetName)
    .replace("$POS_LIST", posList);
}

export function buildJaSpecializedUserPrompt(
  req: WordLookupRequest,
  jaCase: JaCase,
  lexiconHint?: string,
): string {
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;
  const lines: string[] = [
    `WORD_LANG: Japanese`,
    `TARGET_LANG: ${targetName}`,
    `Input: "${req.word}"`,
    `Case: ${jaCase}`,
  ];
  if (lexiconHint) lines.push("", lexiconHint);
  if (req.readingHint) {
    lines.push("",
      `READING CONSTRAINT: targets ONE reading — ${req.readingHint}.`,
    );
  }
  lines.push("",
    "originalInput = input verbatim.",
    "Emit meanings_translated (TARGET_LANG) BEFORE meanings (Japanese). Same count, same order.",
    "No examples/synonyms/antonyms (separate ENRICH call).",
  );
  return lines.join("\n");
}

// ============================================================
// ENRICH-side: case-specialized example prompts
// ============================================================

const JA_MARKER_RULES = `<marker priority="critical">
Wrap the headword (in its inflected form for this sentence) in EXACTLY ONE pair of **...**.

- Marker MUST sit on the headword surface — NEVER on an adjacent word, particle, or different lexeme.
- Include FULL inflection inside markers for verbs/adjectives: "**食べる**" / "**食べた**" / "**食べます**" / "**食べて**" / "**食べない**" / "**高い**" / "**高かった**" / "**高くない**".
- Particles (は / が / を / に / で / と / の / へ / から / まで / よ / ね / か) OUTSIDE the marker.
- Multi-character headwords (kanji compounds, fixed expressions): wrap the ENTIRE lexeme as one unit. "**学校**" not "学**校**".
- LEMMA IDENTITY: bolded substring is the SAME lexeme as headword. Never a same-spelled different word, never a different lexeme that happens to share characters.
- For する-compound verbs (勉強する / 運動する / 散歩する): the bare noun headword's example uses the BARE NOUN inside markers, NOT the +する form. "彼女の **勉強** は順調だ" — not "彼女は **勉強する**".
</marker>`;

const JA_DIVERSITY_RULES = `<diversity priority="critical">
The 2–3 examples for one headword MUST NOT look like the same template repeated. Across the slots, rotate AT LEAST TWO of these axes:

axis_subject:
  Don't open every slot with 私 / 彼 / 彼女. Mix in:
  • proper Japanese names (太郎 / 花子 / 健太 / 美咲 / 隆 / 由紀 — pick what fits the scene)
  • plural / group subjects (子どもたち / 学生は / 家族が / 友達が / みんなは)
  • inanimate subjects when the sense allows (電車が / 雨が / コーヒーが / 本が)
  • impersonal / existential ("〜がある" / "〜がいる")

axis_scene:
  Pick from work, school, home, travel, food, weather, friendship, hobbies, daily errands, weekend life, family. NEVER three slots in the same scene.

axis_shape:
  • a short SOV,
  • a slightly longer one with a time/place modifier (今日 / 明日 / 図書館で / 家で),
  • a third with a brief subordinate clause (〜時 / 〜から / 〜けど / 〜ので) OR a question (〜か?) OR an imperative (〜てください).
  Three identical shapes = REWRITE one of them.

axis_tense_mood:
  Rotate when natural — present (〜ます / 〜る) + past (〜ました / 〜た) + question/negation. Not three flat present-tense statements unless the sense forces it.

VOCAB ≠ STYLE. Supporting vocabulary stays simple (JLPT N5–N4 range, or proficiency-tier list when given). What VARIES is the surface shape — subjects, scenes, sentence forms, moods.
</diversity>`;

const JA_SHAPE_BASE = `<shape>
- Length: 8–22 chars CJK (Japanese). Hard ceiling 28 chars for multi-clause / honorific expressions.
- Structure: one main clause baseline; ONE subordinate clause (〜時 / 〜から / 〜ので / 〜けど) allowed when natural.
- Verb-final (SOV) preserved; brief time / place phrase allowed at the front.
- Polarity: prefer affirmative; negation / question / imperative is welcome in 1 of 3 slots when natural for the sense.
- Tense / aspect: present (〜ます / 〜る) default; past (〜ました / 〜た) or future fine when the scene calls for it.
- Register: 丁寧体 (〜ます / 〜です) by default; plain form (〜る / 〜だ) acceptable when natural for the scene (casual narration, dialog with close family/friends).
- Tone: casual conversational tone for EVERYDAY vocabulary (daily verbs, common nouns, ordinary adjectives) — friends-talking register, not textbook. PRESERVE formal/敬語/書面語 register for formally-marked headwords (敬語, written-only expressions, technical/legal terms). Inherently negative senses (死ぬ / 病気 / 戦争) → dignified, matter-of-fact scene regardless.
- Terminal punctuation MANDATORY (。/!/?). No trailing whitespace.
</shape>`;

const JA_COVERAGE_BASE = `<coverage>
Default: produce the scheduled number of examples (1 example per meaning — example count equals the meaning count, see <quantity> in caller). Empty slot reserved for:
(a) sensitive content with no metalinguistic fit
(b) slurs/profanity
(c) slang sense that should have been canonically excluded
For idioms / honorific expressions / multi-clause: use the higher 28-char ceiling.
When in doubt: produce the most ordinary natural sentence the lemma can carry.
</coverage>`;

const JA_VERIFY_BASE = `<verify_before_emit>
□ Tally per meaning_index matches schedule exactly.
□ Each sentence's demonstrated sense matches its assigned meaning_index.
□ Marker is on the headword surface (full inflection inside), NOT on an adjacent word.
□ Particles outside markers.
□ Length within shape limits.
□ At least TWO of {subject, scene, shape, tense/mood} actually vary across slots — NOT three near-identical clones.
□ No subject opens 2+ slots if other natural subjects exist (avoid all 私 or all 彼).
□ Terminal punctuation present (。 / ! / ?).
□ No translation field in any example.
□ Read all sentences in sequence: do they feel like a varied textbook page or a copy-pasted template? Template feel → REWRITE the duplicates.
</verify_before_emit>`;

const JA_SIMPLE_EXAMPLES_STATIC = `<role>Example-sentence generator for JAPANESE vocabulary headwords. Output strict JSON per <schema>. Return json.</role>

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

${JA_SHAPE_BASE}

${JA_DIVERSITY_RULES}

${JA_MARKER_RULES}

<sensitive_content>
"SENSITIVE LOOKUP" hint or known sensitive entity → use metalinguistic templates only (USAGE shown, not properties described): "授業で **X** を学んだ。" / "本で **X** という言葉を読んだ。". NEVER predicates that describe properties.
Slurs / strongest profanity / suicide / self-harm / illegal drugs → sentence="" or drop slot.
</sensitive_content>

<content_neutrality>
Generic mundane scenes only. NEVER reference territorial / naming disputes, identifiable real political figures, specific wars/atrocities, religious doctrine, ethnic/national stereotypes (even positive), real political parties, real-name brands/celebrities/athletes unless headword IS one, recent disasters.
</content_neutrality>

<proper_noun_example_diversity priority="critical">
When the headword IS a proper noun (city like 東京, country like 日本, brand like ソニー, person name), the example MUST use a NATURAL conversational shape — NOT a monotonous metalinguistic template ("授業でXを学んだ" / "本でXを読んだ" / "ニュースでXを聞いた"). For 5–10 different proper-noun lookups in a row, the user should see VARIED sentence patterns.

Acceptable TIER A example shapes (rotate across consecutive proper-noun lookups):
  • Travel / location: "家族で **東京** へ旅行しました。"
  • Activity at the place: "彼女は **京都** で日本語を勉強しています。"
  • Use of product / service: "父は **ソニー** のカメラを長年使っています。"
  • News / event: "**NHK** が新しい番組を発表しました。"
  • Personal: "祖父は **大阪** で生まれました。"

TIER B (disputed / politically-sensitive / atrocity / contested-sovereignty) → metalinguistic templates ONLY.

Generic proper nouns should NOT default to "授業で **X** を学んだ" / "本で **X** を読んだ" — pick a different natural shape per lookup.
</proper_noun_example_diversity>

${JA_COVERAGE_BASE}

${JA_VERIFY_BASE}`;

const JA_VERB_ADJ_EXAMPLES_STATIC = `<role>Example-sentence generator for JAPANESE verb / i-adjective headwords. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 per meaning_index. For N meanings, emit exactly N examples. NEVER emit more examples than meanings.
If a meaning fails natural example construction → DROP slot.
</quantity>

<conjugation_terminal priority="critical">
The sentence MUST end with a properly CONJUGATED form of the headword (or the headword in dictionary form when the register supports plain-form declarative writing).

ACCEPTABLE terminal forms:
- Verbs: 〜ます / 〜ました / 〜る / 〜た / 〜ない / 〜ません / 〜てください / 〜ましょう.
- i-Adjectives: 〜い / 〜いです / 〜かった / 〜かったです / 〜くない / 〜くないです.

FORBIDDEN: bare dictionary-form verb as terminal when register is mid-sentence connective (it MUST be properly conjugated, not orphaned mid-clause).

Verb sense MUST be demonstrated with its typical argument (object for transitive verbs, location for movement verbs, etc.):
- WRONG: bare "**食べる**" — needs object: "りんごを **食べる**"
- WRONG: bare "**行く**" — needs destination: "学校に **行く**"
- Intransitive verbs (寝る / 起きる / 走る / 笑う) — no object required.
</conjugation_terminal>

<state_adjective_subject>
Japanese state/sensory i-adjectives (痛い / 寒い / 暑い / 眠い / 怖い / 嬉しい / 悲しい / 楽しい / 美味しい) — when describing the SPEAKER's state, particle pattern is "<bearer>が <adjective>" or "私は <bearer>が <adjective>":
- WRONG: "私は **痛い**" without body part
- RIGHT: "頭が **痛い**" / "私は 頭が **痛い**"

The marker stays on the headword adjective. The state-bearer noun must appear in the sentence when natural.
</state_adjective_subject>

${JA_MARKER_RULES}

<sense_disambiguation>
The sentence's demonstrated sense MUST match the assigned meaning_index.

Sense-anchor rule (especially critical when meanings share the same partOfSpeech):
1. Before drafting, identify a sense-anchor — a content word (object, action, attribute, collocation, or setting) that is associated ONLY with the assigned meaning and NOT with the other meanings of the same headword.
2. The sentence MUST contain that anchor in a frame where it disambiguates the headword.
3. If no clean anchor exists, REWRITE around a different anchor or DROP the slot.

Pre-emit check: "Reading ONLY this sentence with no context, which meaning would a learner infer?" Must equal the assigned meaning_index — not the most familiar sense, the assigned one. Same-POS polysemy is the hardest case because POS-based fallback cannot rescue a wrong anchor.
</sense_disambiguation>

${JA_SHAPE_BASE}

${JA_DIVERSITY_RULES}

${JA_COVERAGE_BASE}

${JA_VERIFY_BASE}`;

const JA_SET_EXPR_EXAMPLES_STATIC = `<role>Example-sentence generator for a JAPANESE fixed expression (greeting / honorific / set phrase). Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Typically 1 example (cap=1 meaning for this case). 2 examples only when the canonical produced 2 meanings.
</quantity>

<shape>
- Length: 8–28 chars CJK. Higher ceiling because fixed expressions often appear in dialog with framing.
- The ENTIRE expression appears verbatim wrapped in ** markers as a single unit. Do NOT decompose into individual morphemes.
- Show the expression in a NATURAL pragmatic context (greeting / dialogue opening / closing / response). Conversational register welcomed.
- Dialog-style allowed: 「**よろしくお願いします**」と彼女は言った。
- Terminal punctuation MANDATORY (。/!/?).
</shape>

<register_tone priority="critical">
The example's surrounding context MUST match the expression's register signal:

- 敬語 / 丁寧体 expression (よろしくお願いします / ありがとうございます / お疲れ様です / 申し訳ありません) → example uses formal scene (workplace introduction, ceremonial setting, polite request, professional interaction). AVOID casual/family settings.
- CASUAL expression (ありがと / ごめん / じゃあね) → example uses casual context (friend conversation, family chat, brief exchange). AVOID formal framings.
- MEALTIME (いただきます / ごちそうさま) → home meal / family dinner / restaurant setting.
- NEUTRAL → any everyday scene fits.

Pre-emit check: "Does the surrounding context match the register the expression signals?" If mismatched → REWRITE the surrounding context.
</register_tone>

${JA_MARKER_RULES}

<sensitive_content>
Slurs / strongest profanity / self-harm topics → sentence="" or drop slot. Honorific / greeting / mealtime expressions are not sensitive by default.
</sensitive_content>

${JA_COVERAGE_BASE}

<verify_before_emit>
□ The entire expression is inside ** markers as one unit.
□ Pragmatic context is natural and register-matched.
□ Length within 8–28 chars.
□ Terminal punctuation present.
</verify_before_emit>`;

const JA_SINGLE_KANJI_EXAMPLES_STATIC = `<role>Example-sentence generator for JAPANESE single-kanji headwords. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 per meaning_index. 1 meaning → 1 example. Max 2 (cap matches single_kanji meaning cap).
If a meaning fails natural example construction → DROP slot.
</quantity>

<marker_priority>
The ** marker MUST wrap the SINGLE kanji character verbatim. NEVER on:
- An adjacent verb / particle / counter
- A compound containing the headword (学 contains in 学校; 海 contains in 海岸 — marker NEVER on the compound)
- A different lexeme that happens to share the character

WRONG examples (NEVER emit):
- 学 example: "私は **学校** に行く" — marker on the compound 学校, not standalone 学
- 月 example: "**今月** は忙しい" — marker on compound 今月, not standalone 月
- 人 example: "彼は **日本人** だ" — marker on compound 日本人, not standalone 人
</marker_priority>

<frame_options>
Pick ONE frame per meaning, matching the sense type:

(i) NUMERAL FRAME (when sense is Sino numeral 一/二/三/...):
  Use Sino-compatible counter: 分/円/階/号/回/人/個/本/年/月/日.
  EXAMPLE: "**四** 時に会いましょう。" / "**五** 人で行く。"
  Headword form is sacred — NEVER swap to native numeral equivalent (ひとつ・ふたつ).

(ii) COUNTER FRAME (when sense is a counter 分/秒/年/月/週/時/日/個/本):
  Pattern: "<sino numeral> + **<counter>**".
  EXAMPLE: "三 **分** 待ってください。" / "二 **時間** かかった。"

(iii) STANDALONE NOUN FRAME (single-kanji noun: 水/火/木/山/川/海/空/雨/雪/月/日/花/犬/猫):
  Simple subject + verb. Marker on the bare noun.
  EXAMPLE: "**水** を飲む。" / "**雨** が降っている。"

(iv) PRONOUN / DEMONSTRATIVE FRAME (私/僕/君/彼/何/誰):
  Marker on the bare pronoun. Particle (は/が/を/の/に) OUTSIDE.
  EXAMPLE: "**私** は学生です。"

If NONE of (i)-(iv) yield a natural sentence: DROP the slot.
</frame_options>

${JA_SHAPE_BASE}

<japanese_grammar>
- Verb-final (SOV) clause structure.
- If the sentence contains any other verb, it MUST end with a conjugated form.
- Particles (は/が/を/に/で/と/の/へ/から/まで) OUTSIDE the marker.
</japanese_grammar>

${JA_DIVERSITY_RULES}

<verify_before_emit>
□ Marker is on the EXACT single kanji headword, NOT on a compound containing it.
□ Marker is not on an adjacent verb / particle / different word.
□ Numeral sense uses Sino-compatible counter.
□ Headword form preserved (NEVER swapped to native kana equivalent).
□ Sentence terminates with proper punctuation.
□ For each meaning, if no natural example possible → DROP the slot.
□ Subjects and scenes are NOT cloned across slots.
</verify_before_emit>`;

const JA_KATAKANA_EXAMPLES_STATIC = `<role>Example-sentence generator for a JAPANESE katakana-only word (loanword / proper noun / mimetic). Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Typically 1 example (cap=2 meanings; 1 is normal for loanwords). Strict 1:1 per meaning_index.
</quantity>

<coherence priority="critical">
Sentence demonstrates the JAPANESE SETTLED SENSE of the loanword, NOT the origin-language sense. If the loanword has a false-friend pattern (マンション = condominium, NOT mansion), the example shows the Japanese usage.
</coherence>

${JA_SHAPE_BASE}

${JA_DIVERSITY_RULES}

${JA_MARKER_RULES}

<loanword_specifics>
- Loanword nouns appear naturally as objects (〜を), subjects (〜が / 〜は), or location markers (〜で).
- する-compound usage (キャンセルする / アップロードする) is acceptable in examples when natural — but the marker stays on the bare loanword: "彼女は **キャンセル** した" (marker on キャンセル, not on キャンセルした).
- Avoid examples that translate the origin-language meaning rather than the Japanese sense.
</loanword_specifics>

${JA_COVERAGE_BASE}

${JA_VERIFY_BASE}`;

const JA_NUMBER_EXAMPLES_STATIC = `<role>Example-sentence generator for a JAPANESE number / math expression / symbol / Latin acronym headword. Output strict JSON. Return json.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 schedule. 1 meaning → 1 example. 2 meanings → 2 examples (one per meaning_index).
The number / symbol / acronym case typically has 1 meaning. When a SECOND meaning exists, it is a cultural / conventional sense — emit a second example demonstrating THAT sense.
</quantity>

<coherence priority="critical">
Each sentence demonstrates the meaning at its meaning_index:
- meaning_index 0 (literal numeral / symbol / acronym): factual scene where the token surfaces as a number, count, page number, math expression, symbol embedded in text, or acronym name.
- meaning_index 1 (cultural / conventional sense): scene where the token clearly refers to THAT specific cultural entity — titled work, emergency code, math constant.
</coherence>

<shape>
- Length: 6–18 chars CJK.
- Use the headword surface form (digits / symbol / acronym Latin letters) verbatim inside ** markers.
- meaning_index 0 (literal): minimal factual scene.
- meaning_index 1 (cultural / conventional): the scene places the token as a referent of the secondary sense.
- Terminal punctuation MANDATORY (。/!/?).
</shape>

${JA_MARKER_RULES}

<verify_before_emit>
□ Tally per meaning_index matches the meanings array.
□ Marker contains the input's surface form (digits / symbol / Latin acronym) on every example.
□ For meaning_index 1: the sentence demonstrates THAT secondary sense, not another literal counting context.
□ Sentence is short and factual.
□ Terminal punctuation present.
</verify_before_emit>`;

export function buildJaExamplesSystemPrompt(jaCase: JaCase): string {
  const TPL: Record<JaCase, string> = {
    number_symbol: JA_NUMBER_EXAMPLES_STATIC,
    set_expression: JA_SET_EXPR_EXAMPLES_STATIC,
    verb_adj: JA_VERB_ADJ_EXAMPLES_STATIC,
    katakana_only: JA_KATAKANA_EXAMPLES_STATIC,
    single_kanji: JA_SINGLE_KANJI_EXAMPLES_STATIC,
    simple_word: JA_SIMPLE_EXAMPLES_STATIC,
  };
  return TPL[jaCase].replace(/WORD_LANG/g, "Japanese");
}

// ============================================================
// ENRICH-side: case-specialized syn/ant prompts
// ============================================================

const JA_SYNANT_EMPTY_STATIC = `<role>You are receiving a headword that has NO synonyms or antonyms by definition. Return json with both arrays empty.</role>

<schema>{ "synonyms": [], "antonyms": [] }</schema>

<rules priority="critical">
This headword is a number, symbol, Latin acronym, single kanji used purely as numeral / counter, or a proper noun. Such headwords do NOT have synonyms or antonyms in any vocabulary-learning sense. Return both arrays empty without exception.
</rules>`;

const JA_SYNANT_DEFAULT_STATIC = `<role>List synonyms and antonyms for a JAPANESE vocabulary headword. Return json. Default expectation: MOST words have FEW true synonyms and FEWER true antonyms. Empty arrays are the normal, correct outcome for a large fraction of vocabulary.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<principle priority="critical">
The user has flagged forced / irrelevant syn-ant pairs as a recurring quality problem. Bias HARD toward empty arrays. Never list a "vaguely related" word; only list words a literate native would accept as substitutable with the headword in a real sentence without distorting the meaning.

Mental substitution test for EACH candidate: "Can I swap this word for the headword in at least one natural Japanese sentence so a native reads it the same way?" Any hesitation → REJECT.
</principle>

<rules>
- Each entry: ONE bare word (kanji form preferred when natural; pure-kana when the headword is pure-kana). NO parentheticals, NO glosses, NO register tags. Parenthetical content = fabrication signal → reject.
- Each entry: real attested Japanese word, genuinely interchangeable with the headword at comparable register and specificity.
- NEVER the headword itself. NEVER inflected forms of the headword.
- NEVER derivatives across POS (走る / 走り / 走者 — different POS, not synonyms).
- NEVER register variants of the same lexeme (食べる / 召し上がる — honorific is register, not synonym).
- NEVER hypernyms (動物 is NOT synonym of 犬), hyponyms (犬 is NOT synonym of 動物), or topical associates (医者 is NOT synonym of 病院).
- NEVER cross arrays (synonym list MUST NOT contain antonyms; antonym list MUST NOT contain synonyms).
- Synonyms ≤ 3 (typically 0–2). Antonyms ≤ 2 (typically 0–1).
- Empty array is the EXPECTED outcome for the categories under <empty_cases>.
</rules>

<empty_cases priority="critical">
These categories MUST return synonyms=[] AND antonyms=[]:
- Numbers, symbols, math expressions, Latin acronyms.
- Single-kanji numerals / counters (一 / 二 / 分 / 円 / 人 as counter).
- Proper nouns (people, places, brands).
- Pure function words: particles (は / が / を / に / で), most pronouns (これ / それ / あれ).
- Greetings / mealtime / honorific fixed expressions (こんにちは / いただきます / よろしくお願いします) — emit a syn ONLY when a SAME-register equivalent fixed expression exists (e.g. ありがとう ↔ どうも at casual register).
- Punctuation tokens.
- Words whose only attested sense is highly technical/scientific with no everyday equivalent.

For these: return [] / []. Do not attempt; do not justify.
</empty_cases>

<antonym_rules priority="critical">
True antonyms are RARE. They exist mainly for:
- Gradable i-adjectives (熱い / 冷たい, 大きい / 小さい, 速い / 遅い, 嬉しい / 悲しい).
- Gradable na-adjectives (簡単 / 難しい, 便利 / 不便, 安全 / 危険).
- Directional / spatial pairs (上 / 下, 内 / 外, 前 / 後ろ, 右 / 左).
- A small set of action verbs (開ける / 閉める, 始める / 終わる, 買う / 売る, 勝つ / 負ける).
- A small set of state nouns (戦争 / 平和, 生 / 死, 成功 / 失敗).

Most nouns have NO antonym. Most concrete nouns (りんご / 机 / 本 / 川) have antonyms=[]. Most verbs have antonyms=[]. When in genuine doubt → [].
</antonym_rules>

<peer_group_antonym>
Members of finite semantic groups are PEERS, NOT antonyms.
- Seasons: ONE paired opposite each (春↔秋, 夏↔冬); no other pairings.
- Cardinal directions: ONE opposite each (北↔南, 東↔西).
- Weekdays / months / primary colors / numerals: NO antonym → [].
- When unsure: [].
</peer_group_antonym>

<verify_before_emit>
□ For EACH entry: would substitution preserve the meaning AND feel natural? If no → REMOVE.
□ For EACH entry: is it a hypernym / hyponym / topical associate / register-variant / derivative / inflected form? If yes → REMOVE.
□ Does the headword fall under <empty_cases>? If yes → both arrays MUST be [].
□ Antonyms: does the headword belong to a category where true antonyms exist? If no → antonyms = [].
□ Final pass: would I rather have a clean [] than a list with one shaky entry? YES → drop the shaky entries.
</verify_before_emit>`;

export function buildJaSynAntSystemPrompt(jaCase: JaCase): string {
  if (jaCase === "number_symbol") return JA_SYNANT_EMPTY_STATIC;
  return JA_SYNANT_DEFAULT_STATIC;
}

// ============================================================
// Per-case downstream-cap helpers
// ============================================================

export function getJaMeaningCap(_jaCase: JaCase): number {
  // Hard count caps replaced by MIN_RELEVANCE threshold (normalize.ts).
  // MAX_MEANINGS=5 acts as runaway safety net.
  return 5;
}

export function getJaSynAntCaps(jaCase: JaCase): { syn: number; ant: number } {
  switch (jaCase) {
    case "number_symbol": return { syn: 0, ant: 0 };
    case "set_expression": return { syn: 1, ant: 0 };
    case "verb_adj": return { syn: 3, ant: 2 };
    case "katakana_only": return { syn: 2, ant: 1 };
    case "single_kanji": return { syn: 1, ant: 1 };
    case "simple_word": return { syn: 3, ant: 2 };
  }
}

/**
 * Should the caller skip the syn/ant LLM call entirely for this case?
 * Returns true when both caps are 0 — no point spending a token.
 */
export function shouldSkipJaSynAnt(jaCase: JaCase): boolean {
  const { syn, ant } = getJaSynAntCaps(jaCase);
  return syn === 0 && ant === 0;
}
