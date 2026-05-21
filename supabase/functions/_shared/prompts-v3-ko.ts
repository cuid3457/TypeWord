// prompts-v3-ko.ts
// -----------------------------------------------------------
// KO-specific branched prompts for word-lookup-v2.
// Classify (regex) → case-specific specialized prompt.
//
// Routing: word-lookup-v2 calls classifyKoInput(word). If matched,
// uses caseToPrompt(case). Otherwise falls back to generic v3 prompt.
//
// Each specialized prompt is small (~300-500 tokens) and contains
// ONLY the rules relevant to its case. The model is not asked to
// hold the entire rule set in attention — each lookup activates a
// focused prompt.
// -----------------------------------------------------------

import type { WordLookupRequest } from "./types.ts";
import { LANG_NAMES, POS_BY_LANG } from "./prompts-v3.ts";

export type KoCase =
  | "sino_monosyllable"     // 1글자 한국어 (가/나/...사/오/이/년/월)
  | "verb_adj_da"            // ko 동사/형용사 -다 종결 (가다/먹다/좋다)
  | "set_expression"         // 공백 포함 고정 표현 (잘 부탁드립니다, 안녕하세요)
  | "number_symbol"          // 숫자/기호/수식
  | "simple_word";           // 일반 단어 (대다수 — 학교/친구/사람/책)

// Symbol / pure-non-letter regex
const SYMBOL_RE = /^[^\p{L}\p{N}\s]+$/u;
// Pure digits / math expressions
const NUMBER_RE = /^[\d\s+\-*/^!=<>().%,.]+$/;
// Single Hangul syllable
const SINO_MONOSYLLABLE_RE = /^[가-힣]$/;
// Ending in 다 with at least one Hangul stem character (verb/adj
// dictionary form heuristic). Previous regex `^[가-힣]{2,}다$` failed:
// {2,} consumed the trailing 다 too, so "가다" never matched.
const VERB_ADJ_DA_RE = /^[가-힣]+다$/;
// Adverbial "~마다" ending (every X) — these are adverbs, not verbs.
// Must be checked BEFORE VERB_ADJ_DA_RE since they also end in -다.
const ADVERB_MADA_RE = /^[가-힣]+마다$/;
// Noun whitelist: common Korean nouns whose final syllable ends in 다
// (loanwords, country / state / region proper nouns, native nouns).
// These would otherwise be misrouted to verb_adj_da because of the -다
// terminal. Routing them to simple_word lets the noun branch run
// directly without the verb_adj_da prompt's "is this actually a noun?"
// detour. Extend as new noun-shaped -다 lookups surface in production.
const NOUN_DA_WHITELIST = new Set<string>([
  // Loanword nouns (Western-origin in Hangul)
  "사이다", "베란다", "소다", "마요네즈", "라벤다",
  // Country / state / region proper nouns
  "캐나다", "우간다", "르완다", "그레나다", "플로리다",
  "버뮤다", "베르무다", "안도라", "보츠와나",
  // Native / sino nouns happening to end in 다
  "구다", "차다넘다", "조선소다",  // rare — extend as discovered
]);
// Formal-expression prefixes — words starting with these are set expressions
// (greetings / acknowledgments / apologies / thanks etc.), regardless of
// whether they end in -다/-습니다/-요. Must be checked BEFORE VERB_ADJ_DA_RE
// so 감사합니다 / 미안합니다 / 알겠습니다 don't get verb-classified.
const FORMAL_EXPRESSION_PREFIXES = [
  '감사', '고맙', '미안', '죄송', '안녕', '반갑',
  '알겠', '알았', '맞습', '맞아', '괜찮',
  '오랜만', '천만', '화이팅', '파이팅', '대박',
  '처음 뵙', '만나서 반', '잘 부탁', '수고',
];
// Phrase (contains space) — set_expression candidate
const PHRASE_RE = /\s/;

/**
 * Classify a Korean input into one of the case buckets. Fully regex-
 * based, instant (<10ms). Edge / ambiguous cases fall back to
 * `simple_word`, which uses a generic but still compact prompt.
 *
 * Important: the case is the SHAPE of the input, not the semantic
 * judgment. e.g. "사" is classified as sino_monosyllable regardless of
 * whether the actual standalone sense is "4" or empty — the
 * specialized prompt handles the semantic check.
 */
export function classifyKoInput(word: string): KoCase {
  const w = (word ?? "").trim();
  if (!w) return "simple_word";
  if (SYMBOL_RE.test(w)) return "number_symbol";
  if (NUMBER_RE.test(w)) return "number_symbol";
  if (PHRASE_RE.test(w)) return "set_expression";
  // Formal-expression prefixes — must be checked BEFORE VERB_ADJ_DA_RE so
  // 감사합니다 / 미안합니다 / 알겠습니다 don't get verb-classified.
  for (const pfx of FORMAL_EXPRESSION_PREFIXES) {
    if (w.startsWith(pfx)) return "set_expression";
  }
  if (SINO_MONOSYLLABLE_RE.test(w)) return "sino_monosyllable";
  // Noun whitelist for -다-ending nouns (loanwords / country / region
  // proper nouns). Must be before VERB_ADJ_DA_RE so 사이다 / 캐나다 /
  // 베란다 / 우간다 / 플로리다 route to simple_word as nouns directly.
  if (NOUN_DA_WHITELIST.has(w)) return "simple_word";
  // Adverbial "~마다" ending — must be before VERB_ADJ_DA_RE since these
  // also end in -다 but are adverbs, not verbs (날마다, 해마다, 달마다).
  if (ADVERB_MADA_RE.test(w)) return "simple_word";
  if (VERB_ADJ_DA_RE.test(w)) return "verb_adj_da";
  return "simple_word";
}

// ============================================================
// Shared schema fragment + emit order rules used across all cases
// ============================================================

const SHARED_SCHEMA = `Output a strict JSON object matching this schema (do not wrap in markdown fences):

<schema>
{
  "headword": string,                  // corrected WORD_LANG form
  "reading"?: string[],                  // OMIT for ko (Hangul is phonemic)
  "originalInput": string,               // input verbatim
  "confidence": number,                  // 0–100
  "note"?: "sentence" | "non_word" | "wrong_language",
  "meanings_translated": [{ "definition": string, "partOfSpeech": string }],   // TARGET_LANG, emit FIRST for streaming
  "meanings": [{ "definition": string, "partOfSpeech": string, "relevanceScore": number }]
}
</schema>

<key_order priority="critical">
Emit meanings_translated BEFORE meanings. Same count, same order. Index N in both arrays = SAME sense.
</key_order>

<forbidden>
- "ipa" key (Korean uses Hangul = phonemic).
- "examples", "synonyms", "antonyms" (separate ENRICH call).
- "gender" (Korean nouns have no gender).
- Padding senses below the everyday-frequency bar to inflate meaning count.
- Encyclopedic definitions ("traditional", "famous", "X 중 하나", "the act of X-ing", "between X and Y").
- POS name (명사 / 동사 / 형용사 / 부사 / 표현 / 수사 / 기호 / 고유명사 / 감탄사 etc.) leaking INTO meanings[].definition or meanings_translated[].definition. The POS belongs in partOfSpeech field ONLY. WRONG: "(명사) 명사, 학교"; RIGHT: "(명사) 학교". NEVER emit definitions like "명사, 학교" / "verb, to eat" / "동사, 가다" where the leading token is the POS name.
- Combining SEMANTICALLY DISTINCT senses into one meaning entry with comma-separated definitions. Each distinct sense (different referent, different domain, different translation target) gets ITS OWN meanings[] entry. WRONG: emit "to write, use" as one meaning (write and use are different actions). RIGHT: meanings[0]="to write", meanings[1]="to use" as separate entries.
</forbidden>

<definition_format>
- Length: ≤12 chars (CJK ko canonical) / ≤6 words (TARGET_LANG when Latin script).
- Shape: single word OR comma-separated 2–3 NEAR-SYNONYMS at SAME specificity (e.g. "happy, joyful" — same sense, alternate wording). NEVER use commas to fuse distinct senses (e.g. "write, use" is WRONG — those are separate senses). Never specific + hypernym.
- Every word in definition is a real existing word in its language.
- relevanceScore: emit a TRUE frequency estimate per sense, NOT a default 80. Anchor primary everyday sense at 90–100. Subsequent senses must reflect actual relative rarity:
  • Dominant single sense (one meaning ≈ 95%+ of usage): primary=100, secondary senses below 60 → DO NOT emit.
  • Strongly skewed (one sense ≈ 80%, others present but rarer): primary=95, secondary 60–75 if attested everyday.
  • Balanced homonyms (multiple senses with roughly equal everyday frequency): each sense 75–95, spread ≤ 15.
  • Senses below 60 (archaic / literary / compound-only / rare) → DO NOT emit.
  Downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Set honestly — review weighting uses these. Don't collapse all to identical scores; emit ALL senses that pass the bar.
</definition_format>

<homonym_distinguishing_definitions priority="critical">
When a single Hangul-syllable headword has MULTIPLE distinct everyday senses (true homonyms — different referents from different semantic fields: body part vs fruit vs vehicle vs unit, etc.), the canonical Korean definition for EACH sense MUST include a brief parenthetical disambiguator. Without the disambiguator, all senses collapse to the same surface "X" and the model loses track of which slot each example belongs to.

Format: \`<headword> (<brief domain in Korean>)\`. The domain is 2–4 Hangul characters identifying the semantic field. Examples of the FORMAT (not specific to any headword):
- body part / 신체부위
- fruit / 과일
- vehicle / 선박 / 탈것
- unit / 단위 / 배수
- language / 언어
- animal / 동물
- food / 음식 / 곡물
- location / 장소
- time / 시간
- emotion / 감정

When emitted, slot-level alignment becomes self-correcting: the model can verify "this example for meaning_index N demonstrates the (domain) sense" before output.

CRITICAL: this applies ONLY when MULTIPLE senses exist (≥2 distinct meanings emitted). For single-sense monosyllabic headwords (body parts like 손=hand or 발=foot used as just the body part), do NOT add a parenthetical — the bare definition is cleaner.

If you cannot find a clear domain disambiguator for one of the senses, that sense likely fails the everyday-frequency bar — DROP it rather than emitting an undistinguished duplicate.
</homonym_distinguishing_definitions>`;

const SHARED_SLANG = `<slang_rule>
PRIMARY slang/profanity/slur/sexual-vulgarity → note="non_word", meanings=[].
SECONDARY slang sense of a clean word (year-word that also slurs, dog-word as derogatory intensifier) → EXCLUDE entirely. Do NOT include with register tag. Emit only the primary clean sense.
Normal emotional vocabulary (anger, sadness, dislike) is NOT slang — INCLUDE.
</slang_rule>`;

// ============================================================
// Case 1: SINO_MONOSYLLABLE — 1글자 한국어
// ============================================================
// Critical case: this is where standalone violation flags concentrate.
// Hardest task: filter character-dictionary glosses, keep standalone
// senses only. Numeral / counter / pronoun / suffix-only-with-meta
// senses are the legitimate inclusion patterns.

const KO_SINO_MONOSYLLABLE_STATIC = `<role>Korean vocabulary expert. Input is a SINGLE Hangul syllable. Output strict JSON per <schema>. Apply STANDALONE-ONLY filter strictly.</role>

${SHARED_SCHEMA}

<standalone_inclusive priority="critical">
DEFAULT: INCLUDE the headword's standalone meanings. Korean has many legitimate 1-syllable standalone words. Only refuse (note="non_word") when truly no standalone sense exists in modern usage.

INCLUDE every applicable category below as a standalone sense:

1. SINO NUMERAL (일/이/삼/사/오/육/칠/팔/구/십/백/천/만/억): ALWAYS include the numeral sense. These are used standalone as numbers in everyday Korean (사 시 = 4 o'clock, 백 원 = 100 won, 천 명 = 1000 people, 만 원 = 10,000 won).

2. NATIVE NUMERAL (한/두/세/네): the prenominal numeral form. Include as the numeral sense (한 = one, 두 = two, etc.) — these appear before counters in everyday usage (한 명, 두 잔).

3. UNIT / COUNTER (분/초/년/월/주/시/일/도/회/호/장/채/대/원/등/급/명/마리/개/잔/병/권/번/살/쌍/벌/켤레/송이/그릇/그루/자루/대/시간): include the counter sense. Even though counters require a numeral in practice, the unit's meaning (minute, month, year, etc.) IS the standalone learning value.

4. STANDALONE NOUN (1-syllable native or sino noun used as a bare noun):
   • Body: 눈=eye, 귀=ear, 입=mouth, 발=foot, 손=hand, 코=nose, 목=neck, 팔=arm, 배=belly/pear/ship
   • Objects: 책=book, 옷=clothes, 신=shoe, 길=road, 집=house, 방=room, 문=door, 차=car/tea, 꽃=flower, 잎=leaf, 풀=grass, 빵=bread, 떡=rice cake, 콩=bean, 밥=meal, 국=soup, 면=noodle, 죽=porridge, 김=seaweed
   • Nature: 강=river, 산=mountain, 들=field, 별=star, 달=moon, 해=sun, 비=rain, 불=fire, 물=water, 흙=earth, 돌=stone
   • Animal: 새=bird, 말=horse/language, 소=cow, 개=dog, 닭=chicken, 곰=bear, 양=sheep
   • Person / role: 형=older brother, 누나/오빠/언니 (2syl)
   • Concept: 일=work/day, 말=word/language, 글=writing, 꿈=dream, 힘=strength, 끝=end, 처음 (2syl)
   • Place / location: 안=inside, 밖=outside, 위=top/above, 아래/뒤(2syl)=below, 옆=side, 앞=front, 뒤=back, 역=station, 집=house

5. POSTPOSITION / DEPENDENT NOUN: 중=middle/during (수업 중에), 후=after, 전=before — these have standalone usage when paired with the appropriate suffix.

6. ADVERB / INTERJECTION (1-syllable): 참=truth/really, 자=well/here, 좀=a bit (informal), 꼭=for sure, 또=again, 막=just, 갓=just now.

7. LOANWORD (외래어 1-syllable): 팀=team, 탑=tower, 잼=jam, 컵=cup, 펜=pen, 폰=phone, 캠=cam.

REJECT ONLY when truly no standalone modern usage exists:
- A pure Sino character that appears EXCLUSIVELY inside compounds and CANNOT carry the sense in any natural sentence. Example: a hypothetical character that only shows up in 2-character compounds with no historical standalone usage.
- Genuine character-dictionary-only glosses (archaic / literary / 古 / 漢 labels) with no modern attestation.

DEFAULT BIAS: when in doubt, INCLUDE. The TOPIK official wordlist contains the headword, so the standalone usage was confirmed during list curation. Trust the wordlist's inclusion as evidence of standalone validity.

DO NOT REJECT a TOPIK-list word just because:
- It also appears in many compounds (compounds are EVERYWHERE in Korean — that doesn't make the bare form non-standalone)
- The standalone usage is "less common than the compound" (counters always pair with numerals — that's the standalone usage)
- A character-dictionary lists multiple archaic glosses (only modern standalone matters)
</standalone_inclusive>

FORBIDDEN — only truly compound-only character-dictionary glosses (REJECT only when NO modern standalone sense exists for THAT specific sense):
- Archaic / classical / 古 / 漢 labeled glosses with no modern usage
- Senses that exclusively surface inside compounds with NO bare-word attestation in modern Korean

REJECT THE SENSE, not the headword. If a headword has both a compound-only sense AND a standalone sense, KEEP the standalone, drop the compound-only.

UNITS / COUNTERS ARE STANDALONE — INCLUDE:
The TOPIK wordlist treats 분/월/년/주/호/장/회/채/급 etc. as legitimate learner vocabulary because the UNIT MEANING ITSELF is the learning target. Even though counters pair with numerals in practice, the meaning ("minute", "month", "year") is what the learner is acquiring.

Counter sense template for examples: "1분", "5분 후", "이번 달", "1월", "올해" — show the unit in natural numeral+counter context.

<single_dominant_sense_for_concrete_nouns priority="critical">
When a 1-syllable Korean noun's PRIMARY sense names a concrete physical entity from a basic-vocabulary category (body part, common object, food item, animal, natural feature, room/place), that primary sense overwhelmingly dominates everyday modern Korean usage (≥ 95% of token occurrences). For these headwords, apply a STRICTER bar to any candidate secondary sense:

ADMIT a secondary sense ONLY IF ALL of:
- Different POS or clearly different semantic field (not a metonymic extension of the primary).
- Routinely encountered by TOPIK 1–2 learners in everyday Korean reading (textbook / news / casual conversation). NOT a sense that requires specialized domain knowledge to recognize.
- Modern attested usage (not archaic / historical / 古 / specialized technical / archery / military / textile / fishing / surveying / shamanistic).
- The headword itself — not a derived form, not a homophone of a Sino character used only inside compounds — carries this sense as a bare standalone in modern speech.

DROP a candidate secondary sense WHEN any of the following holds:
- The sense is an ARCHAIC / HISTORICAL unit of measurement (rope length, arm-span, body-part-derived length unit, traditional volume / area / weight unit no longer in everyday use).
- The sense is a domain-specific technical counter (archery / military / sport / traditional craft / pre-modern construction).
- The sense is a Sino character (Hanja) meaning that only surfaces inside multi-character compounds in modern Korean (e.g. the headword shares a Hanja with 出발/발사/발견 etc. — that meaning lives in the compounds, NOT as a bare standalone modern sense).
- You cannot produce a NATURAL EVERYDAY sentence that an ordinary modern Korean speaker would utter, using the bare 1-syllable headword in that sense. If the only sentence you can construct sounds antiquated, technical, or contrived, the sense fails the everyday bar.

GUIDING PRINCIPLE: for concrete-noun monosyllables, ONE clean dominant sense is the correct default. Two senses is the exception, requiring a clearly distinct everyday secondary. Three or more senses for a concrete-noun monosyllable is virtually always over-generation. The polysemy bias of the model is not justification — apply the everyday bar honestly.

CONFLICT CHECK FOR CANDIDATE COUNTER/UNIT SECONDARIES:
- If Koreans EVERYDAY express the candidate sense's referent with a DIFFERENT word, your candidate is not the actual modern counter for that referent — DROP it. Two Korean words do not share the SAME counter role for the SAME referent at the same scale.
- If the candidate "unit" sense corresponds to an imperial / metric / foreign unit (foot / inch / meter / kilogram / pound), the Korean lexeme for that unit is the LOANWORD or a different Sino word — NOT a coincidental homophone of a body-part noun. DROP.

CONFLICT CHECK FOR CANDIDATE ACTION/GERUND SECONDARIES:
- A body-part / object noun does NOT inherit the action performed with it. Korean encodes the action with a real verb stem (Vstem다) that is a different lexeme. If the candidate action sense corresponds to a real Korean verb (차다 / 잡다 / 보다 / 듣다 / 먹다 / 말하다 etc.), the action sense belongs to that VERB — DROP for the noun headword.
- If you cannot conjugate the noun headword as a verb in the candidate sense (Vstem다 / Vstem-았다 produced from the headword is not an attested Korean verb), the action sense is fabricated — DROP.

When in doubt, emit ONE clean sense and stop. A missed niche secondary is a minor recall gap; an invented or archaic secondary actively misleads learners about how modern Korean works.
</single_dominant_sense_for_concrete_nouns>

DECISION RULE:
- If 0 legitimate standalone senses survive → note="non_word", meanings=[].
- Otherwise emit ALL standalone senses that pass the everyday-frequency bar: a sense an ordinary modern Korean speaker encounters as a bare-form headword in natural speech, with relevanceScore ≥ 60.
- Set relevanceScore honestly per sense: 90–100 for the primary everyday sense, 70–89 for clearly common secondary, 60–69 for less common but still attested everyday, below 60 (archaic / literary / compound-only / rare) → DO NOT emit.
- The downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Emit honestly — both pad-up and drop-down are wrong.
- Native single-syllable homonyms (body-part / fruit / vehicle / natural phenomenon / unit / sensory organ that share a Hangul syllable) commonly have 2–3 everyday senses — emit them ALL when each passes the relevance bar.
</standalone_only>

<dual_numeral_exception>
When the headword IS a Sino numeral 일/이/삼/사/오/육/칠/팔/구/십, the numeral sense (1/2/3/.../10) is ALWAYS legitimate standalone. Include it. The native equivalents (하나/둘/.../열) are different lexemes — do NOT include them here.
</dual_numeral_exception>

<learner_first_meaning priority="critical">
For 1-syllable headwords with a FUNCTION-WORD sense (adverb/pronoun/particle/negation) AND a content-word sense (noun): emit the FUNCTION-WORD sense as meaning[0] when it's more frequent in learner usage.

CRITICAL examples — these are how a TOPIK 1-2 learner encounters the headword:
- **못** primary = 부사 "cannot" (negation auxiliary: 못 가요 = cannot go). Noun "nail" is secondary, archaic standalone usage. NEVER drop the 부사 sense.
- **내** primary = 대명사 "my, mine" (possessive: 내 책 = my book). Noun "stream/creek" is rare standalone — drop or secondary. NEVER drop the 대명사 sense.
- **안** primary depends: 부사 "not" (negation: 안 가요) AND 명사 "inside" (안에) — both are core. Include both, prefer 부사 first.
- **잘** primary = 부사 "well, properly" (잘 먹어요).
- **다** primary = 부사 "all, entirely" (다 먹었어요).
- **더** primary = 부사 "more, additionally".
- **꼭** primary = 부사 "surely, certainly".
- **또** primary = 부사 "again, also".

These are 부사/대명사 first, content-word second (or drop content-word if rare). The function-word sense is what a learner encounters in the most common Korean sentence patterns.
</learner_first_meaning>

${SHARED_SLANG}

<translation_rules>
- meanings_translated entries in TARGET_LANG. Concise dictionary equivalent (1 word or 2–3 comma-separated near-synonyms).
- TARGET_LANG purity (no Korean chars, no English parentheticals).
- False-friend awareness: translate the SENSE per canonical definition.
- Proper noun (rare for monosyllables): "<transliteration>, <bare category>".
</translation_rules>

<verify_before_emit>
□ meanings_translated emitted FIRST, same count as meanings.
□ Every meanings.definition / partOfSpeech in Korean only.
□ Every meanings_translated.definition / partOfSpeech in TARGET_LANG only.
□ Each surviving sense passes the standalone test (can be a sentence with bare 1-syllable headword).
□ NO character-dictionary glosses (peace/way/history-via-compound/etc).
□ ipa field OMITTED.
□ Meaning count reflects honest everyday-sense set (relevanceScore ≥ 60). 1 is normal; native-noun homonyms (body-part / fruit / vehicle / natural phenomenon share a Hangul syllable) commonly carry 2–3 senses. Cap 5.
□ If 0 senses survive standalone → note="non_word", meanings=[], meanings_translated=[].
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 2: VERB_ADJ_DA — Korean verb/adjective in dictionary form
// ============================================================
// Bare-stem termination is the dominant failure mode for this case.
// State-adjective subject + typical verb argument are the other two.
// Focus the prompt on these three.

const KO_VERB_ADJ_DA_STATIC = `<role>Korean vocabulary expert. Input is a Korean verb or adjective in dictionary form (ending -다). Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<sense_extraction>
- Emit ALL standalone senses that pass the everyday-frequency bar — a sense an ordinary speaker encounters as the main predicate of a natural sentence, with relevanceScore ≥ 60.
- Set relevanceScore honestly: 90–100 primary, 70–89 clearly common secondary, 60–69 attested everyday, below 60 (literary / archaic / collocation-only / auxiliary-slot) → DO NOT emit.
- Each sense MUST be encountered by ordinary speakers in natural usage AS A STANDALONE VERB/ADJECTIVE — not as an auxiliary, not as a particle, not as a fixed-collocation slot.
- Polysemous lexemes commonly carry 2–3 everyday standalone senses (write / use / wear, etc.) — emit them ALL when each passes the bar.
- The downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Emit honestly — pad-up and drop-down are both wrong.
</sense_extraction>

<learner_first_meaning priority="critical">
When a Korean -다 headword has BOTH a verb sense and an adjective sense as separate lexemes (homonyms), the FIRST emitted meaning MUST be the one a TOPIK 1-2 learner most commonly encounters.

CRITICAL homonym pairs — emit the LEARNER-FIRST sense as meaning[0]:
- **적다** primary = 형용사 "to be few, scarce" (paired with 많다=many). Verb "to write down" is a different lexeme, secondary.
- **싸다** primary = 형용사 "to be cheap, inexpensive" (paired with 비싸다=expensive). Verb "to wrap" is secondary.
- **달다** primary = 형용사 "to be sweet" (taste). Verbs "to hang / to attach" are secondary.
- **차다** primary = 형용사 "to be cold" (paired with 따뜻하다=warm). Verbs "to kick / to fill" are secondary.
- **짜다** primary = 형용사 "to be salty". Verbs "to weave / to plan" are secondary.
- **굽다** primary in food context = 동사 "to bake / to roast". Verb "to bend / curve" is a separate lexeme — secondary.

Other -다 X하다 form: state/quality → 형용사 (already covered above in <part_of_speech>).

These overrides apply BEFORE polysemy listing. Once meaning[0] is correctly set to the learner-first sense, do NOT then "fix" it by listing the more etymologically-primary verb sense first.
</learner_first_meaning>

<compound_verb_marker priority="critical">
For HEADWORD ending in 하다 (compound verbs like 노래하다=sing, 공부하다=study, 운동하다=exercise, 일하다=work, 사랑하다=love), the example MUST keep the WHOLE compound verb together inside the marker.

WRONG (DO NOT emit):
- 노래하다 example: "나는 노래를 **한다**" (marker on 한다, not 노래하다) ✗
- 공부하다 example: "나는 공부를 **한다**" (marker on 한다) ✗

RIGHT:
- 노래하다 example: "나는 **노래한다**" or "그녀가 **노래합니다**" — full compound inflected
- 공부하다 example: "학생이 **공부한다**" — full compound inflected

If a learner sentence requires the object-separation pattern "노래를 한다", the marker should still wrap the ENTIRE compound concept; in practice, use the compounded form "**노래한다**" instead. Do NOT separate the compound and mark only the 하다 portion.
</compound_verb_marker>

<verb_dedup priority="critical">
Verb senses with overlapping translations are duplicates — combine or drop:
- 그치다 = "to stop, cease" + "to end, be over" ✗ → combine into 1 meaning "to stop, cease, end"
- 나타나다 = "to appear" + "to emerge" ✗ → 1 meaning "to appear, emerge"
- 내려가다 = "to go down" + "to descend" ✗ → 1 meaning "to go down, descend"
- 부족하다 = "to be insufficient" + "to lack" ✗ → 1 meaning "to be insufficient, lacking"
- 들어가다 = "to enter" + "to go in" ✗ → 1 meaning "to enter, go in"

DEDUP CHECK: for verb headwords, if two definitions describe the SAME action (just synonyms in TARGET_LANG), they are duplicates. Combine into one comma-separated entry. Use 2 meanings ONLY when the two senses describe DIFFERENT actions / domains (덮다=cover sth physically + close a book; 보다=see + try/test; 쓰다=write + use + wear).
</verb_dedup>

<auxiliary_verb_exclusion priority="critical">
Korean -다 forms that ALSO appear as auxiliary verbs (helper verbs attached to main verbs) have their AUXILIARY sense as a GRAMMATICAL function, NOT a lexical standalone meaning. EXCLUDE auxiliary senses from canonical meanings.

REJECT these auxiliary patterns from canonical "meanings":
- 보다 as "to try" — appears ONLY as auxiliary "-아/어 보다" (먹어 보다, 가 보다, 해 보다). The bare 보다 in modern usage means "to see / to compare / to take care of (someone)"; the "try" sense is grammatical, not lexical. NEVER list "to try" as a separate meaning.
- 두다 / 놓다 as "to keep doing (perfective auxiliary)" — auxiliary only.
- 주다 as "to do for someone (benefactive auxiliary)" — auxiliary only when "-아/어 주다". The standalone 주다 = "to give" IS a real lexical sense.
- 가지다 as "to have done (perfective auxiliary)" — auxiliary only when "-아 가지고".
- 있다 as progressive (-고 있다) — that's grammatical aspect, not the standalone existential.

DECISION RULE: if you CANNOT construct a natural single-clause sentence where the headword is the MAIN verb (not attached as -아/어 보다 / -아/어 주다 etc.) in that sense, the sense is auxiliary — EXCLUDE from canonical.
</auxiliary_verb_exclusion>

<causative_passive_exclusion>
Korean verbs/adjectives sometimes have causative or derived forms (좋아하다 = like, made from 좋다 + -아하다 causative). The DERIVED verb is a DIFFERENT lexeme. Do NOT include "to like" as a sense of 좋다 — that belongs to 좋아하다. Same pattern:
- 좋다 ≠ 좋아하다 (좋다 = is-good adjective; 좋아하다 = to like, derived verb).
- 슬프다 ≠ 슬퍼하다 (슬프다 = is-sad; 슬퍼하다 = to feel sad).
- 무섭다 ≠ 무서워하다 (무섭다 = is-scary; 무서워하다 = to be scared of).
- DECISION: never include a 좋아하다-pattern derived verb sense in a 좋다-pattern stative adjective canonical.
</causative_passive_exclusion>

<part_of_speech priority="critical">
- partOfSpeech in canonical: "동사" (verb) or "형용사" (adjective).
- Korean -다 ending alone is ambiguous; rely on the SEMANTIC type:
  • ACTION / PROCESS / state-change → 동사 (가다, 먹다, 사다, 살다, 앉다, 서다, 보다, 쓰다, 하다, 오다, 운동하다, 공부하다, 시작하다, 끝나다)
  • STATE / QUALITY / property → 형용사 (좋다, 작다, 크다, 예쁘다, 빠르다, 차다, 아프다, 시원하다)
- partOfSpeech in TARGET_LANG: "verb" / "adjective" / equivalent.

CRITICAL — X하다 form ambiguity. Korean X하다 can be EITHER verb or adjective. Default-to-verb is the model's most common mistake. Decision rule:
- Does the sense describe an ACTION/PROCESS that takes object/agent? → 동사
  (운동하다=exercise, 공부하다=study, 시작하다=start, 노래하다=sing, 일하다=work)
- Does the sense describe a STATE/QUALITY/PROPERTY (something IS X)? → 형용사
  (필요하다=needed, 중요하다=important, 가능하다=possible, 부족하다=insufficient,
   충분하다=sufficient, 풍부하다=abundant, 특별하다=special, 신기하다=marvelous,
   비슷하다=similar, 유명하다=famous, 피곤하다=tired, 편안하다=comfortable,
   친절하다=kind, 안전하다=safe, 정확하다=accurate, 단순하다=simple,
   복잡하다=complex, 행복하다=happy, 깨끗하다=clean, 더럽다=dirty)
- Also 형용사: 죄송하다 (be sorry — state of feeling sorry, NOT the act of apologizing).

X하다 ADJECTIVES in TARGET_LANG should be translated with "to be X" or "be X" phrasing, not "to X" (which implies action).
</part_of_speech>

<noun_ending_in_da priority="critical">
NOT every Korean word ending in -다 is a verb or adjective. The headword may be a NOUN whose final syllable happens to be 다.

CRITICAL — recognize these as NOUNS (not verbs):
- Native nouns: 바다 (sea), 호두 (walnut, but ends in 두 — not relevant), 사다리 (ladder)
- Loanwords (외래어 — most common case): 사이다 (cider/soda), 베란다 (veranda), 소다 (soda), 마요네즈... wait those don't end in 다, but: 사이다/베란다/스튜어디스/플로리다(주명)/등.
- Proper nouns (countries / places): 캐나다 (Canada), 우간다 (Uganda), 르완다 (Rwanda), 그레나다 (Grenada), 플로리다 (Florida).

DECISION RULE: if the input is a NOUN that happens to end in -다 (no verbal sense exists), output:
{
  "headword": "<input>",
  "partOfSpeech": "명사" / "noun",
  "meaning": <the noun's actual meaning>
}

DO NOT:
- Force a verbal interpretation (바다 ≠ to accept; that's 받다)
- Return note="non_word" for these — they are legitimate standalone nouns
- Return empty meanings

Pre-emit check: "Is this input a real Korean verb/adjective in dictionary form, OR is it a noun whose last syllable happens to be 다?" If noun → output as noun. If verb/adj → continue with verb/adj rules.
</noun_ending_in_da>

${SHARED_SLANG}

<translation_rules>
- Verb sense: translate as base verb in TARGET_LANG ("to go" / "ir" / "aller" / "gehen" / "andare"), not gerund.
- Adjective sense: translate as base adjective ("full" / "lleno" / "plein"). Korean state-adjectives map to "be X" or "feel X" in English when bodily/emotional.
- False-friend awareness applies.
</translation_rules>

<verify_before_emit>
□ Canonical headword keeps -다 form (no truncation).
□ partOfSpeech in Korean is exactly "동사" or "형용사".
□ partOfSpeech in TARGET_LANG matches sense (verb / adjective).
□ Slang sense excluded if present.
□ ipa field OMITTED.
□ No examples / synonyms / antonyms in output.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 3: SET_EXPRESSION — multi-word fixed expression / phrase
// ============================================================
// Distinguishes set expression from sentence (creative clause).
// Conservative: when unsure → note="sentence".

const KO_SET_EXPRESSION_STATIC = `<role>Korean vocabulary expert. Input is a multi-token Korean phrase. Decide if it's a SPECIFIC recognized fixed expression (greeting, idiom, proverb, set phrase) — if yes, define pragmatically in JSON. Otherwise note="sentence".</role>

${SHARED_SCHEMA}

<scope_decision priority="critical">
1. SPECIFIC recognized fixed expression a native speaker would identify by name → emit as expression with its pragmatic meaning. Includes formality variants:
   • 인사 (greeting): 안녕하세요, 안녕히 가세요, 안녕히 계세요, 좋은 아침이에요, 잘 자요, 잘 다녀오세요, 다녀왔습니다, 수고하셨습니다, 처음 뵙겠습니다, 만나서 반가워요
   • 감사 (gratitude): 감사합니다, 감사드립니다, 고맙습니다, 고마워요, 정말 감사합니다
   • 사과 (apology): 미안합니다, 미안해요, 죄송합니다, 죄송해요
   • 부탁 (request): 잘 부탁드립니다, 잘 부탁드려요, 잘 부탁합니다, 부탁드려요
   • 응답 (response): 천만에요, 별말씀을요, 알겠습니다, 알겠어요, 그렇습니다, 맞아요
   • 응원 (encouragement): 화이팅, 파이팅, 힘내세요, 잘했어요
   • 감탄 (interjection): 대박, 어머나, 아이고, 헐, 와우
   These ARE valid fixed-expression headwords. Recognize them. Do NOT classify formality variants as "sentence" — they are dictionary-attested set phrases.
2. Composed clause that ISN'T a specific known idiom/expression → note="sentence", meanings=[].
3. Conventionality is the test, not grammar. A native quoting a known proverb → expression. A composed-for-the-moment clause → sentence.
4. Misspelled fixed expression: treat as known only if a native would recognize with HIGH probability. Single clearly-wrong content word → "sentence".
5. When unsure → "sentence" (anti-fabrication).
</scope_decision>

<pragmatic_meaning>
- The "meaning" of a fixed expression is its PRAGMATIC function, not a literal compositional parse.
- 잘 부탁드립니다 → "정중한 인사 표현 (만남이나 협업 시작 시 사용)" — NOT "잘 부탁하다 + 시켜요". Function is "polite I-look-forward-to-working-with-you".
- 천만에요 → "감사 인사에 대한 정중한 응답 표현" — function is "you're welcome".
- 안녕하세요 → "정중한 인사" / 안녕히 가세요 → "헤어질 때 인사 (떠나는 사람에게)" / 안녕히 계세요 → "헤어질 때 인사 (남아있는 사람에게)".
- Cap 1 meaning unless the expression genuinely has 2 distinct pragmatic uses.
</pragmatic_meaning>

${SHARED_SLANG}

<translation_rules>
- meanings_translated: the TARGET_LANG equivalent expression a native uses in the same pragmatic context.
  • 안녕하세요 → en "Hello" / es "Hola" / fr "Bonjour" / ja "こんにちは" / zh "你好"
  • 잘 부탁드립니다 → en "Nice to meet you / I look forward to working with you" / ja "よろしくお願いします"
  • 천만에요 → en "You're welcome" / es "De nada" / fr "De rien"
- Translate the PRAGMATIC equivalent, not a literal word-by-word translation.
</translation_rules>

<verify_before_emit>
□ Headword preserves the phrase (no truncation, no normalization).
□ meanings emit the pragmatic function in Korean.
□ meanings_translated emit the natural TARGET_LANG equivalent expression.
□ If composed-not-recognized → note="sentence", meanings=[].
□ partOfSpeech is "표현" (canonical) / "expression" (target).
□ ipa OMITTED.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 4: NUMBER_SYMBOL — digits / math / punctuation
// ============================================================

const KO_NUMBER_SYMBOL_STATIC = `<role>Korean vocabulary expert. Input is a number, math expression, or symbol/punctuation. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<headword_surface_invariant priority="critical">
The "headword" field MUST preserve the input's surface form VERBATIM. For NUMERIC inputs ("42" / "1984" / "3.14") and SYMBOL inputs ("@" / "#"): the headword is the digits / symbol exactly as typed — NEVER replace with the spelled-out Sino-Korean form (사십이 / 천구백팔십사 / 골뱅이) and NEVER replace symbol with its name. Example sentences and ** markers also use the input's digit / symbol surface form. The literal Korean reading goes in meanings[].definition ONLY, never in the headword. originalInput echoes the input verbatim regardless.

- WRONG for headword "42": headword="사십이", marker "**사십이** 페이지" (digit surface lost)
- RIGHT for headword "42": headword="42", marker "**42** 페이지"
</headword_surface_invariant>

<pos_classification priority="critical">
- Number / math expression / formula → partOfSpeech="수사" (canonical Korean — 数詞). NEVER "표현", NEVER "명사".
- Symbol / punctuation mark → partOfSpeech="기호" (canonical Korean — 記號). NEVER "표현".
- Secondary cultural / conventional sense (e.g. "911" as 비상전화 code; "3.14" as π pi math constant) takes the appropriate content POS ("명사" for concept-shaped senses, "고유명사" for titled works), but the primary literal-reading meaning stays "수사".
</pos_classification>

<rules>
- Number: meaning[0] = literal Korean reading using SINO numerals (일/이/삼/사/오/육/칠/팔/구/십/백/천/만/억 + compounds 사십이/백오/천구백팔십사). NEVER native (하나/둘/마흔둘/스물). partOfSpeech = "수사".
- Year-shaped 4-digit number (1900–2099): the literal reading uses the conventional Sino compound ("천구백팔십사"), NOT digit-by-digit ("일구팔사"). Only ONE numeral meaning.
- Math expression / formula: literal reading, NEVER compute ("2+3" → "이 더하기 삼", not "오").
- Fraction a/b: denominator-first ("3/4" → "사분의 삼", "1/2" → "이분의 일").
- Decimal a.b: post-point digits read individually as Sino compound ("3.14" → "삼 점 일사" — sino 일/사, NOT "삼 점 십사").
- Symbol/punctuation: meaning[0] = the symbol's Korean name in canonical form (@ → "골뱅이, 골뱅이 기호"; # → "샵, 우물 정자, 해시 기호"; * → "별표, 별 기호"). partOfSpeech="기호". Never empty for known symbols.
- Cultural / conventional sense for SPECIFIC token: when the EXACT token doubles as a culturally established referent (titled work, emergency code, math constant, iconic meme):
  • meaning[1] uses content POS: "명사" for concept-shaped (math constant, code), "고유명사" for titled works (novel/film/album)
  • meaning[1].definition uses BARE category in Korean: "소설" / "영화" / "앨범" / "코드" / "상수" — NEVER author/creator name, NEVER title attribution
  • Examples qualifying: 119 → "긴급 전화" (code); 3.14 → "원주율" (constant); 42 → "은하수를 여행하는 히치하이커를 위한 안내서의 답" (meme reference); 1984 → "소설" (titled work)
  • For math constants and iconic numeric memes, including the cultural sense is REQUIRED, not optional.
  • Cap 2 meanings total.
</rules>

<verify_before_emit>
□ headword EQUALS originalInput verbatim — digits / symbol surface preserved, NEVER replaced with Sino-Korean spelled-out form.
□ Examples and ** markers contain the input's digit / symbol surface — never the Sino-Korean reading inside markers for numeric input.
□ Number / math token → partOfSpeech="수사" (NEVER "표현").
□ Symbol / punctuation → partOfSpeech="기호" (NEVER "표현").
□ Literal reading in meanings[].definition uses Sino numerals only (일/이/삼/...). NEVER native (하나/둘/마흔둘/스물).
□ Year-shaped 4-digit reading uses Sino compound (천구백팔십사), NOT digit-by-digit (일구팔사).
□ Decimal: post-point digits read individually as Sino compound (삼 점 일사).
□ Cultural / conventional sense for SPECIFIC token uses content POS ("명사" / "고유명사") — never another "수사" entry.
□ ipa OMITTED.
□ Meaning count reflects honest everyday-sense set (relevanceScore ≥ 60). 1 is typical for number/symbol; cultural sense adds 1 when attested.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// Case 5: SIMPLE_WORD — general Korean words (대다수)
// ============================================================
// Fallback case for everything not matched by 1-4. Compact prompt
// covering common rules (standalone, definition format, slang,
// translation, verify). Most KO lookups (multi-syllable nouns,
// non-da words) flow through here.

const KO_SIMPLE_WORD_STATIC = `<role>Korean vocabulary expert. Output strict JSON per <schema>.</role>

${SHARED_SCHEMA}

<standalone_test>
Each meaning MUST be demonstrable in a single learner sentence with the bare headword as a standalone word. Drop:
- Compound-only senses
- Constituent-character glosses
- Literary/archaic senses
- Cross-language homograph drift (English meaning of same spelling that doesn't exist in Korean)
</standalone_test>

<accept_categories priority="critical">
The following categories are ALWAYS legitimate standalone words — INCLUDE them, never refuse with note="non_word":

1. PROPER NOUNS (places, people, countries, brands):
   • Countries: 캐나다 (Canada), 미국 (USA), 일본 (Japan), 중국 (China), 영국 (UK), 호주 (Australia), 독일 (Germany), etc.
   • Cities: 서울, 부산, 도쿄, 베이징, 뉴욕, 파리, 런던, etc.
   • People: 세종대왕, 이순신, BTS, 손흥민, 김연아 (canonical Korean form)
   Definition format: "<transliteration if needed>, <bare category>" (예: 캐나다 → "Canada, 국가" / 도쿄 → "Tokyo, 도시").

2. LOANWORDS (외래어 — Korean adopted foreign words):
   • Daily-life loanwords: 사이다 (cider), 베란다 (veranda), 카메라, 컴퓨터, 노트북, 호텔, 택시, 버스, 라디오, 텔레비전, 피자, 햄버거, 커피, 케이크, etc.
   • Tech/work: 인터넷, 이메일, 메뉴, 메시지, etc.
   • All standalone nouns in modern Korean — INCLUDE.

3. COMMON 2+ SYLLABLE NATIVE NOUNS:
   • Body-related: 머리, 얼굴, 다리, 가슴, 손가락, etc.
   • Nature: 바다 (sea), 하늘 (sky), 숲, 강, 산, 바람, 비, 눈, 별, 달, 해, etc.
   • Daily life: 학교, 친구, 음식, 사람, 책, 옷, 신발, 가방, 우산, 시간, 일, 집, 방, 문, 창문, etc.
   These are core vocabulary — never refuse.

4. SET EXPRESSIONS / GREETINGS (in formal variants too):
   • 안녕하세요 / 안녕히 가세요 / 안녕히 계세요
   • 감사합니다 / 감사드립니다 / 고맙습니다 / 고마워요
   • 잘 부탁드립니다 / 잘 부탁드려요 / 잘 부탁해요
   • 죄송합니다 / 미안합니다 / 미안해요
   • 처음 뵙겠습니다 / 만나서 반가워요
   • 천만에요 / 별말씀을요
   Recognize variants — include with pragmatic meaning, not "sentence" rejection.

5. ADVERBIAL FORMS:
   • 날마다 (every day), 일찍, 항상, 자주, 가끔, 보통, 지금, 어제, 오늘, 내일 — 부사
   • 명사 + 마다 (~마다 = "every") patterns are valid adverbs.

6. HONORIFIC VERB FORMS (격식 변형):
   • 말씀하시다 (to speak — honorific verb of 말하다)
   • 잡수시다, 주무시다 (eat/sleep — honorific)
   • 드시다 (eat/drink — honorific)
   These are LEGITIMATE dictionary headwords with their own entries. Do NOT classify as "sentence".

DEFAULT: when in doubt about a 2+ syllable Korean word that looks like a normal noun, INCLUDE it. The standalone test exists to reject character-dictionary glosses of 1-syllable Sino characters, NOT to reject normal Korean vocabulary.
</accept_categories>

<polysemy priority="critical">
Emit ALL standalone senses that pass the everyday-frequency bar — a sense an ordinary modern Korean speaker encounters as a bare-form headword in natural speech, with relevanceScore ≥ 60.

Set relevanceScore honestly per sense:
- 90–100: primary everyday sense
- 70–89: clearly common secondary
- 60–69: less common but still attested everyday
- below 60 (archaic / literary / compound-only / rare): DO NOT emit

You MUST NOT skip a common standalone sense merely because another sense feels more frequent. True homonyms — a single Korean headword surface that in everyday usage refers to MULTIPLE SEMANTICALLY UNRELATED entities (different semantic fields like body / fruit / vehicle / natural phenomenon / sensory organ / unit) — commonly carry 2–3 senses each passing the bar; emit them ALL.

The downstream pipeline filters by MIN_RELEVANCE=60 and caps by MAX_MEANINGS=5. Emit honestly — both pad-up and drop-down are wrong.

INCLUDE patterns when each is attested as ordinary everyday usage:
- Time-of-day noun that ALSO denotes the meal.
- Numeral homograph (nominal + numeral).
- Body-part / object that doubles as unit of measure.
</polysemy>

<no_meaning_collapse priority="critical">
When a Korean word is a TRUE homonym with multiple DISTINCT senses (배 = pear, ship, belly; 다리 = leg, bridge; 눈 = eye, snow), emit EACH sense as a SEPARATE meanings[] entry. NEVER collapse multiple distinct senses into a single meaning's definition string with comma-separated translations.

- WRONG: meanings=[{partOfSpeech:"명사", definition:"배"}], meanings_translated=[{partOfSpeech:"名词", definition:"肚子,梨,船"}] — three senses collapsed into one comma list
- WRONG: meanings=[{partOfSpeech:"명사", definition:"배, 배, 배"}], meanings_translated=[{partOfSpeech:"명사", definition:"Bauch, Birne, Schiff"}] — three identical canonical entries with all translations comma-collapsed into a single translated entry
- RIGHT: meanings=[{partOfSpeech:"명사", definition:"배(과일)"}, {partOfSpeech:"명사", definition:"배(복부)"}, {partOfSpeech:"명사", definition:"배(선박)"}], meanings_translated=[{partOfSpeech:"名词", definition:"梨"}, {partOfSpeech:"名词", definition:"肚子"}, {partOfSpeech:"名词", definition:"船"}]

The index N in meanings and meanings_translated MUST refer to the same single sense. If senses are distinct (different translations, different example contexts), each gets its own meaning entry with corresponding index.

count invariant priority="critical": meanings.length === meanings_translated.length, AND for true homonyms (배 / 다리 / 눈 / 쓰다 / 차다) the length MUST be ≥ 2. If the canonical side shows 3 separate "배" entries, the translated side MUST also show 3 separate entries (NOT 1 comma-collapsed entry).

DECISION TEST: would a native English speaker need to clarify which sense in conversation ("the pear or the ship?")? If yes → distinct senses → separate meanings entries. If a synonym list within ONE sense (대문/문 doors / gate; 자동차/차 car / automobile) → 1 meaning with comma-separated synonyms.
</no_meaning_collapse>

<learner_first_meaning priority="critical">
When a homograph has multiple attested senses, the FIRST listed sense MUST be the one a Korean learner most commonly encounters at TOPIK 1-2 level. This is NOT always the most "literal" or "etymologically primary" sense.

CRITICAL homograph cases — emit the LEARNER-FIRST meaning as meaning[0]:

VERB vs ADJECTIVE homonyms (LEARNER-FIRST = adjective for these):
- **적다** primary = 형용사 "to be few, sparse" (paired with 많다). The verb "적다=to write down" is technically distinct lexeme, secondary.
- **싸다** primary = 형용사 "to be cheap, inexpensive" (paired with 비싸다). The verb "to wrap" is secondary.
- **달다** primary = 형용사 "to be sweet" (taste). Verbs "to hang / to attach" are secondary.
- **차다** primary = 형용사 "to be cold" (paired with 따뜻하다). Verbs "to kick / to fill" are secondary.
- **짜다** primary = 형용사 "to be salty". Verbs "to weave / to plan" are secondary.

NOUN vs PARTICLE/ADVERB homonyms (LEARNER-FIRST = the functional word):
- **못** primary = 부사 "cannot" (negative auxiliary: 못 가요). The noun "nail" is secondary.
- **안** primary = 부사 "not" (negative: 안 가요). The noun "inside" is secondary but valid.
- **내** primary = 대명사 "my / mine" (possessive: 내 책=my book). "Inside" sense is compound-only — drop.
- **네** valid = 1) 수사 "four" (네 명, 네 시간) OR 2) 감탄사 "yes" (네!). Both attested.

HOMOPHONE pairs that need context-aware disambiguation:
- **국** primary = 명사 "soup" (국밥, 미역국). "Country/nation" sense is COMPOUND-ONLY (한국, 미국) — drop standalone.
- **굽다** primary = 동사 "to bake/roast (food)" in food-learning context. "To bend/curve" is secondary.
- **양식** primary = 명사 "Western cuisine" (paired with 한식/일식/중식). "Form/style" is secondary.
- **일식** primary = 명사 "Japanese cuisine" (paired with 한식/양식/중식). "Solar eclipse" is rare technical.
- **인분** = 명사 "servings (per person)" (1인분 = 1 serving). NEVER emit "human feces" — that's a different lexeme 인분 (人糞) and inappropriate for a learning vocabulary.
- **일월** primary = 명사 "January" (calendar month: 1월). "Sun and moon" (日月) is archaic literary — drop.
- **금주** primary = 명사 "this week" (금=this 주=week). "Abstinence from alcohol" (禁酒) is secondary.
- **국어** primary = 명사 "Korean language" (학교 과목: 국어 수업). NOT generic "national language".

These overrides apply to canonical meaning order. When in doubt about a Korean homograph, simulate a TOPIK 1-2 learner: which sense are they most likely to encounter in textbooks?
</learner_first_meaning>

<noun_form_in_examples priority="critical">
When the headword is a NOUN, examples emitted in any downstream ENRICH call MUST use the BARE NOUN with the marker on the noun itself — NOT on the derived 하다-verb form. This rule applies to noun headwords like 소개 / 졸업 / 교체 / 공부 / 운동 / 학습 / 시작 / 끝 etc. that ALSO have a verbalized form 소개하다 / 졸업하다 / 운동하다 etc.
- WRONG (verb form): "그는 친구를 **소개했다**." (marker on 소개했다, verb form)
- WRONG: "나는 학교를 **졸업했다**." (marker on 졸업했다)
- RIGHT (bare noun): "친구의 **소개**는 짧았다." / "그는 **소개**를 잘한다."
- RIGHT: "그의 **졸업**을 축하한다." / "**졸업** 후에 일을 찾는다."
If you cannot construct a natural sentence using the BARE NOUN under the simplicity cap, DROP that meaning's example slot.
The verbalized form is a DIFFERENT LEXEME (소개하다 ≠ 소개) and belongs to a separate dictionary entry. Even if a noun is "always" used in compound 하다-verb form colloquially, the canonical example must demonstrate the noun's standalone usage.
</noun_form_in_examples>

<no_padding priority="critical">
**SINGLE meaning is the DEFAULT.** Most Korean words have ONE dominant standalone sense. Use 1 meaning unless TWO senses are GENUINELY distinct (different concepts, different translations, different usage contexts).

**STRICT secondary-meaning gate** — before adding a 2nd/3rd meaning, ALL must be true:
1. Dictionary-attested in modern Korean for the EXACT bare headword
2. Native speakers commonly encounter this sense in standalone usage (not only in compounds)
3. The TARGET_LANG translation is materially DIFFERENT from the primary (not a synonym, not a register variant)
4. You can construct a learner-grade example demonstrating THIS sense distinctly from the primary

If ANY check fails → DROP the secondary, return only the primary meaning.

REJECT these fabrication patterns (NEVER emit):
- **배달 = salary** ✗ (한국어에 없음, 배당과 혼동)
- **피 = escape/avoidance** ✗ (피하다 verb의 noun화, standalone X)
- **통장 = block leader** ✗ (archaic, modern usage X)
- **내 = inside** ✗ (compound-only via 내부/내면; standalone X)
- **채널 = canal/groove** ✗ (standalone X, 수로가 별도 lexeme)
- **들리다 = to be raised/lifted** ✗ (들다=lift의 passive; 들리다 standalone은 들리다=be heard만)
- **흐리다 = to blur/dim (verb)** ✗ (cloudy adjective와 분리 부자연)

REJECT these dedup patterns (combine into 1 sense or drop):
- **내려가다 = go down + descend** ✗ (같은 의미, 1개로 통합)
- **식사 = meal/dining + dining/eating** ✗ (완전 동일)
- **옳다 = correct + right** ✗ (동의어)
- **앞 = front/before + front part** ✗ (동일)
- **들어가다 = enter + go in** ✗ (동의어, 1개로)
- **회사 = company + corporation/firm** ✗ (동의어)
- **시간 = time + hour** ✗ (hour는 시간의 unit sense, 별도 X)

**DEDUP CHECK before emit**: take meanings_translated, compare each pair. If two definitions share ≥1 same-stem word (synonym, near-synonym, register variant), they are duplicates. KEEP one (higher relevance), DROP the other.

**FABRICATION CHECK before emit**: for each secondary meaning, ask "would this sense appear in 표준국어대사전 under THIS EXACT bare headword?" If you're inventing the sense by analogy to other languages or by morphological inference (verb→noun, etc.), DROP it.

**SPECIALIZED-DOMAIN SECONDARY GATE** priority="critical":
When the primary sense of an occupational/everyday headword exists in the CIVILIAN/EVERYDAY domain (corporate titles, ordinary jobs, common nouns), do NOT emit a SPECIALIZED-DOMAIN secondary (military rank, medical jargon, legal terminology, religious clergy rank, royal court titles, archaic court positions, technical engineering term) unless ALL of the following hold:
- The specialized sense is EQUALLY ENCOUNTERED by ordinary Korean speakers (not only by people working in that specialized field).
- The headword's specialized sense is the PRIMARY way ordinary Koreans encounter the word in everyday contexts (e.g. news headlines, casual conversation), not a rank-table entry.
- A learner at TOPIK 1-2 level would benefit from learning this sense for general conversational fluency.

Most rank-based specialized senses FAIL these tests. The military-rank-equivalence sense of a corporate title (부장=major / 과장=captain / 사장=lieutenant), the medical specialty-naming sense of a common adjective, the legal-term sense of a household word — these are domain jargon that learners only need if studying that domain. For an everyday-vocabulary app, DROP these specialized secondaries.

DECISION RULE: if you can describe the secondary sense as "this is what people in [specific field] call this", and the field is NOT something ordinary modern Koreans encounter (military, religious clergy hierarchy, courtly titles, technical engineering, niche academic), the sense fails the everyday bar — DROP. relevanceScore for such senses should be ≤ 55 (below MIN_RELEVANCE=60), meaning they get filtered automatically.
</no_padding>

${SHARED_SLANG}

<korea_position>
Frame, do NOT refuse. Apply canonical Korean framing:
- 동해 (East Sea) canonical; 일본해 exonym definition: "the Japanese-position name for 동해".
- 독도 (Dokdo) canonical; Takeshima/竹島 exonym: "the Japanese-position name for 독도 (Korea)".
- 백두산 canonical; Changbaishan exonym: "the Chinese-position name for 백두산".
- 위안부 → victims of sexual slavery forcibly mobilized by Imperial Japanese military.
- 김치/한복/단오/고구려/세종대왕/이순신/안중근/등 → Korean items.
- 욱일기 → Imperial Japanese militarism symbol.
</korea_position>

<translation_rules>
- TARGET_LANG purity.
- Concise dictionary style. False-friend awareness (translate the sense, not the spelling).
- Register: daily-life concepts → colloquial spoken form, not formal Sino-Hanja.
- Proper noun: "<transliteration>, <bare category>". NEVER append country/state/region/era qualifier.
- LOANWORD PRIORITY: when the KO headword is itself a loanword (외래어 — 사이다 / 커피 / 컴퓨터 / 호텔 / 버스 / 노트북 / 라디오 / 텔레비전 / 피자 / 햄버거 / 케이크), translate to the TARGET_LANG's well-established native form (typically the matching loanword in TARGET_LANG), NOT a descriptive paraphrase.
  • 커피 → en "coffee"; ja "コーヒー"; zh "咖啡"; es "café"; fr "café"; de "Kaffee"; it "caffè"
  • 컴퓨터 → en "computer"; ja "コンピューター"; zh "电脑/计算机"
  • 사이다 → en "lemon-lime soda" (the closest concept; "cider" is wrong false friend); ja "サイダー"; zh "苏打水"
  • 버스 → en "bus"; ja "バス"; zh "巴士/公共汽车"
  Descriptive paraphrase only for concepts that lack a native single-word equivalent.
</translation_rules>

<verify_before_emit>
□ meanings_translated emitted FIRST, same count as meanings.
□ meanings in Korean only. meanings_translated in TARGET_LANG only.
□ Each meaning passes standalone test.
□ No encyclopedic padding.
□ ipa OMITTED.
□ No examples / synonyms / antonyms.
</verify_before_emit>

<pos_allowed>$POS_LIST</pos_allowed>`;

// ============================================================
// EXAMPLES prompts per KO case (used by ENRICH path)
// ============================================================

// Sino monosyllable: rare examples — most senses are numeral/counter/
// body-part standalone. Marker MUST be on the single character, never
// on an adjacent compound. If the meaning fails standalone construction,
// drop the slot.
const KO_SINO_EXAMPLES_STATIC = `<role>Example-sentence generator for Korean 1-syllable Sino headwords. Output strict JSON. WORD_LANG=Korean only.</role>

Output JSON: { "examples": [ { "sentence": string, "meaning_index": number } ] }

<quantity>
Strict 1:1 per meaning_index. For N meanings, emit exactly N examples. NEVER emit more examples than meanings.
If a meaning fails standalone example construction (cannot build a natural sentence with the bare 1-syllable headword), DROP that slot.
</quantity>

<marker_priority>
The ** marker MUST wrap the SINGLE 1-syllable headword character verbatim. NEVER on:
- An adjacent verb / particle / counter
- A compound containing the headword (가다 contains 가; 사이다 contains 사 — marker NEVER on the compound)
- An inflected derivative (간다 from 가; 이다 = copula not headword)
- A preceding quantifier / number / modifier — the modifier sits OUTSIDE the markers; only the bare 1-syllable headword goes inside.

COLLOCATIONAL-FRAME OBLIGATION (priority="critical"):
When the assigned sense ONLY surfaces in a collocational frame — e.g. a multiplier sense that requires "두 X" / "세 X" / "N X", a counter sense that requires "numeral + X", a bound-noun sense that requires a preceding modifier — the surrounding sentence MUST include that frame in full. The required collocational element (quantifier / numeral / modifier) appears in the sentence OUTSIDE the markers; the markers wrap only the bare headword character. Do NOT drop the collocation just to satisfy the "marker on headword only" rule — both rules apply together.

WRONG examples (NEVER emit):
- 나 example "나는 학교에 **간다**" — marker on 간다, not 나
- 사 example "**사이다**를 마신다" — marker on the compound 사이다, not standalone 사
- 이 example "둘은 **이**개" — marker on bound counter usage instead of standalone numeral
- multiplier headword example "기존보다 **두 배** 비싸요" — marker includes preceding 두; should be "기존보다 두 **배** 비싸요"
- multiplier headword example "점수가 전보다 **배** 높게 나왔어요" — dropped the required quantifier "두/세/N"; should be "점수가 전보다 두 **배** 높게 나왔어요"
</marker_priority>

<frame_options>
Pick ONE frame per meaning, matching the sense type:

(i) NUMERAL FRAME (when sense is Sino numeral 일/이/삼/사/오/육/칠/팔/구/십):
  Use Sino-compatible counter: 분/원/페이지/쪽/층/호/회/인분/학년/도/월/년.
  EXAMPLE: "**사** 시에 만나요." / "**오** 인분 주문했어요." / "**팔** 페이지를 봐요."
  NEVER use native counters (명/사람/마리/개/살). Headword form is sacred — NEVER swap to native equivalent.

(ii) STANDALONE NOUN FRAME (when sense is a 1-syllable noun: 책=book, 눈=eye, 입=mouth, 손=hand, 발=foot, 귀=ear, 강=river, 산=mountain):
  Simple subject + object + verb. Marker on the bare noun.
  EXAMPLE: "나는 **책**을 읽어요." / "**손**이 차가워요."

(iii) PRONOUN FRAME (나/너/저=I-polite/this-that):
  Marker on the bare pronoun. Particle (가/는/를/의/에게) OUTSIDE.
  EXAMPLE: "**나**는 학교에 갔어요." / "**너**는 어디 있어?"

(iv) META-SUFFIX FRAME (last resort — when sense exists as suffix only, not standalone):
  Pattern: "<compound>의 **<headword>**은/는 <sense>을/를 뜻한다."
  Use ONLY when standalone usage is unnatural AND the sense is commonly recognized in modern compounds.

If NONE of (i)-(iv) yield a natural sentence: DROP the slot.
</frame_options>

<shape>
- Length: 6–14 chars CJK (Korean). Up to 18 chars for meta-suffix frame.
- Verb-final (SOV) is preserved, but a brief time/place phrase is allowed when natural.
- Casual conversational tone for everyday 1-syllable words (body parts, daily nouns, common particles, ordinary adverbs) — friends-talking register, not textbook. PRESERVE formal/한자어/written register for formally-marked headwords (격식 표현, 한자어 only used in writing/news, technical/legal terms). Beginner tier (TOPIK1) only when proficiency hint indicates so.
- Polarity: prefer affirmative; question/imperative is fine occasionally.
- Terminal punctuation MANDATORY (. / ! / ?).
</shape>

<korean_grammar>
- Verb-final clause structure.
- If the sentence contains any other verb, it MUST end with a conjugated form (NEVER bare "-다").
- Particles (을/를/이/가/은/는/에/의) OUTSIDE the marker.
</korean_grammar>

<diversity>
When multiple meanings yield examples, vary subject and scene across slots — avoid cloning "나는 X" for every slot.
</diversity>

<counter_numeral_range priority="critical">
Every counter has a NATURAL QUANTITY RANGE — the numeral magnitudes a native speaker actually pairs with it in everyday Korean. The example's numeral MUST sit inside that range. If the resulting sentence makes a native speaker switch to a different counter at the same scale, the numeral is out-of-range and the example is unnatural.

Mental check before emitting:
- Read the candidate sentence aloud. Would a native Korean speaker actually say this, or would they instinctively swap your counter for a different one at that magnitude? If they would swap, the example is wrong.
- Counters scoped to incrementally-perceivable physical events (you can count them one-by-one within seconds) tend to allow small numerals only; large totals of the same referent take a different counter entirely.
- Counters scoped to enumerated objects, time/money/distance scales, or page/order numbers span a wide range.

DECISION RULE:
1. If the candidate example uses a large numeral but a native would switch to another counter at that scale → REWRITE with a smaller numeral or DROP the slot.
2. If the candidate example uses a tiny numeral for a wide-range counter and reads as artificially constrained, expand the numeral to a natural magnitude.
3. NEVER force a numeral the language doesn't pair with that counter; pick one within the natural distribution or drop the slot.
</counter_numeral_range>

<verify_before_emit>
□ Marker is on the EXACT 1-syllable headword, not on compound containing it.
□ Marker is not on adjacent verb / particle / different word.
□ Numeral sense uses Sino-compatible counter.
□ Sino headword form preserved (NEVER swapped to native equivalent).
□ Sentence terminates with proper punctuation.
□ For each meaning, if no natural example possible → DROP the slot.
□ When multiple slots exist, subjects and scenes are NOT cloned across them.
</verify_before_emit>`;

// Verb/adj -다: conjugation terminal + typical argument + state-adj subject.
const KO_VERB_ADJ_EXAMPLES_STATIC = `<role>Example-sentence generator for Korean verb/adjective -다 headwords. Output strict JSON. WORD_LANG=Korean only.</role>

Output JSON: { "examples": [ { "sentence": string, "meaning_index": number } ] }

<quantity>
Strict 1:1 per meaning_index. For N meanings, emit exactly N examples. NEVER emit more examples than meanings.
If a meaning fails natural example construction → DROP slot.
</quantity>

<conjugation_terminal priority="critical">
The sentence MUST end with a properly CONJUGATED form of the headword. The bare dictionary form (e.g. "가다", "먹다", "좋다") as sentence terminal is FORBIDDEN.
- WRONG: "나는 학교에 **가다**." (bare 가다 as terminal)
- WRONG: "나는 의자에 **앉다**."
- WRONG: "나는 사과를 **사다**."
- RIGHT: "나는 학교에 **간다**." / "**갔어요**" / "**가요**" / "**갑니다**"
- RIGHT (adjective): "이 사과는 **작다**." → "**작아요**" / "**작다**" — terminal -다 form for adjectives in declarative writing IS acceptable.

DECISION: bare dictionary form is acceptable as terminal ONLY for adjectives in formal declarative writing. For verbs, ALWAYS conjugate (-ㄴ다/-는다/-았다/-었다/-요/-습니다).
</conjugation_terminal>

<typical_argument>
A verb sense MUST be demonstrated with its typical object/complement.
- WRONG: bare "**부른다**" for "to sing"
- RIGHT: "노래를 **부른다**"
- WRONG: bare "**먹는다**" — needs object
- RIGHT: "사과를 **먹는다**"
- Intransitive verbs (걷다, 자다, 살다) — no object required.
</typical_argument>

<state_adjective_subject>
Korean state/sensory adjectives (배부르다, 배고프다, 아프다, 시원하다, 답답하다, 떨리다) take an AFFECTED BODY PART or STATE as their grammatical SUBJECT (이/가). Person is the topic (은/는).
- WRONG: "나는 **부르다**." (no 배가)
- RIGHT: "**배**가 **부르다**." or "나는 **배**가 **부르다**."
- Same for: 고프다 (배가), 아프다 (머리/배가), 시원하다/답답하다 (가슴/마음이), 떨리다 (손/몸이).

The marker stays on the headword adjective. The state-bearer noun must appear in the sentence.
</state_adjective_subject>

<marker>
Wrap the headword's conjugated/inflected form in EXACTLY one pair of **.
- Stem + ending ALL inside markers. "**간다**" not "**간**다". "**갔어요**" not "**갔**어요".
- Particles (을/를/이/가/은/는/에/의/로/와/과) OUTSIDE.
- NEVER place marker on an adjacent verb / different word.
  • WRONG: 살다 example "그는 돈을 **번다**" (marker on 번다, not 살다)
  • RIGHT: 살다 example "그는 서울에 **산다**" or "그는 서울에서 **살아요**"
- NEVER substitute a different lexeme inside markers:
  • headword 좋다, marker MUST be on 좋다 inflection (좋아요/좋다/좋았다), NOT on 좋아하다 (different lexeme).
  • headword 가다, marker on 가다 inflection (간다/갔어요/갈게요), NOT on 일어나다 / 떠나다 etc.
</marker>

<sense_disambiguation>
The sentence's demonstrated sense MUST match the assigned meaning_index.

Sense-anchor rule (especially critical when meanings share the same partOfSpeech):
1. Before drafting, identify a sense-anchor — a content word (object, action, attribute, collocation, or setting) that is associated ONLY with the assigned meaning and NOT with the other meanings of the same headword.
2. The sentence MUST contain that anchor in a frame where it disambiguates the headword.
3. If no clean anchor exists, REWRITE around a different anchor or DROP the slot.

Pre-emit check: "Reading ONLY this sentence with no context, which meaning would a learner infer?" Must equal the assigned meaning_index — not the most familiar sense, the assigned one. Same-POS polysemy is the hardest case because POS-based fallback cannot rescue a wrong anchor.
</sense_disambiguation>

<shape>
- Length: 6–18 chars CJK (Korean). Up to 24 chars for idiomatic / compound verbs.
- Verb-final (SOV) is preserved, but allow ONE time/place phrase or ONE subordinate clause when natural.
- Casual conversational tone for EVERYDAY vocabulary (daily verbs, common nouns, ordinary adjectives) — friends-talking register, not textbook, not children's-book. PRESERVE formal/한자어/written register for formally-marked headwords (격식 표현, 한자어 only used in writing, 존댓말, technical/legal terms). If proficiency hint is TOPIK1 or similar beginner tier, keep within ~1,500 most common words.
- Polarity: prefer affirmative; negation/question/imperative is fine for 1 of 3 slots when natural.
- Tense: vary across slots — e.g. one present (-아요/어요/-ㄴ다), one past (-았어요/-었어요), one future or volitional (-ㄹ게요/-겠어요) when natural.
- Terminal punctuation MANDATORY (. / ! / ?).
</shape>

<korean_grammar>
- Verb-final clause structure (SOV).
- Particles attached naturally — 은/는 for topic, 이/가 for subject, 을/를 for object, 에/에서/로 for location/direction.
</korean_grammar>

<diversity priority="critical">
The 2-3 examples for one verb/adjective must NOT clone the same shape.

- Vary subjects across slots: don't open every slot with "나는" / "그는" / "그녀는". Mix in proper names (민수, 지영, 수진, 영호), plural subjects (우리는, 학생들이, 아이들이, 가족이, 친구들이), inanimate subjects when the sense allows (커피가, 비가, 책이, 시간이), or subject-less constructions when natural.
- Vary scenes: school, work, home, restaurant, travel, weather, hobbies, family, friends — not three "나는 X를 먹어요" clones.
- Vary tense/mood across the slots.
- Vary sentence shape: a short SOV + one with a time/place phrase + one with a brief subordinate clause (~을 때 / ~면 / ~니까).

Reading all 2-3 sentences in sequence should feel like varied textbook usage, NOT a template repeated 3 times.

LEMMA IDENTITY AND CONJUGATION TERMINAL STILL HOLD.
</diversity>

<verify_before_emit>
□ Terminal is conjugated form, NOT bare dictionary "-다" for verbs.
□ Verb sense has typical object/complement.
□ State-adjective sense has state-bearer noun as subject.
□ Marker on the headword's inflection, NOT on a different lexeme.
□ Demonstrated sense matches meaning_index.
□ Sentence terminates with proper punctuation.
□ Subjects vary across slots (NOT all 나는 / 그는 / 그녀는).
□ Sentence shapes vary (NOT three identical templates).
□ Read in sequence: do they feel varied or cloned? Cloned → REWRITE.
</verify_before_emit>`;

// Set expression: 1 natural example using the entire phrase.
const KO_SET_EXPR_EXAMPLES_STATIC = `<role>Example-sentence generator for Korean fixed expressions. Output strict JSON. WORD_LANG=Korean only.</role>

Output JSON: { "examples": [ { "sentence": string, "meaning_index": number } ] }

<rules>
- 1 example per meaning, meaning_index 0.
- The entire fixed expression appears verbatim wrapped in ** markers. Do NOT decompose into individual words.
- Example: "처음 뵙겠습니다, **잘 부탁드립니다**." — entire phrase inside markers as a single unit.
- Show the expression in a NATURAL pragmatic context (greeting, dialogue opening, closing, etc.).
- Length: up to 15 chars CJK is OK for set expressions.
- Terminal punctuation MANDATORY.
</rules>

<verify_before_emit>
□ The entire expression is inside ** markers as one unit.
□ Pragmatic context is natural (greeting/dialogue/closing).
□ Terminal punctuation present.
</verify_before_emit>`;

export function buildKoExamplesSystemPrompt(
  koCase: KoCase,
): string {
  const TPL: Record<KoCase, string> = {
    sino_monosyllable: KO_SINO_EXAMPLES_STATIC,
    verb_adj_da: KO_VERB_ADJ_EXAMPLES_STATIC,
    set_expression: KO_SET_EXPR_EXAMPLES_STATIC,
    number_symbol: KO_SINO_EXAMPLES_STATIC,   // numeric reuse sino frame
    simple_word: "",                            // empty → caller falls back to generic v3
  };
  return TPL[koCase];
}

// ============================================================
// Public: get specialized system prompt for a (case, targetLang) pair
// ============================================================

export function buildKoSpecializedSystemPrompt(
  koCase: KoCase,
  targetLang: string,
): string {
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const posList = POS_BY_LANG["ko"] ?? "";
  const TPL: Record<KoCase, string> = {
    sino_monosyllable: KO_SINO_MONOSYLLABLE_STATIC,
    verb_adj_da: KO_VERB_ADJ_DA_STATIC,
    set_expression: KO_SET_EXPRESSION_STATIC,
    number_symbol: KO_NUMBER_SYMBOL_STATIC,
    simple_word: KO_SIMPLE_WORD_STATIC,
  };
  return TPL[koCase]
    .replace(/WORD_LANG/g, "Korean")
    .replace(/TARGET_LANG/g, targetName)
    .replace("$POS_LIST", posList);
}

export function buildKoSpecializedUserPrompt(
  req: WordLookupRequest,
  koCase: KoCase,
  lexiconHint?: string,
): string {
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;
  const lines: string[] = [
    `WORD_LANG: Korean`,
    `TARGET_LANG: ${targetName}`,
    `Input: "${req.word}"`,
    `Case: ${koCase}`,
  ];
  if (lexiconHint) lines.push("", lexiconHint);
  if (req.readingHint) {
    lines.push("",
      `READING CONSTRAINT: targets ONE reading — ${req.readingHint}.`,
    );
  }
  lines.push("",
    "originalInput = input verbatim.",
    "Emit meanings_translated (TARGET_LANG) BEFORE meanings (Korean). Same count, same order.",
    "No examples/synonyms/antonyms (separate ENRICH call).",
  );
  return lines.join("\n");
}

// ============================================================
// ENRICH-side: case-specialized syn/ant prompts
// ============================================================
// Resolves the 5/18 quality issue ("TOPIK 1,800 syn/ant fabrication"):
// register variants / peer-not-antonym demonstratives / part-whole body
// parts / hyponym-as-synonym / English loanword imposters / fabricated
// compounds / slang leak. Mirrors EN/JA/ZH case-routed pattern.

const KO_SYNANT_EMPTY_STATIC = `<role>You are receiving a headword that has NO synonyms or antonyms by definition. Return json with both arrays empty.</role>

<schema>{ "synonyms": [], "antonyms": [] }</schema>

<rules priority="critical">
This headword is a number, symbol, single-syllable Sino character used purely as numeral/counter/pronoun/particle, or a fixed greeting expression. Such headwords do NOT have synonyms or antonyms in any vocabulary-learning sense. Return both arrays empty without exception.
</rules>`;

const KO_SYNANT_DEFAULT_STATIC = `<role>List synonyms and antonyms for a KOREAN vocabulary headword. Return json. Default expectation: MOST words have FEW true synonyms and FEWER true antonyms. Empty arrays are the normal, correct outcome for a large fraction of vocabulary.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<principle priority="critical">
The user has flagged forced / irrelevant syn-ant pairs as a recurring quality problem. Bias HARD toward empty arrays. Never list a "vaguely related" word.

Mental substitution test for EACH candidate: "If I swap this word for the headword in a real Korean sentence, would a native speaker read it with the SAME meaning at the SAME register, in at least 80% of attested contexts?" Any hesitation → REJECT.

The 80% threshold is critical: registers, hyponyms, peers, and part-wholes all fail this even when "semantically related" — they substitute only in narrow contexts. REJECT them.
</principle>

<rules>
- Each entry: ONE bare Korean word in canonical written form. NO parentheticals, NO glosses, NO register tags. Parenthetical content = fabrication signal → reject.
- Each entry: a real attested Korean word in 표준국어대사전 — never a fabricated compound, never an English loanword spelling.
- NEVER the headword itself. NEVER inflected forms of the headword. NEVER derivatives across POS (좋다 / 좋아하다 / 좋음 are different lexemes — not synonyms of each other).
- NEVER cross arrays (synonym list MUST NOT contain antonyms; antonym list MUST NOT contain synonyms).
- Synonyms ≤ 3 (typically 0–2). Antonyms ≤ 2 (typically 0–1).
- Empty array is the EXPECTED outcome for the categories under <empty_cases>.
</rules>

<register_variant_rejection priority="critical">
NEVER list register variants of the same lexeme as synonyms. These all fail the 80%-substitution test because swapping changes register, even though the dictionary meaning is "the same":

- 격식 ↔ 일상 pairs: 감사합니다 ↔ 고맙다 (REJECT — different register); 죄송합니다 ↔ 미안하다 (REJECT); 알겠습니다 ↔ 알았다 (REJECT); 진지 ↔ 밥 (REJECT — honorific vs plain).
- 존댓말 ↔ 반말 pairs: any -ㅂ니다 form vs its 반말 counterpart.
- 한자어 ↔ 고유어 pairs of the SAME core sense: 사용 ↔ 쓰임 (REJECT); 시작 ↔ 비롯 (REJECT).
- Honorific vocabulary pairs: 당신 / 자네 / 너 / 그대 — these target different addressees and register, NOT interchangeable synonyms.

Decision: if the candidate and headword differ ONLY in register (formality / honorific level / 한자어-vs-고유어), REJECT.
</register_variant_rejection>

<peer_group_antonym priority="critical">
Members of finite semantic groups are PEERS, NOT antonyms. The model habitually fabricates antonym pairs from peer-group members; reject these patterns:

- Demonstrative pronouns: 이것 / 그것 / 저것 are peers (3-way deictic system), NOT mutual antonyms. 이것 ↔ 그것 = REJECT. 여기 / 거기 / 저기 = REJECT.
- Personal pronouns: 나 / 너 / 그 / 그녀 / 우리 / 너희 — peers in a paradigm, NOT antonyms. 나 ↔ 너 = REJECT.
- Time peers: 어제 / 오늘 / 내일 — peers. 어제 ↔ 내일 borderline; usually emit antonyms=[] for these.
- Seasons: ONE paired opposite each (봄↔가을 / 여름↔겨울); no cross pairings (봄 ↔ 겨울 = REJECT).
- Cardinal directions: ONE opposite each (북↔남 / 동↔서); no other pairings.
- Weekdays / months / primary colors / numerals: NO antonym → [].
- Kinship terms: 아버지 / 어머니 are paired opposites (sex/role contrast); 형 / 누나 / 동생 are peers (birth order paradigm), NOT antonyms.

When unsure: [].
</peer_group_antonym>

<part_whole_and_hyponym_rejection priority="critical">
NEVER list part-whole or hyponym relations as synonyms. The model habitually emits these for body parts, clothing, vehicles, time units, etc.:

- Body part siblings: 손 ↔ 팔 / 손가락 / 손목 / 주먹 — REJECT (parts of the same limb, NOT interchangeable).
- 다리 ↔ 발 / 무릎 / 허벅지 — REJECT (different anatomy).
- 입 ↔ 입술 / 혀 / 잇몸 — REJECT.
- Eye / sight family: 눈 ↔ 시각 / 시야 / 눈동자 — REJECT (눈 = bare organ; others = function or part).
- Clothing hyponyms: 바지 ↔ 청바지 / 반바지 / 정장바지 — REJECT (sub-type ≠ synonym). 신발 ↔ 운동화 / 구두 — REJECT.
- Vehicle / device hyponyms: 시계 ↔ 손목시계 / 벽시계 / 알람시계 — REJECT.
- Animal hyponyms: 새 ↔ 비둘기 / 참새 — REJECT.

Test: if candidate is a SPECIFIC TYPE OF or a PART OF the headword (or vice-versa), it's a hyponym/part-whole, NOT a synonym. REJECT.
</part_whole_and_hyponym_rejection>

<no_english_loanword_imposter priority="critical">
The headword is a native Korean / Sino-Korean word. NEVER list a transliterated English loanword as its synonym:

- 안녕 / 안녕하세요 ↔ "하이" (loanword) → REJECT
- 바지 ↔ "팬츠" / "트라우저" → REJECT
- 양말 ↔ "삭스" → REJECT
- 가방 ↔ "백" → REJECT (the loanword "백" is colloquial English imitation, not a true synonym)

Test: is the candidate a Latin / kana / English-source transliteration imitating an English word? If yes, REJECT — those are register-distinct loanword imposters, not native Korean synonyms.

Exception: when the loanword is FULLY ASSIMILATED into standard Korean (커피 / 컴퓨터 / 버스) and the headword is the SAME loanword in a different spelling — but this is rare for syn/ant.
</no_english_loanword_imposter>

<no_fabricated_compounds priority="critical">
NEVER coin a compound that does NOT appear in 표준국어대사전 (the official Korean dictionary):

- 방향 ↔ "이방향" — fabricated. REJECT.
- 안경 ↔ "빛안경" — fabricated. REJECT.
- 보행 ↔ "보행부" — fabricated. REJECT.
- 비행장 ↔ "비행장소" — fabricated. REJECT.

Test for EACH candidate: is this an attested standalone lexeme in 표준국어대사전? If you are inventing a compound by combining the headword's stem with a modifier, REJECT.
</no_fabricated_compounds>

<slang_rejection priority="critical">
NEVER list a slang or 신조어 (newly-coined) term as the synonym of a standard headword:

- 얼굴 ↔ "얼짱" / "쌩얼" — REJECT (slang derivatives, not synonyms).
- 친구 ↔ "찐친" / "절친" colloquial intensifiers — REJECT.
- Standard headwords keep standard-register synonyms only.

Slang headwords (which trigger note="non_word" upstream) reach this prompt only when the canonical filter let them through — defensive REJECT here.
</slang_rejection>

<empty_cases priority="critical">
These categories MUST return synonyms=[] AND antonyms=[]:
- Numbers, symbols, math expressions.
- Single-syllable Sino characters used as numeral / counter / pronoun / particle (사 as numeral / 분 as counter / 나 / 너 / 못 / 안).
- Proper nouns (people, places, brands).
- Pure function words: particles (은/는/이/가/을/를/에/의), demonstrative pronouns (이/그/저), most personal pronouns.
- Fixed expressions / greetings (안녕하세요 / 감사합니다 / 잘 부탁드립니다) — emit a syn ONLY when a SAME-register equivalent fixed expression genuinely exists; default to [].
- Punctuation tokens.
- Words whose only attested sense is highly technical/scientific with no everyday equivalent.

For these: return [] / []. Do not attempt; do not justify.
</empty_cases>

<antonym_rules priority="critical">
True antonyms are RARE in Korean. They exist mainly for:
- Gradable adjectives (덥다/춥다, 크다/작다, 빠르다/느리다, 행복하다/슬프다, 많다/적다, 좋다/싫다 — note: 좋다 ↔ 싫다 NOT 좋다 ↔ 나쁘다 in most contexts).
- Directional / spatial pairs (위/아래, 안/밖, 앞/뒤, 왼쪽/오른쪽).
- A small set of action verbs (열다/닫다, 시작하다/끝내다, 사다/팔다, 이기다/지다).
- A small set of state nouns (전쟁/평화, 삶/죽음, 성공/실패).

Most nouns have NO antonym. Most concrete nouns (사과 / 책상 / 책 / 강) have antonyms=[]. Most verbs have antonyms=[]. When in genuine doubt → [].
</antonym_rules>

<verify_before_emit>
□ For EACH entry: would substitution preserve the meaning at the SAME register in ≥80% of natural Korean sentences? If no → REMOVE.
□ For EACH entry: is it a register variant / hypernym / hyponym / topical associate / part-whole / peer-group member / derivative / inflected form? If yes → REMOVE.
□ For EACH entry: is it a fabricated compound that doesn't appear in 표준국어대사전? If yes → REMOVE.
□ For EACH entry: is it an English loanword imposter for a native lexeme? If yes → REMOVE.
□ Does the headword fall under <empty_cases>? If yes → both arrays MUST be [].
□ Antonyms: does the headword belong to a category where true antonyms exist? If no → antonyms = [].
□ Final pass: would I rather have a clean [] than a list with one shaky entry? YES → drop the shaky entries.
</verify_before_emit>`;

export function buildKoSynAntSystemPrompt(koCase: KoCase): string {
  if (koCase === "number_symbol" || koCase === "set_expression") {
    return KO_SYNANT_EMPTY_STATIC;
  }
  if (koCase === "sino_monosyllable") {
    // Single-syllable Sino chars: mostly numerals/counters/pronouns/particles
    // → default empty. The DEFAULT prompt's empty_cases also catches them,
    // but routing to EMPTY here saves a model decision step.
    return KO_SYNANT_EMPTY_STATIC;
  }
  return KO_SYNANT_DEFAULT_STATIC;
}

// ============================================================
// Per-case downstream-cap helpers
// ============================================================

export function getKoMeaningCap(koCase: KoCase): number {
  // Hard count caps replaced by MIN_RELEVANCE threshold (normalize.ts).
  // Returning the MAX_MEANINGS=5 ceiling for all cases — the relevance
  // signal does the actual filtering. number_symbol/set_expression
  // naturally yield 1–2 senses anyway.
  switch (koCase) {
    case "number_symbol": return 5;
    case "set_expression": return 5;
    case "verb_adj_da": return 5;
    case "sino_monosyllable": return 5;
    case "simple_word": return 5;
  }
}

export function getKoSynAntCaps(koCase: KoCase): { syn: number; ant: number } {
  switch (koCase) {
    case "number_symbol": return { syn: 0, ant: 0 };
    case "set_expression": return { syn: 0, ant: 0 };
    case "sino_monosyllable": return { syn: 0, ant: 0 };
    case "verb_adj_da": return { syn: 3, ant: 2 };
    case "simple_word": return { syn: 3, ant: 2 };
  }
}

export function shouldSkipKoSynAnt(koCase: KoCase): boolean {
  const { syn, ant } = getKoSynAntCaps(koCase);
  return syn === 0 && ant === 0;
}
