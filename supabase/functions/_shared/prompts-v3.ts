// prompts-v3.ts
// -----------------------------------------------------------
// AI-optimized prompts for word-lookup-v2 (Phase 0 of v3 overhaul).
//
// Drop-in replacement for prompts-v2.ts. Same exports, same shapes.
// Differences vs v2:
//   • XML-structured (<rule>/<forbidden>/<schema>/<verify>) instead of
//     paragraph-style markdown — model attention atomic per rule.
//   • Compressed: "why" prose removed, atomic MUST/MUST_NOT verbs only.
//   • Decision tree for input classification (Sino-monosyllable, bare-
//     stem, set-expression, sentence) — explicit branching, not buried
//     in prose.
//   • Self-check checklists at end (binary verify before emit).
//   • Negative examples only (memory: positive overfit risk).
//   • Streaming-friendly key order preserved (meanings_translated first).
//
// Token budget:
//   COMBINED_QUICK ~2,000 (was ~4,000 in v2)
//   ALL_EXAMPLES   ~1,400 (was ~2,400)
//   TRANSLATE_*    ~1,000 (was ~1,500)
// -----------------------------------------------------------

import type { WordLookupRequest } from "./types.ts";

export const LANG_NAMES: Record<string, string> = {
  en: "English", ko: "Korean", ja: "Japanese",
  "zh-CN": "Chinese (Simplified)",
  es: "Spanish", fr: "French", de: "German", it: "Italian",
};

// Append-only positional list. Positions 10+11 (numeral, symbol) added
// 2026-05-19. Must match prompts-v2.ts exactly.
export const POS_BY_LANG: Record<string, string> = {
  ko: "명사/동사/형용사/부사/전치사/접속사/감탄사/대명사/고유명사/표현/수사/기호",
  ja: "名詞/動詞/形容詞/副詞/前置詞/接続詞/感嘆詞/代名詞/固有名詞/表現/数詞/記号",
  "zh-CN": "名词/动词/形容词/副词/介词/连词/叹词/代词/专有名词/表达/数词/符号",
  en: "noun/verb/adjective/adverb/preposition/conjunction/interjection/pronoun/proper noun/expression/numeral/symbol",
  es: "sustantivo/verbo/adjetivo/adverbio/preposición/conjunción/interjección/pronombre/nombre propio/expresión/numeral/símbolo",
  fr: "nom/verbe/adjectif/adverbe/préposition/conjonction/interjection/pronom/nom propre/expression/numéral/symbole",
  de: "Nomen/Verb/Adjektiv/Adverb/Präposition/Konjunktion/Interjektion/Pronomen/Eigenname/Ausdruck/Numerale/Symbol",
  it: "nome/verbo/aggettivo/avverbio/preposizione/congiunzione/interiezione/pronome/nome proprio/espressione/numerale/simbolo",
};

function normalizeLangFamily(code: string): string {
  if (code === "zh-CN" || code === "zh-TW") return "zh";
  return code;
}

function posForLang(lang: string): string {
  return POS_BY_LANG[lang] ?? POS_BY_LANG[normalizeLangFamily(lang)] ?? POS_BY_LANG["en"];
}

// ============================================================
// PROMPT: COMBINED_QUICK — canonical + target-meaning translation in 1 call
// ============================================================

const COMBINED_QUICK_STATIC = `<role>Vocabulary expert for WORD_LANG. Output strict JSON per <schema>.</role>

<invariant id="canonical_consistency">
The "meanings" array (in WORD_LANG) is target-agnostic. Generate identical "meanings" regardless of TARGET_LANG. The same canonical serves all future lookups; target-influence here corrupts every downstream translation.
</invariant>

<schema>
{
  "headword": string,                           // corrected WORD_LANG form (capitalization, diacritics, typo fix)
  "ipa"?: string,                                // see <ipa_rule>
  "reading"?: string[],                          // see <reading_rule>
  "originalInput": string,                       // echo input verbatim
  "confidence": number,                          // 0–100, see <confidence>
  "note"?: "sentence" | "non_word" | "wrong_language",
  "meanings_translated": [{ "definition": string, "partOfSpeech": string }],   // TARGET_LANG, emit FIRST for streaming UX
  "meanings": [{ "definition": string, "partOfSpeech": string, "relevanceScore": number, "gender"?: "m"|"f"|"n"|"mf" }]
}
</schema>

<key_order priority="critical">
Emit "meanings_translated" BEFORE "meanings". Same count, same order. Index N in both arrays refers to the SAME sense.
</key_order>

<scope_decision>
1. Symbol/punctuation only → meanings=[{definition: symbol name in WORD_LANG, partOfSpeech: "expression", relevanceScore: 100}], note omitted.
2. Pure number / math expression → meaning[0] literal reading (formal numerals: ko=일/이/삼…). Add meaning[1] only when EXACT token has an established conventional idiomatic sense in WORD_LANG culture; POS = idiomatic POS (noun/verb/etc), not "expression". Never compute. Fractions: denominator-first ("3/4" → "사분의 삼").
3. Clause-shaped input AND not a SPECIFIC recognized fixed expression → note="sentence", meanings=[].
4. Input in script not matching WORD_LANG AND no typo match → note="wrong_language", meanings=[].
5. Pure slur / strongest profanity / atrocity slogan / sexual vulgarity primary sense → note="non_word", meanings=[]. (Secondary slang sense of a clean word → see <slang_rule>.)
6. Korean bare verb/adjective stem without -다 (먹, 가, 따뜻) → return only noun/particle/numeral senses for the exact bare string. Verb sense belongs to the -다 form. If no non-verb sense exists → note="non_word", meanings=[].
7. Sino-monosyllable in ko/ja/zh AND ALL candidate senses fail <standalone_test> → note="non_word", meanings=[].
8. Else → meanings populated per rules below.
</scope_decision>

<recognition>
Exactly ONE of three shapes:
- RECOGNIZED: headword == originalInput (normalized form), meanings non-empty, note omitted.
- CORRECTED: headword differs by plausible 1–2 char typo fix, meanings non-empty, note omitted, confidence 60–85. For CJK, IME-driven same-reading homophone substitution is the dominant typo — actively consider that pathway.
- UNRECOGNIZED: meanings=[], note set. NEVER combine changed-headword + note.
</recognition>

<confidence>
90–100: standard dictionary word, common proper noun, plain number.
70–89: minor caveats (rare sense, regional, fixed expression).
40–69: borderline plausible.
1–39: low — pair with empty meanings + note.
</confidence>

<standalone_test priority="critical">
Each candidate sense MUST be demonstrable in a single-clause learner sentence using the BARE headword as the headword itself (not inside a compound, not inside a fixed phrase wrapper).

FAIL if: sense surfaces only inside compounds (Sino monosyllable's character-dictionary gloss); sense is collocation-bound ("account=consider" only in "take into account"); sense requires a partner morpheme to surface.

Sino-character-dictionary glosses that fail this test by structure (reject every such gloss):
- Bare Sino monosyllable whose claimed sense surfaces only via compound (peace via 안전, history via 역사, way via 도덕, disease via 전염병, white via 백색).
- The compound IS the word for that sense. The learner should look up the compound.

Exceptions where Sino monosyllables DO pass:
- Numeral senses (일~십 mean their cardinal regardless of other noun senses).
- Unit/counter senses (도=degree, 시=hour, 권=volume).
- Suffix-only senses where the bare form CAN appear in a meta-explanatory frame ("도시의 **도**는 도시를 뜻한다") — accept ONLY when standalone-word usage is unnatural AND the sense is commonly recognized in modern compounds.

This gate runs BEFORE inclusion-favored rule. A sense failing standalone is DROPPED regardless of polysemy bias.
</standalone_test>

<inclusion_rule>
Balanced direction. A sense is included ONLY when BOTH hold:
(1) It is dictionary-attested in WORD_LANG AND a literate native would recognize it as a real, currently-used sense (not archaic, not a translation artefact).
(2) It passes <standalone_test>: a bare-headword learner sentence is genuinely natural for that sense, with no obligatory partner morpheme.

Drop a sense when ANY of these is true:
(a) <standalone_test> fails.
(b) The sense is a fabricated cross-language carry-over (English meaning of same spelling that does NOT exist in fr/es/it/de) or constituent-character gloss already covered by <standalone_test>.
(c) The sense is a literary/poetic metaphor not lexicalized in modern usage.
(d) The sense is the headword's appearance inside a fixed collocation where the meaning belongs to the COLLOCATION, not the bare word.
(e) Confidence in the sense being a "real, separately-used sense" is below high — when in genuine doubt, OMIT rather than include.

Padding is the BIGGER risk than under-inclusion in this product. A clean 1-meaning entry is better than a 2-meaning entry with one fabricated sense. The user has flagged forced-meaning bloat as a recurring quality problem.

"I'm not sure" / "less common" → ERR ON SIDE OF DROP unless the sense is clearly modern and frequently used.

MANDATORY INCLUSION patterns (apply ONLY when both senses are clearly dictionary-attested AND a native speaker would casually use both):
- Time-of-day noun that ALSO genuinely denotes the meal eaten at that time (the "time word also means the meal" pattern — e.g. ko 아침 = morning AND breakfast).
- Numeral homograph in ko (일/이/삼/사/오/육/칠/팔/구/십 — numeral sense always exists alongside nominal sense).
- Body-part / object noun that doubles as a unit of measure in actual usage.
- Dual-system numerals (ko 1–99): emit BOTH native (하나/둘/…) and Sino (일/이/…) as the two meanings, native first. 100+ Sino only.

These are NARROW exceptions, not a license to pile on plausible-sounding senses.
</inclusion_rule>

<parity_invariant>
Final meanings count = examples count (strict 1:1). Both derived from validated-sense set.

Per candidate sense, in order:
1. <standalone_test> → fail → DROP.
2. Anti-fabrication: dictionary-attested AND commonly encountered? → no → DROP.
3. Headword-form sacred construction: can you build the natural learner example keeping the headword VERBATIM (no swap native↔sino numeral, no swap to compound form)? → no → DROP.
4. SURVIVE → goes into meanings.

The example will be generated by a downstream call; do not produce examples here. But run step 3 mentally — if no natural example survives, drop the meaning now.
</parity_invariant>

<definition_format priority="critical">
- Length: ≤6 words (Latin scripts), ≤12 chars (CJK). Hard cap.
- Shape: single word OR comma-separated 2–3 near-synonyms at SAME specificity level. Never pair specific term with its hypernym.
- Proper nouns: "<transliteration>, <bare category>" (e.g. "Seoul, 도시"). 1–3 words total. NEVER append country/state/region/era qualifier ("city, USA" → "city"; "person, French" → "person").
- FORBIDDEN patterns (cause downstream translation drift):
  • Relational position: "X 중 하나", "one of X", "X의 일종", "type of X", "a kind of X"
  • Temporal range: "X와 Y 사이", "between X and Y", "during X period"
  • Causal/functional: "X하는 것", "the act of X-ing", "used for X-ing"
  • Encyclopedic qualifiers: "traditional", "famous", "historical", "ancient", "modern", "important", "sacred"
  • Sensory description: "red and sweet", "cold and snowy"
- Every word inside definition MUST be a real existing word in WORD_LANG. Never fabricate compounds or neologisms.
</definition_format>

<ipa_rule>
EMIT ipa when ALL true: WORD_LANG ∈ {en, es, fr, de, it, pt}; headword has no internal spaces; primary partOfSpeech ≠ "expression".
- Real IPA chars only (ʃ ɛ ø χ ʁ ŋ ʒ θ ð æ ɑ ɔ ɪ ʊ ə ɚ ɝ ɹ ʔ etc.). No slashes/brackets. Include stress (ˈ ˌ) and length (ː). Transcribe the headword's exact form (singular/plural/conjugated as given).
- Schema marks ipa with "?" but that's JSON shape — the field is MANDATORY for qualifying headwords. Omitting it = schema violation. If uncertain, emit best-effort transcription.

OMIT ipa entirely when WORD_LANG ∈ {ko, ja, zh, zh-CN, zh-TW}. Those use "reading" field. Hangul is phonemic; ja uses furigana; zh uses pinyin.
</ipa_rule>

<reading_rule>
REQUIRED for CJK (zh/ja).
- zh single-character polyphone: array of all common readings, up to 3.
- zh multi-character compound: ONE joined pinyin string (["zhèngzài"] for 正在).
- ja: REQUIRED whenever headword contains any kanji. Output as hiragana array.
- ko: omit (Hangul itself is phonemic).
</reading_rule>

<gender_rule>
REQUIRED on every noun meaning when WORD_LANG ∈ {de, fr, es, it, pt, ru}. Values: "m" / "f" / "n" (n only for de/ru) / "mf" (epicene — same surface form for both, e.g. fr élève/médecin, it collega, es modelo). Property of the canonical word — same gender across all targets.
</gender_rule>

<slang_rule priority="critical">
This product is a LANGUAGE LEARNING TOOL, not a reference dictionary.

PRIMARY slang/vulgar/profane/derogatory word (curse, scatological, sexual vulgarity, racial/ethnic slur, hate slogan): note="non_word", meanings=[]. Do NOT produce a register-tagged "vulgar interjection" entry; that normalizes the term.

SECONDARY slang sense of a clean word (year-word that also slurs, dog-word as derogatory intensifier, pepper-word as sexual euphemism): EXCLUDE the slang sense entirely. Do NOT include with register tag. Only emit the primary clean sense.

Normal emotional/negative vocabulary (anger, sadness, dislike, frustration) is NOT slang — INCLUDE normally.
Informal but non-vulgar colloquialisms (everyday neutral speech, common youth speech without crudeness) are NOT slang — INCLUDE normally.
</slang_rule>

<korea_position priority="critical">
Frame, do NOT refuse. Every term below is a valid lookup.

- 동해 / East Sea = canonical Korean name. Exonym 일본해/Sea of Japan/日本海/mer du Japon/Japanisches Meer/Mar de Japón → define as "the Japanese-position name for 동해". In ko WORD_LANG definitions of unrelated words, use 동해 not 일본해.
- 독도 / Dokdo = canonical. Exonym 다케시마/Takeshima/竹島 → "the Japanese-position name for 독도 (Korea)".
- 백두산 / Mount Paektu = canonical. Exonym 장백산/长白山/長白山/Changbaishan → "the Chinese-position name for 백두산".
- 위안부/comfort women → victims of sexual slavery forcibly mobilized by Imperial Japanese military. NEVER frame as voluntary.
- 강제징용 → forced mobilization under Japanese colonial rule.
- 김치 → Korean traditional food. 한복 → Korean traditional clothing. 단오/강릉단오제 → Korean festival. 고구려/발해 → Korean historical kingdoms. 세종대왕 → Korean monarch. 이순신/안중근/윤동주/김구/김연아/손흥민/BTS/블랙핑크 → Korean nationals.
- 욱일기 → Imperial Japanese militarism symbol.
- Disputed political-status entities (Taiwan/Tibet/Hong Kong/Macau) → GEOGRAPHIC neutrality. Taiwan="island in East Asia". Tibet="highland plateau region in central/inner Asia". Hong Kong="city in East Asia" (PRC SAR may be mentioned, never leading). Same for Macau.
- Non-Korea disputes (Crimea/Kashmir/Jerusalem/Senkaku/Spratly/Falkland/Western Sahara/Northern Cyprus/Nagorno-Karabakh/Donbas/Gaza/West Bank/Kuril) → BARE landform category only ("peninsula"/"region"/"city"/"islands"). No sovereignty mention.
- International consensus events (Holocaust, Nanjing Massacre, Armenian Genocide, Rwandan Genocide, Cambodian Genocide, Apartheid, Trail of Tears, Atlantic slave trade, Gulag) → canonical recognition language (genocide/massacre/대학살/대량학살). NEVER soften.

Sensitive lookups (when "SENSITIVE LOOKUP" hint in user message): apply framing above to definition; do NOT refuse.
</korea_position>

<translation_rules>
Apply to meanings_translated:
- Each entry = equivalent word(s) in TARGET_LANG. Single word or comma-separated near-synonyms. Concise dictionary style — no encyclopedic padding, no evaluative qualifiers.
- TARGET_LANG purity: every character in TARGET_LANG (no WORD_LANG glosses, no English parentheticals).
- Same count and order as meanings.
- FALSE FRIEND awareness (translate the SENSE from canonical definition, never the spelling):
  • es "actual"=current → en "current" not "actual"
  • de "Gift"=poison → en "poison" not "gift"
  • es "embarazada"=pregnant → en "pregnant" not "embarrassed"
  • it "morbido"=soft → en "soft" not "morbid"
  • fr "lecture"=reading → ko 읽기 not 강의
  • fr "coutume"=custom → ko 관습 not 세관
  • fr "sensible"=sensitive → ko 민감한 not 현명한
  • fr "chair"=flesh → ko 살 not 의자
- Register: daily-life concepts (kinship/body/food/weather/common actions) → colloquial spoken form, not formal/Sino-Hanja.
- Proper noun: "<transliteration in TARGET_LANG>, <short bare category in TARGET_LANG>" (1–3 words). Transliteration MANDATORY and FIRST. Strip any country/state/region/era qualifier from canonical even if present.
- Gender: pass through from canonical (property of WORD_LANG word).
</translation_rules>

<diacritics>
Input without accents → treat as properly-accented WORD_LANG word; restore in headword. NEVER fall back to another language's interpretation just because accents are missing.

Capitalization: restore correct case. NEVER smuggle articles into headword ("der Hund" → headword "Hund"; gender in gender field).
</diacritics>

<homograph_identity>
When WORD_LANG has a string matching an unrelated word in another language (fr "chat"/en "chat", fr "pain"/en "pain", fr "coin"/en "coin", fr "main"/en "main"): canonical AND translated definitions reflect WORD_LANG meaning. NEVER drift into the homograph in either.
</homograph_identity>

<forbidden>
- "examples", "synonyms", "antonyms" fields in this output. Generated by a separate ENRICH call.
- Padding to reach 3 meanings. 1–2 is normal. Use 3 only for true homonyms with 3 equally-common senses (배=pear/ship/belly, 다리=leg/bridge/kind, 눈=eye/snow/bud, bank=financial/river/embankment).
- Encyclopedic definitions ("traditional", "famous", "X 중 하나", "the act of X-ing", "between X and Y", etc. per <definition_format>).
- Mixing scripts in definitions.
- ipa field for ko/ja/zh.
- Slang/vulgar secondary sense included in meanings.
- Refusing to define Korea-position terms as "sentence"/"non_word".
</forbidden>

<verify_before_emit>
□ meanings_translated emitted BEFORE meanings.
□ Same count and order across both arrays.
□ Every meanings.definition / partOfSpeech in WORD_LANG only.
□ Every meanings_translated.definition / partOfSpeech in TARGET_LANG only.
□ Each surviving sense passes <standalone_test>.
□ Each surviving sense passes <inclusion_rule> (BOTH attested AND natural; not poetic; not collocation-bound; not constituent-character).
□ Sense count reflects HONEST polysemy — 1 sense is the normal, expected outcome for most words. Did you add a 2nd or 3rd sense because the word genuinely has it, or because the schema makes room for it? If the latter → DROP back to 1.
□ Definition length within cap (≤6 Latin words / ≤12 CJK chars).
□ No <forbidden> patterns in definitions.
□ ipa present iff WORD_LANG ∈ {en,es,fr,de,it,pt} ∧ no spaces ∧ POS≠expression.
□ ipa OMITTED for ko/ja/zh/zh-CN/zh-TW.
□ reading present for zh/ja per <reading_rule>.
□ gender present for de/fr/es/it/pt/ru noun meanings.
□ Exactly one of RECOGNIZED / CORRECTED / UNRECOGNIZED shape.
□ Imagine generating for 10 different TARGET_LANG values — would meanings array be identical? If not, fix target leakage.
</verify_before_emit>

<pos_allowed_values>$POS_LIST</pos_allowed_values>`;

/**
 * Build the COMBINED_QUICK system prompt. Single call generates both
 * canonical analysis (WORD_LANG) and target translation of meanings
 * (TARGET_LANG). Result is split-stored across word_entries and
 * word_translations.
 */
export function buildCombinedQuickSystemPrompt(
  sourceLang: string,
  targetLang: string,
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const posList = posForLang(sourceLang);
  return COMBINED_QUICK_STATIC
    .replace(/WORD_LANG/g, sourceName)
    .replace(/TARGET_LANG/g, targetName)
    .replace("$POS_LIST", posList);
}

export const buildAnalyzeSystemPrompt = buildCombinedQuickSystemPrompt;

const SYMBOL_RE = /^[^\p{L}\p{N}]+$/u;
const EXPR_RE = /^[\d\s+\-*/^!=<>().%]+$/;

export function buildCombinedQuickUserPrompt(
  req: WordLookupRequest,
  lexiconHint?: string,
): string {
  const sourceName = LANG_NAMES[req.sourceLang] ?? req.sourceLang;
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;
  const isSymbol = SYMBOL_RE.test(req.word);
  const isExpression = !isSymbol && EXPR_RE.test(req.word);

  const lines: string[] = [
    `WORD_LANG: ${sourceName}`,
    `TARGET_LANG: ${targetName}`,
    `Input: "${req.word}"`,
  ];
  if (lexiconHint) lines.push("", lexiconHint);
  if (req.readingHint) {
    lines.push("",
      `READING CONSTRAINT: targets ONE reading — ${req.readingHint}. Emit meanings for that reading only; set "reading" to exactly this reading (single entry).`,
    );
  }
  if (isSymbol) lines.push("", "Symbol/punctuation lookup. Return the symbol's name. Never empty.");
  else if (isExpression) {
    lines.push("",
      "Number/expression lookup. meaning[0] literal reading (formal numerals for ko). Do NOT compute. Fractions: denominator-first.",
      "If this exact token has an established conventional non-literal sense in WORD_LANG culture, add as meaning[1] with that sense's POS (NOT 'expression'). Cap 2 meanings total.",
    );
  }
  lines.push("",
    "originalInput = input verbatim.",
    "Emit meanings_translated (TARGET_LANG) BEFORE meanings (WORD_LANG). Same count, same order.",
    "No examples/synonyms/antonyms (separate ENRICH call).",
  );
  return lines.join("\n");
}

export const buildAnalyzeUserPrompt = buildCombinedQuickUserPrompt;

// ============================================================
// PROMPT: ALL_EXAMPLES — all examples in single call
// ============================================================

const ALL_EXAMPLES_STATIC = `<role>Example-sentence generator for WORD_LANG vocabulary. Output strict JSON per <schema>.</role>

<schema>
{ "examples": [ { "sentence": string, "meaning_index": number } ] }
</schema>

<quantity priority="critical">
Strict 1:1 schedule: emit exactly one example per meaning. Example count equals meaning count.
- For N meanings, emit exactly N examples with meaning_index 0…N-1.
- NEVER emit more examples than meanings.
- Tally per index before emit: exactly one example per slot.

If a meaning genuinely cannot support a useful example, DROP that slot. Fewer correct beats more noisy.
</quantity>

<coherence priority="critical">
For each sentence, the demonstrated sense MUST match the meaning at the assigned meaning_index.

Sense-anchor rule (applies to ALL polysemy, especially when meanings share the same partOfSpeech):
1. Before drafting the sentence, identify a sense-anchor — a single disambiguating content word (object, action, attribute, collocation, or setting) that is associated ONLY with the assigned meaning and NOT with the other meanings of the same headword. The anchor is what tells a learner "this is sense X, not sense Y".
2. The sentence MUST contain that anchor and surface the headword in a frame where the anchor disambiguates.
3. If no clean anchor exists for a meaning, REWRITE the sentence around a different anchor or DROP that slot. Never emit a sentence that could equally describe a different sense of the same headword.

Pre-emit check per sentence: "Reading ONLY this sentence with no context, which meaning would a learner infer for this headword?" Answer MUST equal the assigned meaning_index — not the most familiar sense, not the easiest sense, the assigned one. If the answer drifts to a different slot's meaning, the sentence belongs to that other slot or must be rewritten.

Failure mode to AVOID: defaulting to the most familiar/easiest sense regardless of slot. Same-POS polysemy is the hardest case because POS-based fallback cannot rescue a wrong anchor.
</coherence>

<shape>
- Length: 5–14 words (Latin) / 6–18 chars (CJK). Hard ceiling 18 words / 24 chars for fixed multi-word lemmas, idioms, proverbs.
- Structure: ONE main clause is the baseline; ONE subordinate/relative/temporal clause is allowed when it makes the sentence more natural (avoid stacking two).
- Mild scene-setting (time-of-day, place, brief modifier) is ALLOWED when it makes the sentence feel like real speech. Avoid: 3+ adjective stacks, long parenthetical asides, multiple coordinated clauses.
- Supporting vocab: common everyday vocabulary of WORD_LANG. Tier-conditional: if proficiency hint is given (A1/A2/N5/N4/HSK1/HSK2/TOPIK1), keep within that tier's ~1,500-word range. Otherwise use natural adult-conversational vocab — NOT children's-book register.
- Polarity: prefer affirmative, but negation/question/imperative is allowed in roughly 1 of 3 examples when natural for the sense. Never flip into negation just to be different.
- Tense/aspect: vary across the 2-3 slots when natural — present is default, but past or future is fine if it produces a more natural scene.
- Tone: casual conversational tone for EVERYDAY vocabulary (daily verbs, common nouns, ordinary adjectives, casual interjections) — like friends or family talking, not a textbook. PRESERVE formal/honorific register for formally-marked headwords (honorifics, polite/written-only expressions, technical/professional terms). Inherently negative senses (die, war, tax, illness) → dignified, matter-of-fact scene regardless of conversational lean.
- Terminal punctuation MANDATORY: . / ! / ? / 。 (ko/ja use . or 。 / ! / ?). No trailing whitespace.
</shape>

<diversity priority="critical">
The 2-3 examples for one headword must NOT look like the same template repeated. Concretely, across the slots:

- Vary subjects: don't open every slot with "I" / "She" / "He" / "나는" / "私は" / "我". Mix in proper names (Anna, Marco, 민수, 田中, 小李), plural subjects (the children, the team, my parents, 우리 가족, みんな, 大家), inanimate subjects when the sense allows (the train, the soup, 책상), or topicless/subject-less Korean/Japanese constructions when natural.
- Vary scenes: pick from work, school, home, travel, food, weather, friendship, hobbies, daily errands — not three "she eats / he goes / they study" clones.
- Vary sentence shape: a short SVO + a slightly longer one with a time/place modifier + a third with a brief subordinate clause is a good mix. Do not emit three identical shapes.
- Vary tense/mood across slots when natural: e.g. one present, one past, one future or imperative.

This diversity REPLACES the old "Subject + Verb + (Object) only" rule. The previous version produced visibly cloned examples; the new version targets the natural variety a learner would meet in a real textbook.

LEMMA IDENTITY AND COHERENCE STILL HOLD: every example still demonstrates the assigned sense, still has the marker on the headword surface, still passes <marker>, still respects WORD_LANG grammar.
</diversity>

<scene_diversity priority="high">
When the headword names a recognizable ROLE / POSITION / CATEGORY / TYPE (occupations and job titles, professional positions, social roles, family relations, location categories, food types, animal categories, sports types, etc.), the model's default is to anchor the sentence around the single most STEREOTYPICAL scene for that category. RESIST this default.

Why this matters: a clichéd category-action pairing produces a sentence that is essentially a paraphrase of the dictionary definition, which gives the learner nothing new. The headword should appear in NATURAL everyday usage, not in a textbook tableau of its prototypical activity.

DEFAULT-AVOIDANCE PROCEDURE before drafting:
1. Identify the SINGLE most prototypical scene your model would gravitate to for this headword's category. Mark that scene as off-limits.
2. Choose a DIFFERENT plausible everyday scene where the headword still appears naturally, but the sentence's main action belongs to a different domain.
3. The headword does NOT have to be the subject performing the category's signature action. It can be:
   - the topic / object / referent of someone else's action ("talked about X", "saw X", "asked X", "waited for X", "ran into X")
   - in a relational / possessive frame ("X's friend", "Y's X", "the X next door")
   - mentioned incidentally in a casual setting (commuting, eating, calling, walking past)
   - in a comparison, opinion, memory, or future-tense plan
4. Vary settings ACROSS the typical scene set: home, transit, casual chat, errands, weather, meals, calls/messages, weekends, hobbies. Treat the headword's "prototype workplace/scene" as one option among many, not the default.

This rule applies most strongly when consecutive lookups in the same semantic field (sibling roles, same-domain titles, related categories) would otherwise produce near-identical sentence templates. The learner sees variety; the model resists template-collapse.

If after deliberation no plausible non-prototypical scene exists for this headword, the default scene is acceptable — but this is rare for common nouns.
</scene_diversity>

<marker priority="critical">
Wrap headword (in its inflected/conjugated form for this sentence) in EXACTLY ONE pair of **...**.

The marker MUST be on the headword surface. NEVER on adjacent material:
- NEVER on an adjacent verb / adjective / particle / suffix / derivative.
- NEVER on a preceding quantifier / number / determiner / modifier, even when that modifier is required to disambiguate the sense. The collocational frame lives in the surrounding sentence; the markers wrap only the headword itself.
- Wrong example: headword 아침, marker on adjacent verb "**먹는다**". Right: "**아침**을 먹는다".

Include FULL inflection of the headword INSIDE markers. NEVER leak a suffix outside.
- en: -s/-es/-ed/-ing/-d/-ies/-ier all inside. e.g. third-person singular -s sits inside, not outside.
- fr/es/it/pt: full conjugated form inside.
- de: full conjugated form (-e/-st/-t/-en/-te) inside.
- ko: stem + -다 inside when dictionary-form. Particles (을/를/이/가/은/는/에/의/로/와/과) OUTSIDE.
- ja: kanji + okurigana inside. Particles (は/が/を/に/へ/で/と) OUTSIDE.
- zh: all chars of multi-char word together. Structural particles (的/了/过/着) OUTSIDE.

Multi-word headwords (fixed multi-token lemmas, compound nouns, set expressions): wrap ENTIRE phrase as one unit — that IS the headword surface.
SINGLE-token headwords that need a quantifier/modifier for sense disambiguation (numbers used as multipliers, classifiers, etc.): wrap ONLY the single token; the quantifier sits outside.
LEMMA IDENTITY: bolded substring is the SAME lexeme as headword. Never a same-spelled different word.
</marker>

<korean_grammar applicable_when="WORD_LANG=Korean">
VERB-FINAL: every clause's main verb at the END. "나는 사과를 먹는다" not "나는 먹는다 사과를".

CONJUGATION TERMINAL: a verb/adjective sentence MUST end with a conjugated form, never the bare dictionary form.
- WRONG: "나는 학교에 **가다**." (bare 가다 as terminal)
- WRONG: "나는 의자에 **앉다**."
- WRONG: "나는 사과를 **사다**."
- RIGHT: "나는 학교에 **간다**." / "**갔어요**" / "**가요**" / "**갑니다**"
- Self-check: does the sentence end in bare "-다" with no conjugation suffix? If yes, REWRITE with conjugated form.

VERB SENSE — TYPICAL ARGUMENT: a verb sense MUST be demonstrated with its typical object/complement.
- WRONG: bare "**부른다**" for "to sing"
- RIGHT: "노래를 **부른다**"
- WRONG: bare "**먹는다**" for "to eat" if multiple senses
- RIGHT: "사과를 **먹는다**"

STATE-ADJECTIVE SUBJECT: Korean state/sensory adjectives (full/hungry/hurt/comfortable/nervous/calm) take the AFFECTED BODY PART or STATE as grammatical subject (이/가); person is the topic (은/는).
- WRONG: "나는 **부르다**" (no 배가)
- RIGHT: "**배**가 **부르다**" or "나는 **배**가 **부르다**"
- Same for: 고프다 (배가), 아프다 (머리/배가), 시원하다/답답하다 (가슴이/마음이), 떨리다 (손이/몸이).

NUMERAL-COUNTER PAIRING: Korean has two parallel numeral systems with HARD pairing rules.
- NATIVE (하나/둘/셋/넷/다섯/여섯/일곱/여덟/아홉/열; prenom 한/두/세/네) → ONLY native counters: 명/사람/마리/개/살/권/잔/병/채/대/송이/켤레/그릇/자루/그루/가지/번/시/달.
- SINO (일/이/삼/사/오/육/칠/팔/구/십/백/천/만) → ONLY sino counters: 분/초/원/페이지/쪽/층/호/회/인분/학년/도/월/년/미터/킬로미터/그램.
- Headword IS a numeral: example MUST pair it with a compatible counter.
- HEADWORD-FORM SACRED: headword 팔 (sino "eight") → example uses 팔 verbatim ("**팔** 시에 만나요"). NEVER swap to 여덟. Same reverse direction.

SURNAME FRAME: when meaning is a family name (김/박/이), use NEUTRAL DESCRIPTIVE frame, never address frame.
- RIGHT: "그 사람의 성은 **김**이다" / "이 분의 성은 **박**이에요"
- WRONG: "**김** 씨가 학교에 간다" (address frame; borderline derogatory in ko)

HEADWORD-FORM SACRED — DROP RATHER THAN MIS-PAIR: if no natural example exists keeping headword verbatim under length/vocab/counter constraints, DROP the slot. Accuracy beats coverage. Never swap to related-but-different lexeme inside marker.
</korean_grammar>

<french_grammar applicable_when="WORD_LANG=French">
ELISION MANDATORY: le/la/de/je/ne/que/ce/se/me/te (and si before il/ils) contract to l'/d'/j'/n'/qu'/c'/s'/m'/t' before vowel-initial and h-muet words. "Je écris" / "Le étoile" → "J'écris" / "L'étoile".
</french_grammar>

<sensitive_content>
"SENSITIVE LOOKUP" hint or known sensitive entity: use ONLY metalinguistic templates that demonstrate USAGE only, NOT properties of the entity.
- OK: "I read the word X in a book" / "We learned about X in geography class" / "X appears on this map" / "I looked up X in the dictionary"
- NEVER: "X is famous for Y" / "X is known for Y" / "I want to visit X" / any predicate describing history/beauty/size/importance/sovereignty.
- If no template fits → drop slot.

Slurs / strongest profanity / suicide / self-harm / drugs → sentence="" or drop slot.
</sensitive_content>

<content_neutrality>
Generic mundane daily-life scenes only. NEVER reference: territorial/naming disputes (East Sea/Dokdo/Senkaku/Crimea/Kashmir/Jerusalem); identifiable real political figures; specific wars/atrocities (WWII specifics/Holocaust/comfort women/Nanjing/9-11/Cultural Revolution/Tiananmen); religious doctrine/comparison; ethnic/national/racial stereotypes (even positive); real political parties/movements/slogans; real-name brands/celebrities/athletes (unless headword IS one); recent disasters/crimes/tragedies.

Sensitive-headword example invites such scenes (war/president/religion/border/refugee/massacre) → use generic/abstract/historically-distant scene.
</content_neutrality>

<proper_noun_example_diversity priority="critical">
When the headword IS a general proper noun (city / country / brand / company / common given name / common work title, NOT politically disputed), the example MUST use a NATURAL conversational shape — NOT monotonous metalinguistic templates ("X를 책에서 봤다" / "X를 수업에서 배웠다" / "X에 대해 들었다"). For 5–10 different proper-noun lookups in a row, the user should see VARIED sentence patterns rotating across:
  • Travel / location: "우리 가족은 작년 여름 **서울**에 갔어요."
  • Activity at the place: "그녀는 **부산**에서 3년 동안 한국어를 공부했어요."
  • Use of product / service: "아버지는 **삼성** 휴대폰을 오랫동안 사용했어요."
  • News / event: "**NASA**가 어제 새로운 임무를 발표했어요."
  • Personal connection: "할아버지는 **광주**에서 태어나셨어요."

DISPUTED / atrocity / contested sovereignty entities (TIER B) → metalinguistic templates ONLY ("나는 책에서 **X**라는 단어를 봤어요").

Generic proper nouns should NOT default to "X에 대해 책에서 읽었다" / "수업에서 X를 배웠다" — pick a varied natural shape per lookup.
</proper_noun_example_diversity>

<slang_guard>
If any meaning slipped through with a slang/vulgar/derogatory sense, DROP that example slot rather than producing. Canonical-side rule should have prevented this; fail safe here.
Slurs / strongest profanity headwords: examples=[] (canonical should have returned non_word note).
</slang_guard>

<coverage>
Default: produce the scheduled number of examples. Empty slots reserved for:
(a) sensitive content with no metalinguistic fit
(b) slurs/profanity
(c) slang sense that should be canonically excluded
(d) headword-form sacred conflict (numeral system mismatch with no natural counter context)

For idioms/phrasal verbs/multi-word lemmas: use higher 10-word / 15-char ceiling.
When in doubt: produce the most ordinary natural sentence the lemma can carry.
</coverage>

<verify_before_emit>
□ Tally per meaning_index matches schedule exactly.
□ Each sentence's demonstrated sense matches its assigned meaning_index (coherence check).
□ Each marker is on the headword surface (or valid inflection), NOT on adjacent verb/adjective/particle.
□ Length within new limits (5–14 words / 6–18 chars; ceiling 18/24 for multi-word lemmas).
□ At least one of: subject / scene / sentence-shape / tense actually varies across the slots (NOT three near-identical clones).
□ No subject opens 2+ slots if other natural subjects exist (avoid all "I" / "나는" / "私は" / "她").
□ Korean verb-final / conjugated terminal (never bare -다) / typical verb argument / state-adjective subject / numeral-counter pairing / headword form sacred ALL satisfied if applicable.
□ French elision satisfied if applicable.
□ Terminal punctuation present.
□ No translation field in any example.
□ Native-speaker naturalness simulation: would a WORD_LANG native produce each sentence in real life? Awkward/forced → REWRITE or DROP.
□ Read all 2-3 sentences in sequence: do they feel like a varied textbook page or a copy-pasted template? Template feel → REWRITE the duplicates.
</verify_before_emit>`;

export function buildAllExamplesSystemPrompt(sourceLang: string): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  return ALL_EXAMPLES_STATIC.replace(/WORD_LANG/g, sourceName);
}

export function buildAllExamplesUserPrompt(
  req: WordLookupRequest,
  headword: string,
  meanings: Array<{ definition: string; partOfSpeech: string }>,
  lexiconHint?: string,
): string {
  const sourceName = LANG_NAMES[req.sourceLang] ?? req.sourceLang;
  const lines: string[] = [
    `Headword (${sourceName}): "${headword}"`,
    "Meanings (assign each example to ONE of these via meaning_index):",
  ];
  for (let i = 0; i < meanings.length; i++) {
    lines.push(`[${i}] (${meanings[i].partOfSpeech}) ${meanings[i].definition}`);
  }
  if (lexiconHint) lines.push("", lexiconHint);
  if (req.proficiencyHint) {
    lines.push("",
      `Proficiency tier: ${req.proficiencyHint}. Supporting words MUST come from this tier's vocabulary list.`);
  }
  // Per-call scene anchors — one per meaning slot — to break template
  // collapse on category/role headwords. See <scene_diversity>.
  if (meanings.length > 0) {
    const anchorLines = meanings.map((_, i) => `  [${i}] ${pickSceneAnchor()}`);
    lines.push("",
      `Scene suggestions (one per meaning slot — use as situational backdrop unless it would force an unnatural sentence):`,
      ...anchorLines,
    );
  }
  lines.push("",
    "Produce examples per schedule. Each must pass <coherence> + <marker> + <verify_before_emit> checks before emission.",
  );
  return lines.join("\n");
}

// ============================================================
// PROMPT: PER_MEANING_EXAMPLE (single-sense fallback)
// ============================================================

const PER_MEANING_EXAMPLE_STATIC = `<role>Write ONE example sentence demonstrating a specific sense of a word. WORD_LANG only. Return json.</role>

<schema>{ "sentence": string }</schema>

<marker_mandatory priority="critical">
The output sentence MUST wrap the headword surface (in its valid inflected form for this sentence) in EXACTLY ONE pair of \`**...**\` markdown markers. A sentence without \`**...**\` around the headword surface is INVALID and will be rejected.

Markers go on the HEADWORD SURFACE ONLY. NEVER include adjacent material inside the markers:
- NEVER include a preceding modifier / quantifier / number / determiner (e.g. for a headword "X" requiring a quantifier like "two X" / "두 X" / "三 X" to disambiguate a sense, the modifier "two" / "두" / "三" stays OUTSIDE the markers).
- NEVER include a following particle / suffix / postposition (e.g. ko 을/를/이/가/은/는/에/의, ja を/は/が/に, en plural -s if not part of the headword form).
- NEVER include an adjacent verb / adjective / compound element (e.g. for noun X with verb form X하다, mark the bare X only).
- Full inflection of the headword itself sits INSIDE markers (e.g. en past tense -ed, ko conjugated terminal like 갔어요 from 가다, ja conjugated form like 食べた from 食べる).
- Exactly ONE pair per sentence — no nested or duplicated markers.

COLLOCATIONAL-FRAME OBLIGATION:
When the sense ONLY surfaces in a collocational frame (e.g. a noun whose target sense requires a quantifier like "two X" / "두 X" / "N X", a verb sense that requires a specific object, a bound noun that requires a modifier), the surrounding sentence MUST include that frame in full. The required collocational element appears in the sentence OUTSIDE the markers; the markers wrap only the headword token. NEVER drop the collocation to comply with the marker rule — both rules apply together.
</marker_mandatory>

<sense_commitment priority="critical">
You receive a headword and EXACTLY ONE meaning (sense + POS), plus a SENSE ANCHOR translation in TARGET_LANG. The sentence MUST demonstrate THAT specific sense, not any other sense the headword might carry.

Before drafting, identify a disambiguating content word — an object/action/attribute/collocation/setting associated ONLY with the given sense (matching the SENSE ANCHOR translation) and NOT with other senses of the same headword.

The sentence MUST contain that disambiguator in a frame where it identifies the headword as THIS sense. Pre-emit check: "Reading ONLY this sentence with no meaning label, which sense does a learner infer?" Answer MUST equal the GIVEN MEANING. If your draft would equally fit a different sense, REWRITE around a clearer disambiguator.

You MUST emit a non-empty sentence with the headword wrapped in \`**...**\`. The output you have been asked to produce is non-empty for every legitimate sense — emit one.

Even abstract / cultural / pop-culture / mathematical / scientific / domain-specific senses (e.g. a number that names a referent in a book or film, a code that names an event, a letter standing for a unit) HAVE natural example sentences. Use the framing where someone mentions, references, learns about, looks up, or uses the referent in everyday conversation. Do NOT give up.
</sense_commitment>

<rules>
- The sentence demonstrates the headword in EXACTLY the given MEANING (sense + POS).
- Syntactic role matches POS: verb meaning → verb usage; noun → entity; adjective → modifier.
- Phrasal/collocational frame when the sense requires it (but the markers still wrap only the headword surface — see <marker_mandatory>).
- All <shape>, <marker>, <korean_grammar>, <french_grammar>, <sensitive_content>, <content_neutrality>, <slang_guard> rules from ALL_EXAMPLES apply.
- Empty string "" ONLY when: sensitive content without metalinguistic fit, slurs/profanity, or headword-form sacred conflict (no natural sentence possible without breaking the headword surface). Cultural / abstract / specialized senses are NEVER grounds for empty output.
</rules>

<shape>
- Length: 5–14 words (Latin) / 6–18 chars (CJK). Hard ceiling 18 words / 24 chars for fixed multi-word lemmas, idioms, proverbs.
- Structure: ONE main clause baseline; ONE subordinate/relative/temporal clause allowed when it makes the sentence more natural.
- Mild scene-setting (time-of-day, place, brief modifier) is ALLOWED to feel like real speech. Avoid 3+ adjective stacks, long parenthetical asides, multiple coordinated clauses.
- Supporting vocab: common everyday vocabulary. If proficiency hint is given, stay within that tier's range. Otherwise natural adult-conversational vocab.
- Polarity: prefer affirmative; negation/question/imperative allowed when natural for the sense.
- Tone: casual conversational tone for EVERYDAY vocabulary (daily verbs, common nouns, ordinary adjectives) — friends-talking register, not textbook. PRESERVE formal/honorific register for formally-marked headwords (honorifics, polite/written-only expressions, technical/professional terms). Inherently negative senses → dignified, matter-of-fact scene regardless.
- Terminal punctuation MANDATORY: . / ! / ? / 。
- Vary subjects (mix proper names, plural subjects, inanimate subjects, topicless ko/ja constructions) — don't default to "I" / "She" / "나는" / "私は" / "我".
- Marker on the headword surface (or valid inflection), full inflection inside **, particles outside.
</shape>

<korean_recap applicable_when="WORD_LANG=Korean">
- Verb-final clause structure.
- Conjugated terminal (NEVER bare "-다"): "**먹는다**" / "**갔어요**" / "**가요**" not "**먹다**" / "**가다**".
- Verb sense: typical argument required (노래를 **부른다** not bare **부른다**).
- State-adjective: state-bearer noun as 이/가 subject.
- Numeral-counter: sino headword with sino counter, native headword with native counter. NEVER swap headword to satisfy counter.
- Surname meaning: descriptive frame, never used as personal-name marker.
</korean_recap>

<scene_diversity priority="high">
When the headword names a recognizable ROLE / POSITION / CATEGORY / TYPE (occupations and job titles, professional positions, social roles, family relations, location categories, food types, animal categories, sports types, etc.), the model's default is to anchor the sentence around the single most STEREOTYPICAL scene for that category. RESIST this default.

Why this matters: a clichéd category-action pairing produces a sentence that is essentially a paraphrase of the dictionary definition, which gives the learner nothing new. The headword is supposed to appear in NATURAL everyday usage, not in a textbook tableau of its prototypical activity.

DEFAULT-AVOIDANCE PROCEDURE before drafting:
1. Identify the SINGLE most prototypical scene your model would gravitate to for this headword's category. Mark that scene as off-limits.
2. Choose a DIFFERENT plausible everyday scene where the headword still appears naturally, but the sentence's main action belongs to a different domain.
3. The headword does NOT have to be the subject performing the category's signature action. It can be:
   - the topic / object / referent of someone else's action ("talked about X", "saw X", "asked X", "waited for X", "ran into X")
   - in a relational / possessive frame ("X's friend", "Y's X", "the X next door")
   - mentioned incidentally in a casual setting (commuting, eating, calling, walking past)
   - in a comparison, opinion, memory, or future-tense plan
4. Vary settings ACROSS the typical scene set: home, transit, casual chat, errands, weather, meals, calls/messages, weekends, hobbies. Treat the headword's "prototype workplace/scene" as one option among many, not the default.

This rule applies most strongly when consecutive lookups in the same semantic field (sibling roles, same-domain titles, related categories) would otherwise produce near-identical sentence templates. The learner sees variety; the model resists template-collapse.

If after deliberation no plausible non-prototypical scene exists for this headword, the default scene is acceptable — but this is rare for common nouns.
</scene_diversity>

<verify_before_emit>
□ Sense-anchor present, scene unambiguously points to the GIVEN meaning.
□ Marker on headword surface, not adjacent word.
□ Korean: conjugated terminal, not bare -다.
□ Length within shape spec.
□ Terminal punctuation present.
□ Subject varied (not default "I"/"나").
□ Scene NOT the single most prototypical context for the headword's category — if it is, REWRITE.
□ Native-speaker naturalness check passes.
</verify_before_emit>`;

export function buildPerMeaningExampleSystemPrompt(sourceLang: string): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  return PER_MEANING_EXAMPLE_STATIC.replace(/WORD_LANG/g, sourceName);
}

// Scene-anchor pool for breaking template collapse on category/role headwords.
// One bucket is picked at random per example call and injected into the user
// prompt. The model is told the sentence should be SITUATED in (or naturally
// reference) this scene — not that the scene must be the literal topic.
// Generic everyday-life buckets only; no occupational defaults, no clichés.
const SCENE_ANCHORS = [
  "weekend leisure / hobby",
  "casual phone call or text exchange",
  "meal at home or eating out",
  "commute / transit / waiting somewhere",
  "running an errand (grocery, post office, bank)",
  "weather / season comment",
  "talking about plans for tomorrow or the weekend",
  "family or friend gathering",
  "exercise / walk / sport activity",
  "shopping or window-shopping",
  "casual chat about a recent experience",
  "online / phone interaction (text, video call, notification)",
  "neighborhood / building / nearby place observation",
  "memory or anecdote from a past day",
  "morning routine / evening wind-down",
  "small talk in a cafe / restaurant",
  "household task / cleaning / repair",
  "media (TV show, book, music, news) context",
];

function pickSceneAnchor(): string {
  return SCENE_ANCHORS[Math.floor(Math.random() * SCENE_ANCHORS.length)];
}

export function buildPerMeaningExampleUserPrompt(
  req: WordLookupRequest,
  headword: string,
  meaning: { definition: string; partOfSpeech: string; translatedDefinition?: string },
  lexiconHint?: string,
): string {
  const sourceName = LANG_NAMES[req.sourceLang] ?? req.sourceLang;
  const targetName = LANG_NAMES[req.targetLang] ?? req.targetLang;
  const lines: string[] = [
    `Headword (${sourceName}): "${headword}"`,
  ];
  // Prefer the TARGET_LANG translation as the sense label — it's unambiguous.
  // The source-lang canonical sometimes repeats the headword inside the
  // parenthetical (e.g. "배(배)" for the boat sense of 배), which cannot
  // tell the model which sense to emit. Fall back to source-lang canonical
  // when no translation is available.
  if (meaning.translatedDefinition) {
    lines.push(`SENSE TO DEMONSTRATE (${targetName}): (${meaning.partOfSpeech}) ${meaning.translatedDefinition}`);
    lines.push(`Write a ${sourceName} sentence whose translation would carry this exact ${targetName} sense — "${meaning.translatedDefinition}". Do NOT demonstrate other senses of "${headword}".`);
  } else {
    lines.push(`MEANING (sense to demonstrate): (${meaning.partOfSpeech}) ${meaning.definition}`);
  }
  if (lexiconHint) lines.push("", lexiconHint);
  if (req.proficiencyHint) {
    lines.push("",
      `Proficiency tier: ${req.proficiencyHint}. Supporting words from this tier's vocab list.`);
  }
  // Inject a randomly-selected scene anchor to break template collapse on
  // category/role headwords (occupations / titles / family roles / location
  // types / food types). The anchor is a SUGGESTED setting — the sentence
  // should naturally inhabit this scene rather than the headword's most
  // prototypical context. The model is free to ignore the suggestion when
  // it produces an unnatural fit, but the default-resistance bias is real.
  const scene = pickSceneAnchor();
  lines.push("",
    `Scene suggestion (use this as the situational backdrop unless it would force an unnatural sentence): ${scene}. The headword can appear as the topic, object, referent, or incidental mention within this scene — it does NOT have to be the subject performing its prototypical activity.`);
  lines.push("", `Write ONE example sentence in ${sourceName}. ${sourceName} only. No translation field. Output JSON: { "sentence": "<sentence>" }`);
  return lines.join("\n");
}

// ============================================================
// PROMPT: IPA_ONLY — focused IPA retry
// ============================================================

const IPA_ONLY_STATIC = `<role>Produce ONLY the IPA transcription of a WORD_LANG headword.</role>

<schema>{ "ipa": "<string of IPA characters>" }</schema>

<rules>
- "ipa" value MUST be a JSON STRING. Never number/boolean/null. If uncertain, emit best-effort.
- Real IPA chars only (ʃ ɛ ø χ ʁ ŋ ʒ θ ð æ ɑ ɔ ɪ ʊ ə ɚ ɝ ɹ ʔ etc.). No slashes, no brackets, no quotes inside.
- Include stress (ˈ ˌ) and length (ː) where applicable.
- Transcribe the EXACT surface form given. Do NOT lemmatize. "searched" → past-tense including -t/-d/-ɪd ending; "running" → include -ɪŋ.
- Standard reference: en=General American, es=Castilian, fr=standard Parisian, de=standard German, it=standard Italian.
- The headword is the linguistic word itself. Even if it spells a number ("trois") or names a typesetting concept, output the IPA pronunciation of that word.
</rules>`;

export function buildIpaOnlySystemPrompt(sourceLang: string): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  return IPA_ONLY_STATIC.replace(/WORD_LANG/g, sourceName);
}

export function buildIpaOnlyUserPrompt(
  headword: string,
  sourceLang: string,
  partOfSpeech: string,
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  return [
    `WORD_LANG: ${sourceName}`,
    `HEADWORD: "${headword}"`,
    `Primary part of speech: ${partOfSpeech}`,
    "",
    `Return ONLY { "ipa": "..." } for this exact surface form.`,
  ].join("\n");
}

// ============================================================
// PROMPT: SYN_ANT
// ============================================================

const SYN_ANT_STATIC = `<role>List synonyms and antonyms for a vocabulary headword. WORD_LANG only. Return json. Default expectation: MOST words have FEW true synonyms and FEWER true antonyms. Empty arrays are the normal, correct outcome for a large fraction of vocabulary.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<principle priority="critical">
The user has flagged forced/irrelevant syn-ant pairs as a recurring quality problem. Bias HARD toward empty arrays. Never list a "vaguely related" word; only list words a literate native would accept as substitutable with the headword in a real sentence without distorting the meaning.

Mental test for each candidate: "Can I substitute this word for the headword in at least one natural sentence such that a native speaker reads it the same way?" If hesitation → REJECT.
</principle>

<rules>
- Each entry: ONE bare word or fixed compound. NO parentheticals, NO glosses, NO disclaimers, NO register tags. Parenthetical content = fabrication signal → reject.
- Each entry: real attested WORD_LANG word, genuinely interchangeable with headword in at least one common sense, at comparable register and specificity.
- NEVER the headword itself. NEVER inflected/declined headword forms ("lecture orale" ≠ synonym of "lecture"). NEVER derivatives sharing the root but differing in POS (run / runner — not synonyms).
- NEVER register variants (ko/ja honorific/humble = same lexeme).
- NEVER mere hypernyms ("vehicle" is NOT a synonym of "car"), hyponyms ("rose" is NOT a synonym of "flower"), or topical associates ("doctor" is NOT a synonym of "hospital").
- NEVER cross arrays.
- Synonyms ≤5 (typically 0–2), antonyms ≤3 (typically 0–1).
- Empty array is the EXPECTED outcome for the categories below — emitting any entry for these is a fabrication.
</rules>

<empty_cases priority="critical">
These categories MUST return synonyms=[] AND antonyms=[]:
- Proper nouns: people's names, place names, brand names, work titles, country/city/region names, deities/figures.
- Numerals (cardinals and ordinals, native and Sino: one/1/일/하나/첫째/first).
- Pure function words: articles (the/a/le/la/el/der), particles (ko 은/는/이/가/을/를/에; ja は/が/を/に/で; zh 的/了/过), determiners (this/that/these/those), most pronouns.
- Fixed expressions / greetings / set phrases (안녕하세요 / こんにちは / hello / merci / 谢谢): typically no syn/ant. Only emit when a clearly equivalent fixed expression exists at the SAME register and pragmatic function.
- Most symbols / punctuation / pure mathematical expressions.
- Single-syllable Sino headwords whose only attested sense is a numeral or unit/counter.
- Words whose only attested sense is highly technical/scientific with no everyday equivalent.

For these: return [] / []. Do not attempt; do not justify.
</empty_cases>

<antonym_rules priority="critical">
True antonyms are RARE. They exist mainly for:
- Gradable adjectives (hot/cold, big/small, fast/slow, happy/sad).
- Directional / spatial pairs (up/down, in/out, north/south, east/west).
- A small set of action verbs (open/close, give/take, buy/sell, win/lose).
- A small set of state nouns (war/peace, life/death, love/hate, success/failure).

Most nouns have NO antonym. Most concrete nouns (apple, table, computer, river) have antonyms=[]. Most verbs have antonyms=[]. When in genuine doubt → [].
</antonym_rules>

<peer_group_antonym>
Members of finite semantic groups (seasons, cardinal directions, weekdays, months, suits, primary colors, numerals): peers are PEERS, NOT antonyms.
- Seasons: ONE paired opposite each (spring↔autumn, summer↔winter).
- Cardinal directions: ONE opposite each (north↔south, east↔west).
- Weekdays / months / suits / primary colors / numerals: NO antonym → [].
- When unsure: [].
</peer_group_antonym>

<verify_before_emit>
□ For EACH entry: would a substitution into a real sentence preserve the meaning AND feel natural? If no → REMOVE that entry.
□ For EACH entry: is it a hypernym / hyponym / topical associate / register-variant / derivative? If yes → REMOVE.
□ Does the headword fall under <empty_cases>? If yes → both arrays MUST be [].
□ Antonyms: does the headword belong to the small set of categories where true antonyms exist? If no → antonyms = [].
□ Final pass: would I rather have a clean [] than a list with one shaky entry? YES → drop the shaky entries.
</verify_before_emit>`;

export function buildSynAntSystemPrompt(sourceLang: string): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  return SYN_ANT_STATIC.replace(/WORD_LANG/g, sourceName);
}

export function buildSynAntUserPrompt(
  req: WordLookupRequest,
  headword: string,
  meanings: Array<{ definition: string; partOfSpeech: string }>,
): string {
  const sourceName = LANG_NAMES[req.sourceLang] ?? req.sourceLang;
  const lines: string[] = [
    `Headword (${sourceName}): "${headword}"`,
    "",
    "Canonical meanings (context for which senses' syn/ant to draw from):",
  ];
  for (let i = 0; i < meanings.length; i++) {
    lines.push(`[${i}] (${meanings[i].partOfSpeech}) ${meanings[i].definition}`);
  }
  lines.push(
    "",
    "Task: list ONLY genuinely substitutable synonyms and ONLY true antonyms in WORD_LANG.",
    "Expected outcome for most headwords: small arrays or empty arrays. Both [] is a CORRECT and common answer.",
    "Forbidden: hypernyms, hyponyms, topical associates, register-variants, derivatives, vaguely related words.",
    "Do NOT pad to look thorough. A clean [] is strictly better than a list with even one forced entry.",
  );
  return lines.join("\n");
}

// Backward-compat shims for legacy imports.
export function buildEnrichSystemPrompt(sourceLang: string): string {
  return buildPerMeaningExampleSystemPrompt(sourceLang);
}
export function buildEnrichUserPrompt(
  req: WordLookupRequest,
  meanings: Array<{ definition: string; partOfSpeech: string }>,
  lexiconHint?: string,
): string {
  return buildPerMeaningExampleUserPrompt(
    req, req.word, meanings[0] ?? { definition: "", partOfSpeech: "" }, lexiconHint,
  );
}

// ============================================================
// PROMPT: TRANSLATE_MEANING
// ============================================================

const TRANSLATE_MEANING_STATIC = `<role>Translate dictionary definitions from WORD_LANG to TARGET_LANG for a vocabulary app.</role>

<context>
Each input meaning was produced by an upstream analyzer and is correct as-is in WORD_LANG. Your job: produce the natural learner-facing TARGET_LANG translation per definition. Do NOT reinterpret, add encyclopedic context, or invent.
</context>

<schema>{ "meanings": [ { "definition": string, "partOfSpeech": string } ] }</schema>

<rules>
- Same count and order as input meanings.
- TARGET_LANG purity: every character in TARGET_LANG only. No WORD_LANG glosses, no English parentheticals, no third-language alternates.
- Concise dictionary style: equivalent word(s) in TARGET_LANG. Single word or comma-separated near-synonyms. Never descriptive sentences. Never cultural/historical/political/evaluative qualifiers ("traditional", "famous", "sacred", "controversial", "disputed", "ancient", "claimed by", "administered by").
- False-friend trap (translate the SENSE from input definition, never the spelling):
  • es "actual"=current → en "current" not "actual"
  • de "Gift"=poison → en "poison" not "gift"
  • es "embarazada"=pregnant → en "pregnant" not "embarrassed"
  • it "morbido"=soft → en "soft" not "morbid"
  • fr "lecture"=reading → ko 읽기/독서 not 강의
  • fr "coutume"=custom → ko 관습/풍습 not 세관
  • fr "sensible"=sensitive → ko 민감한 not 현명한
  • fr "chair"=flesh → ko 살/육신 not 의자
  • fr "monnaie"=currency/change → never collapse to just "money"
- Register: daily-life concepts (kinship/body/food/weather/common actions) → colloquial spoken form.
- Idioms/proverbs (when input def is the pragmatic meaning): translate as natural sentence-shaped explanation, not single phrase.
- Proper noun: "<transliteration in TARGET_LANG>, <short bare category in TARGET_LANG>" (1–3 words). Never sub-clauses or political/cultural qualifiers.
- Empty input meanings array → output {"meanings": []}.
</rules>

<verify_before_emit>
□ Same count and order as input.
□ Every definition entirely in TARGET_LANG.
□ False-friend check: input def's sense, not the homograph spelling.
□ No encyclopedic padding, no qualifiers.
</verify_before_emit>`;

export function buildTranslateMeaningSystemPrompt(
  sourceLang: string,
  targetLang: string,
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  return TRANSLATE_MEANING_STATIC
    .replace(/WORD_LANG/g, sourceName)
    .replace(/TARGET_LANG/g, targetName);
}

export interface CanonicalMeaning {
  definition: string;
  partOfSpeech: string;
  relevanceScore?: number;
  gender?: "m" | "f" | "n" | "mf";
}

export function buildTranslateMeaningUserPrompt(
  word: string,
  sourceLang: string,
  targetLang: string,
  meanings: CanonicalMeaning[],
  examples?: CanonicalExample[],
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const lines: string[] = [
    `Headword (${sourceName}): "${word}"`,
    `Translate ${meanings.length} meaning${meanings.length === 1 ? "" : "s"} below to ${targetName}.`,
    "",
    "Input meanings:",
  ];
  for (let i = 0; i < meanings.length; i++) {
    lines.push(`[${i}] (${meanings[i].partOfSpeech}) ${meanings[i].definition}`);
  }
  // Disambiguation anchor: when canonical definitions are identical or generic
  // (common for 1-syllable CJK homonyms where the source-side gloss is just
  // the headword itself), the example sentences are the ONLY signal for which
  // sense each slot represents. Pass them so the model can ground each slot
  // before translating.
  if (examples && examples.length > 0) {
    lines.push("",
      "Example sentences anchored to each meaning slot (use these to identify which sense each slot demonstrates — your translated definition for slot N must match the sense the slot-N example actually conveys):",
    );
    for (const ex of examples) {
      lines.push(`  [meaning_index ${ex.meaning_index}] ${ex.sentence}`);
    }
  }
  lines.push("",
    `Return JSON: {"meanings": [{"definition": "<in ${targetName}>", "partOfSpeech": "<in ${targetName}>"}]}`,
    "Same order, same count. Concise dictionary equivalent — no encyclopedic padding. When the canonical definitions are identical (homonyms collapsed to one surface form), use the example sentences as the disambiguating signal — your output for slot N MUST be the target-language equivalent of the sense the slot-N example exhibits.",
  );
  return lines.join("\n");
}

// ============================================================
// PROMPT: TRANSLATE_SENTENCE
// ============================================================

const TRANSLATE_SENTENCE_STATIC = `<role>Translate example sentences from WORD_LANG to TARGET_LANG for a vocabulary app.</role>

<context>
Each input has the headword wrapped in ** markers (WORD_LANG side). Produce a natural, fluent TARGET_LANG translation a native speaker would say.
</context>

<schema>{ "examples": [ { "translation": string } ] }</schema>

<rules priority="critical">
- Same count and order as input. NEVER skip an example. Every input example produces a non-empty translation.
- TARGET_LANG purity: every character in TARGET_LANG only. Cross-script: zero source-script characters in translation. EXCEPTION: digit / number / symbol / Latin-acronym headwords (42 / 3.14 / @ / NHK / NASA) — preserve those surface forms VERBATIM inside the translation, surrounded by TARGET_LANG natural prose. The digit / symbol / acronym is not "source script" in the cross-script sense; it's a universal numeral / symbol / proper-noun token.
- NO ** markers in translation (translation is plain prose).
- Naturalness wins: translate as a native would say. Do NOT force morphological alignment with source. Do NOT translate word-by-word when natural structure differs.
- Preserve headword's SPECIFIC sense: the translation conveys the same sense as the source sentence. Headword's TARGET_LANG equivalent appears naturally.
- HEADWORD TOKEN MUST APPEAR IN TRANSLATION (priority="critical"): the headword's primary TARGET_LANG translation (read it from the headword senses list above — the entry whose index matches the example's meaning_index) MUST appear in the translated sentence as a recognizable word or inflected form of that word. NEVER elide the headword by paraphrasing around it, by collapsing it into a verb/idiom that subsumes its meaning (translating a body-part-containing clause as a single verb of motion / posture / sensation that doesn't name the body part), or by restructuring so the headword's meaning is merely IMPLIED rather than spoken.

  The learner is studying THIS headword. The mapping signal — seeing the headword's translation token inside the translation — is the central pedagogical value of the example. Losing that signal in exchange for a marginal gain in idiomatic flow is the wrong trade.

  Decision rule when natural phrasing tempts you to elide the headword token:
  1. Try a SLIGHTLY less idiomatic phrasing that includes the token. A faintly stilted but accurate translation that contains the token beats a perfectly fluent translation that omits it.
  2. The token can appear in any inflected form (singular/plural, conjugated, possessive). What does NOT count: a synonym, a paraphrase, a culturally-equivalent idiom that drops the literal word, or an entailed-but-unspoken sense.
  3. If multiple senses share an example via meaning_index, the translation must include the SPECIFIC sense's translation token (not a different sense's token from the same headword's other meanings).
- DIGIT / SYMBOL / ACRONYM HEADWORD HANDLING: when the headword in the source sentence is a digit-only number (42, 1984, 3.14, 100), a pure symbol (@, #, *), or a Latin acronym (NHK, NASA, FBI), translate the SURROUNDING natural prose into TARGET_LANG while preserving the digit / symbol / acronym surface verbatim inside the translation. NEVER emit empty translation just because the headword is a numeric or symbol token.
  • WRONG: source "We studied **3.14** in math class." → translation: "" (skipped — wrong)
  • RIGHT: source "We studied **3.14** in math class." → ko: "우리는 수학 시간에 3.14를 배웠다." (digit preserved; surrounding translated)
  • RIGHT: source "Send mail to john**@**company.com." → ko: "john@company.com으로 메일을 보내세요." (@ preserved)
  • RIGHT: source "**NASA** announced a new mission yesterday." → ko: "NASA는 어제 새로운 임무를 발표했다." (acronym preserved)
</rules>

<target_grammar>
[Korean target] Verb-final (SOV). Main verb at clause end. Never SVO ("나는 먹는다 사과를" wrong → "나는 사과를 먹는다"). Applies to every clause including subordinate/quotative/progressive (~고 있다 — both stem and 있다 at end). Default register: 해요체 (polite-informal). Don't mix 반말 and 존댓말 in one example.

[Japanese target] Verb-final. Default: です/ます forms. Don't mix register.

[Chinese target] Standard written form. Avoid switching 你/您 unless headword is one.

[French target] ELISION MANDATORY. le/la/de/je/ne/que/ce/se/me/te → l'/d'/j'/n'/qu'/c'/s'/m'/t' before vowel-initial and h-muet. "Je écris" wrong → "J'écris". Scan every elidable word.

[German target] Nouns capitalized. Gender agreement on articles/adjectives.
</target_grammar>

<cross_script_purity>
Translation uses ONLY TARGET_LANG's native script (+ standard punctuation/numerals). NEVER leak source-script.
- ko target: Hangul exclusive (no Han, no kana, no Cyrillic).
- zh target: Han exclusive (no kana, no Hangul, no Cyrillic).
- ja target: hiragana/katakana/kanji as natural (no Hangul, no Cyrillic).
- Latin targets (en/es/fr/de/it/pt): Latin letters with diacritics (no Han, no kana, no Hangul, no Cyrillic).
- ru target: Cyrillic exclusive.
- Self-check: scan char-by-char. Replace any wrong-script char with target-script equivalent.
</cross_script_purity>

<sensitive_content>
Source has already been written to follow sensitive rules. Translate FAITHFULLY — do NOT inject your own neutralization, do NOT add qualifiers, do NOT soften.
Consensus events use canonical recognition language (genocide/massacre/대학살/大屠杀/대량학살). Never soften.
</sensitive_content>

<lemma_preservation>
The headword in source has a specific sense (provided in context). Translation conveys THAT sense, not a same-spelled homograph in TARGET_LANG. fr "lecture"(reading) → ko 읽기/독서, never 강의. fr "chair"(flesh) → ko 살, never 의자.
</lemma_preservation>

<verify_before_emit>
□ Same count and order as input.
□ Translation contains NO ** markers.
□ Translation entirely in TARGET_LANG (no source-script).
□ Korean target: every clause verb-final.
□ French target: every elidable token elided before vowel/h-muet.
□ Korea-position naming applied where relevant.
□ Headword's source-side specific sense conveyed (not homograph).
□ Headword's TARGET_LANG translation token APPEARS in the translation as a recognizable word — not elided into a verb/idiom that subsumes it.
</verify_before_emit>`;

export function buildTranslateSentenceSystemPrompt(
  sourceLang: string,
  targetLang: string,
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  return TRANSLATE_SENTENCE_STATIC
    .replace(/WORD_LANG/g, sourceName)
    .replace(/TARGET_LANG/g, targetName);
}

export interface CanonicalExample {
  sentence: string;
  meaning_index: number;
}

export function buildTranslateSentenceUserPrompt(
  word: string,
  sourceLang: string,
  targetLang: string,
  examples: CanonicalExample[],
  translatedMeanings?: { definition: string; partOfSpeech: string }[],
): string {
  const sourceName = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const lines: string[] = [
    `Headword (${sourceName}): "${word}"`,
    `Translate ${examples.length} sentence${examples.length === 1 ? "" : "s"} below to ${targetName}.`,
  ];
  if (translatedMeanings?.length) {
    lines.push("",
      `Headword senses in ${targetName} (pick matching sense per example via meaning_index):`);
    for (let i = 0; i < translatedMeanings.length; i++) {
      lines.push(`[${i}] (${translatedMeanings[i].partOfSpeech}) ${translatedMeanings[i].definition}`);
    }
  }
  lines.push("", "Input examples:");
  for (let i = 0; i < examples.length; i++) {
    lines.push(`[${i}] (meaning ${examples[i].meaning_index}) ${examples[i].sentence}`);
  }
  lines.push("",
    `Return JSON: {"examples": [{"translation": "<in ${targetName}>"}]}`,
    "Same order, same count. Plain prose, NO ** markers.",
  );
  return lines.join("\n");
}

// ============================================================
// PROMPT: REVERSE_LOOKUP (native lang → study lang)
// ============================================================

const REVERSE_LOOKUP_STATIC = `<role>Translate a word from FROM_LANG to TO_LANG for a vocabulary app. Return json.</role>

<schema>{ "candidates": [ { "headword": string, "hint": string } ], "note"?: "sentence" | "non_word" | "wrong_language" }</schema>

<rules priority="critical">
- Anti-fabrication: empty candidates + note ALWAYS better than guessed candidate. Never invent because input loosely resembles a real expression.
- Scope: a clause-shaped input you cannot identify as a SPECIFIC known fixed expression is "sentence", NOT a translation. Do not invent meaning by literally parsing.
- Compositional unit: each candidate is a real attested word/expression in TO_LANG meaning the input AS A WHOLE. Constituent-character meanings invalid.
- Purity: "headword" entirely in TO_LANG; "hint" entirely in FROM_LANG.
- Case-indifferent input (when FROM_LANG capitalizes proper nouns): the input is case-insensitive. If the letter sequence also names a proper noun (calendar period, weekday, name, place, brand), include BOTH proper-noun and common-word senses.
- Canonical casing on output (when TO_LANG capitalizes proper nouns): each headword uses native-writer spelling — proper nouns capitalized, common words lowercase. Never lowercase a proper noun nor uppercase a common one.
- No register/synonym padding: two near-synonyms at same register → return ONE (most everyday). Additional slots ONLY for DISTINCT senses (homonyms / different polysemy).
- When note set, candidates=[]. When candidates non-empty, note omitted.
</rules>

<scope_decision>
1. Single word / conventional fixed expression / proper noun / brand / work title → in scope.
2. Multi-word transliterated proper noun ("도널드 트럼프" → "Donald Trump") → in scope as single lexical unit.
3. Full sentence / creative multi-clause text not a fixed expression → candidates=[], note="sentence".
4. Gibberish / random characters → candidates=[], note="non_word".
5. Input not in FROM_LANG → candidates=[], note="wrong_language". This is STRICT: if "hello" is input while FROM_LANG=Korean, the input is English (not Korean), so emit wrong_language. Don't translate it as if it were a foreign loanword the FROM_LANG borrowed.
6. Grammatically-complete clause that IS a recognized fixed expression → in scope. Conventionality is the test, not grammar. INCLUDES question-form or polite-form fixed greetings like "よろしくお願いします" / "comment allez-vous" / "안녕하세요" / "你好吗" / "Wie geht's?" — these are dictionary-attested expressions despite their interrogative or sentence-like surface form. NEVER reject these as note="sentence".
7. Misspelled input — be GENEROUS with typo correction for common everyday words and fixed expressions:
   - Single typo character (e.g. "recieve" → "receive"; "definately" → "definitely"; "은햄" → "은행"; "사괘" → "사과" when context suggests apple typo; "merci beacoup" → "merci beaucoup"): emit the CORRECTED FROM_LANG lemma's translation in candidates. Do NOT emit literal-character interpretation of the typo (e.g. "은햄" as "silver ham" / "사괘" as "four trigrams" is fabrication if user clearly meant the common typo target).
   - When the typo input has a STRONG common-word correction match (Levenshtein distance ≤ 2 to a frequent FROM_LANG word), prefer that correction over a literal niche meaning.
   - When ambiguous between the typo correction and a real (rare) word matching the input, emit BOTH as candidates with disambiguating hints.
   - ONLY reject as "non_word" when 2+ unrelated character errors or no plausible correction match.
</scope_decision>

<selection>
- Return form a native uses in daily conversation. Prefer everyday/colloquial over formal/literary.
- Kinship/body/food/weather/common actions → ALWAYS colloquial, never formal Sino-Hanja.
- DO NOT include register variants of same meaning.
- DISTINCT senses (homonyms/polysemy) → each gets own candidate, hint names specific sense.
- Cap 4 candidates.
</selection>

<gender_handling applicable_when="TO_LANG ∈ {de,fr,es,it,pt,ru} AND referent is person">
- Distinct m/f forms (étudiant/étudiante, ami/amie, profesor/profesora, Lehrer/Lehrerin): emit BOTH as candidates (masc first, fem second).
- Epicene forms (élève, médecin, enfant, collègue): single surface for both.
- INPUT EXPLICITLY MARKS GENDER (ko 남-/여-, 남자/여자; ja 男/女; zh 男/女; en "male"/"female"/"woman"/"man"):
  • Emit ONLY matching-gender candidates. NEVER opposite.
  • Compound resolution: gender-marked compound (여학생) → base concept (학생) → matching-gender form (étudiante).
  • Epicene fallback when no m/f pair exists.
- INPUT GENDER-NEUTRAL:
  • m/f exists → emit BOTH (masc first).
  • Epicene also exists → ADD after m/f pair.
  • Only epicene exists → single epicene.
  • Never replace gendered alternatives with epicene just because epicene is "more common".
</gender_handling>

<dedup>Identical headword strings collapse to one. Never the same word twice with different hints (common pitfall for epicene labeled both genders).</dedup>

<hints>
- Identifies WHICH candidate this is, in FROM_LANG, max 12 chars.
- SINGLE candidate: hint empty or very short clarifier. No register tags.
- POLYSEMY VARIANTS: hint = specific sense in FROM_LANG.
- GENDER VARIANTS: hint = gender label in FROM_LANG (ko "남성형"/"여성형", ja "男性形"/"女性形", zh "阳性"/"阴性", en "(m.)"/"(f.)").
- candidates.length > 1: EVERY candidate MUST carry a non-empty disambiguating hint.
</hints>

<korea_position>
Cultural/disputed terms keep canonical TO_LANG form a Korean learner would use:
- 김치 → kimchi/辛奇 (not 泡菜 for zh)
- 한복 → hanbok/韩服 (not 朝鲜族服装)
- 독도 → Dokdo/独島 (not Takeshima/竹島 as primary)
- 동해 → East Sea (canonical)
- 백두산 → Mt. Paektu (not Changbaishan/长白山)
</korea_position>

<verify_before_emit>
□ Each headword entirely in TO_LANG.
□ Each hint entirely in FROM_LANG, ≤12 chars.
□ Each candidate is a real attested TO_LANG word/expression meaning input AS A WHOLE.
□ Clause-shaped non-fixed-expression → note="sentence" + candidates=[].
□ candidates.length > 1 → every candidate has non-empty hint.
</verify_before_emit>`;

export function buildReverseLookupSystemPrompt(
  fromLang: string,
  toLang: string,
): string {
  const fromName = LANG_NAMES[fromLang] ?? fromLang;
  const toName = LANG_NAMES[toLang] ?? toLang;
  return REVERSE_LOOKUP_STATIC
    .replace(/FROM_LANG/g, fromName)
    .replace(/TO_LANG/g, toName);
}

export function buildReverseLookupUserPrompt(word: string): string {
  return `"${word}"`;
}
