// stitch.ts
// -----------------------------------------------------------
// Combine a canonical WordEntry + WordTranslation into the
// existing WordLookupResult shape. Keeps the client-facing API
// stable across the v1 / v2 cutover.
//
// POS translation is deterministic (POS_BY_LANG bidirectional)
// — the AI never decides how 명사 maps to nom / Nomen / 名詞.
// This is the source of the "동일한 단어 동일한 품사" guarantee
// the split architecture promises.
// -----------------------------------------------------------

import type {
  WordEntry,
  WordTranslation,
  CanonicalMeaning,
  CanonicalExample,
  TranslatedMeaning,
  TranslatedExample,
} from "./cache-v2.ts";
import type { WordExample, WordLookupResult, WordMeaning } from "./types.ts";
import { POS_BY_LANG } from "./prompts-v2.ts";
import { fixExampleMarkers, normalizeResult } from "./normalize.ts";
import {
  balanceExamples,
  clampDefinitionLength,
  filterPeerAntonyms,
  guardHomographFabrication,
  realignExamplesByPos,
  sanitizeSynAnt,
} from "./normalize-v2.ts";
import { isSensitiveLookup } from "./disputes.ts";
import { getZhPolyphoneReadings } from "./polyphones.ts";
import { applyKoValidate } from "./validate-ko.ts";

function normalizeLangFamily(code: string): string {
  if (code === "zh-CN" || code === "zh-TW") return "zh";
  return code;
}

/**
 * Reverse lookup: given a localized POS term in any language, find
 * the canonical English POS key. Memoized.
 *
 * Beyond the canonical POS_BY_LANG entries, this map also covers the
 * common variants the AI emits (idiom for "expression", exclamation
 * for "interjection", etc.) so the deterministic mapping fires for
 * those too instead of falling back to AI-translated POS.
 */
const POS_ALIASES: Record<string, string> = {
  // expression (canonical) ← variants
  'idiom': 'expression', 'idiomatic expression': 'expression', 'phrase': 'expression',
  'fixed expression': 'expression', 'set phrase': 'expression', 'proverb': 'expression',
  '관용구': 'expression', '관용어': 'expression', '속담': 'expression', '수식': 'expression',
  '慣用句': 'expression', '熟語': 'expression', '諺': 'expression', 'ことわざ': 'expression',
  '成语': 'expression', '成語': 'expression', '俗语': 'expression', '俗語': 'expression',
  '表达式': 'expression', '表達式': 'expression',
  'expresión idiomática': 'expression', 'modismo': 'expression', 'refrán': 'expression',
  'expression idiomatique': 'expression', 'locution': 'expression', 'dicton': 'expression',
  'Redewendung': 'expression', 'Sprichwort': 'expression', 'idiomatischer Ausdruck': 'expression',
  'espressione idiomatica': 'expression', 'modo di dire': 'expression', 'proverbio': 'expression',
  'expressão idiomática': 'expression', 'provérbio': 'expression',
  // interjection ← variants
  'exclamation': 'interjection', '感嘆': 'interjection', '감탄어': 'interjection',
  '叹词': 'interjection', '嘆詞': 'interjection',
  'exclamación': 'interjection', 'exclamation (interjection)': 'interjection',
  'Ausruf': 'interjection', 'esclamazione': 'interjection',
  // numeral ← variants (2026-05-19: numeral is now its own POS at
  // position 10; AI emits "numeral" canonically and stitch maps to
  // 수사/数詞/数词 etc. via POS_BY_LANG positional. Aliases here only
  // cover alternative spellings the model occasionally emits.)
  'cardinal numeral': 'numeral', 'cardinal number': 'numeral',
  '数字': 'numeral', '고유 수사': 'numeral', '한자어 수사': 'numeral',
  'nombre cardinal': 'numeral', 'Zahlwort': 'numeral',
  // proper noun ← variants
  '고유 명사': 'proper noun', '専有名詞': 'proper noun',
  // particle / 조사 (no English equiv) → map to noun for fallback
  '조사': 'noun', '助詞': 'noun', '助词': 'noun',
  // symbol ← variants (2026-05-19: symbol is now its own POS at
  // position 11. Aliases cover alternative spellings only.)
  'sign': 'symbol', 'punctuation': 'symbol',
  '부호': 'symbol', '符號': 'symbol', 'символ': 'symbol',
  // noun ← cross-language variants the AI occasionally emits.
  // POS_BY_LANG has ONE canonical noun term per language; these aliases
  // catch the common synonym terms so translatePos resolves them to the
  // canonical form. Surfaced in 2026-05-19 cross-target audit.
  'Substantiv': 'noun', 'Hauptwort': 'noun', 'Nennwort': 'noun',
  'sostantivo': 'noun',
  'nombre': 'noun', 'sustantivo (nombre)': 'noun',
  'substantif': 'noun',
  // verb ← cross-language variants (rare but defensive)
  'Tätigkeitswort': 'verb', 'Tätigkeitsword': 'verb',
  // adjective ← cross-language variants (rare but defensive)
  'Eigenschaftswort': 'adjective',
  // Comprehensive cross-pair audit 2026-05-19 surfaced these patterns:
  // model emits English-uppercase or alt-form POS for non-EN targets.
  // Catching them lets translatePos resolve to the target's native POS.
  'Adverb': 'adverb', 'adverbe': 'adverb',
  'Verb': 'verb', 'Verbo': 'verb', 'verbe': 'verb',
  // numeral variants (German: Zahl is the common "number" noun the model
  // sometimes emits instead of the canonical Numerale)
  'Zahl': 'numeral', 'Zahlwort (Numerale)': 'numeral',
  'numero': 'numeral', 'numéro': 'numeral',
  'Adjektiv': 'adjective', 'adjectif': 'adjective', 'aggettivo': 'adjective', 'adjetivo': 'adjective',
  'Pronomen': 'pronoun', 'pronom': 'pronoun', 'pronome': 'pronoun', 'pronombre': 'pronoun',
  'Präposition': 'preposition', 'préposition': 'preposition', 'preposizione': 'preposition', 'preposición': 'preposition',
  'Konjunktion': 'conjunction', 'conjonction': 'conjunction', 'congiunzione': 'conjunction', 'conjunción': 'conjunction',
  'Interjektion': 'interjection',
  'Ausdruck': 'expression', 'expresión': 'expression', 'espressione': 'expression',
  // Lowercase variants (model occasionally outputs verb/noun/etc. lowercase
  // even for non-English targets that use uppercase nouns like German).
  'verb': 'verb', 'noun': 'noun', 'adjective': 'adjective',
  'adverb': 'adverb', 'pronoun': 'pronoun', 'preposition': 'preposition',
  'conjunction': 'conjunction', 'interjection': 'interjection',
  'expression': 'expression', 'numeral': 'numeral', 'symbol': 'symbol',
  'proper noun': 'proper noun',
};

let _reversePosMap: Map<string, string> | null = null;
function getReversePosMap(): Map<string, string> {
  if (_reversePosMap) return _reversePosMap;
  _reversePosMap = new Map();
  // POS_BY_LANG values are slash-separated lists; the corresponding
  // English keys are in the same order in POS_BY_LANG["en"].
  const englishOrder = POS_BY_LANG["en"].split("/");
  for (const [_, list] of Object.entries(POS_BY_LANG)) {
    const terms = list.split("/");
    for (let i = 0; i < Math.min(terms.length, englishOrder.length); i++) {
      _reversePosMap.set(terms[i], englishOrder[i]);
    }
  }
  // Add aliases (variants the AI emits but aren't in POS_BY_LANG).
  for (const [variant, canonical] of Object.entries(POS_ALIASES)) {
    if (!_reversePosMap.has(variant)) {
      _reversePosMap.set(variant, canonical);
    }
  }
  return _reversePosMap;
}

/**
 * Forward lookup: given the canonical English POS key + a target
 * lang, return the localized POS term.
 */
function localizedPos(englishKey: string, targetLang: string): string | null {
  const list = POS_BY_LANG[normalizeLangFamily(targetLang)] ?? POS_BY_LANG[targetLang];
  if (!list) return null;
  const englishList = POS_BY_LANG["en"].split("/");
  const targetList = list.split("/");
  const idx = englishList.indexOf(englishKey);
  if (idx < 0 || idx >= targetList.length) return null;
  return targetList[idx];
}

// ---------------------------------------------------------------
// Post-process fixes for known LLM hard-variance patterns
// (2026-05-19 late-late: comprehensive review surfaced these)
// ---------------------------------------------------------------

/**
 * Fix G1/G2: detect polysemy collapse and split. When canonical[i] has
 * comma-separated parts whose stems are identical (e.g. "배, 배(과일),
 * 배(배)" — all start with "배"), and translated[i] has same number of
 * comma-separated parts, split this single slot into N separate
 * meaning entries.
 *
 * Conservative: only fires when canonical stems are clearly the same
 * (root-equal). Synonym lists ("friend, companion") don't share
 * structural canonical patterns and are not split.
 */
export function splitPolysemyCollapse(
  meanings: { definition: string; partOfSpeech: string; relevanceScore?: number; gender?: string }[],
  translated: { definition: string; partOfSpeech: string }[] | undefined,
): {
  meanings: typeof meanings;
  translated: typeof translated;
} {
  if (!translated || meanings.length !== translated.length || meanings.length === 0) {
    return { meanings, translated };
  }
  const COMMA_SPLIT = /\s*[,，、]\s*/;
  const newMeanings: typeof meanings = [];
  const newTranslated: typeof translated = [];

  for (let i = 0; i < meanings.length; i++) {
    const m = meanings[i];
    const t = translated[i];
    const cParts = (m.definition ?? "").split(COMMA_SPLIT).filter(Boolean);
    const tParts = (t.definition ?? "").split(COMMA_SPLIT).filter(Boolean);

    // Detect polysemy collapse: same-stem canonical comma items + same
    // number of translated comma items.
    if (cParts.length >= 2 && cParts.length === tParts.length) {
      // Strip parens to get bare stem
      const stripParens = (s: string) =>
        s.replace(/[(（].*?[)）]/g, "").trim();
      const stems = cParts.map(stripParens);
      const firstStem = stems[0];
      const allSameStem = firstStem.length > 0 && stems.every((s) =>
        s === firstStem || s.startsWith(firstStem) || firstStem.startsWith(s)
      );

      if (allSameStem) {
        // Split into separate meaning entries
        for (let j = 0; j < cParts.length; j++) {
          newMeanings.push({ ...m, definition: cParts[j] });
          newTranslated.push({ ...t, definition: tParts[j] });
        }
        continue;
      }
    }
    // No collapse — keep as-is
    newMeanings.push(m);
    newTranslated.push(t);
  }

  return { meanings: newMeanings, translated: newTranslated };
}

/**
 * Fix J1: detect digit-by-digit English year reading and replace with
 * paired form. Only fires when source=zh-CN + target=en + 4-digit year
 * input (1900-2099) + translated definition matches "<digit> <digit>
 * <digit> <digit>" pattern.
 */
const YEAR_RE = /^(19|20)(\d{2})$/;
const DIGIT_BY_DIGIT_EN_RE = /^(zero|one|two|three|four|five|six|seven|eight|nine)\s+(zero|one|two|three|four|five|six|seven|eight|nine)\s+(zero|one|two|three|four|five|six|seven|eight|nine)\s+(zero|one|two|three|four|five|six|seven|eight|nine)$/i;

function _enNumWord(n: number): string {
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
  }
  return String(n);
}

function _enYearPaired(year: number): string {
  if (year >= 1100 && year <= 1999) {
    const high = Math.floor(year / 100);
    const low = year % 100;
    if (low === 0) return `${_enNumWord(high)} hundred`;
    if (low < 10) return `${_enNumWord(high)} oh-${_enNumWord(low)}`;
    return `${_enNumWord(high)} ${_enNumWord(low)}`;
  }
  if (year >= 2000 && year <= 2099) {
    const low = year - 2000;
    if (low === 0) return "two thousand";
    if (low < 10) return `two thousand ${_enNumWord(low)}`;
    return `twenty ${_enNumWord(low)}`;
  }
  return String(year);
}

export function fixEnglishYearReading(
  word: string,
  sourceLang: string,
  targetLang: string,
  translated: { definition: string; partOfSpeech: string }[] | undefined,
): { definition: string; partOfSpeech: string }[] | undefined {
  if (targetLang !== "en") return translated;
  if (sourceLang !== "zh-CN" && sourceLang !== "zh") return translated;
  if (!translated || translated.length === 0) return translated;
  const m = (word ?? "").trim().match(YEAR_RE);
  if (!m) return translated;
  const year = parseInt(word, 10);
  const def0 = (translated[0]?.definition ?? "").trim();
  if (!DIGIT_BY_DIGIT_EN_RE.test(def0)) return translated;
  return [
    { ...translated[0], definition: _enYearPaired(year) },
    ...translated.slice(1),
  ];
}

/**
 * Translate a localized POS term from one language to another via the
 * canonical English key. Returns the input unchanged if the mapping
 * can't be resolved (so AI-supplied free-text POS still passes through
 * gracefully).
 */
export function translatePos(
  posInSourceLang: string,
  targetLang: string,
): string {
  if (!posInSourceLang) return posInSourceLang;
  const englishKey = getReversePosMap().get(posInSourceLang.trim());
  if (!englishKey) return posInSourceLang;
  if (normalizeLangFamily(targetLang) === "en") return englishKey;
  return localizedPos(englishKey, targetLang) ?? posInSourceLang;
}

/**
 * Build the final WordLookupResult by stitching canonical word data
 * with the per-target translation layer. The result shape matches
 * the existing v1 API so the client code path is unchanged.
 *
 * - meanings: canonical relevanceScore/gender + translated definition/POS.
 * - examples: canonical sentence (with its ** markers) + translated translation (plain prose).
 * - reading/ipa/headword/confidence/note: pass-through from canonical.
 */
export function stitchResult(
  entry: WordEntry,
  translation: WordTranslation | null,
  targetLang?: string,
): WordLookupResult {
  // Rejection paths (note set) bypass translation entirely.
  if (entry.note) {
    return {
      headword: entry.headword,
      originalInput: entry.original_input ?? undefined,
      meanings: [],
      confidence: entry.confidence,
      note: entry.note as WordLookupResult["note"],
    };
  }

  // Pre-process: detect + split polysemy collapse (G1/G2) and fix
  // English year-reading digit-by-digit pattern (J1). These run BEFORE
  // the per-meaning POS/definition stitch so the count alignment stays
  // valid.
  let canonicalMeanings: CanonicalMeaning[] = entry.meanings;
  let translatedMeanings: TranslatedMeaning[] | undefined = translation?.meanings_translated;
  if (targetLang) {
    const split = splitPolysemyCollapse(canonicalMeanings, translatedMeanings);
    canonicalMeanings = split.meanings as CanonicalMeaning[];
    translatedMeanings = split.translated as TranslatedMeaning[] | undefined;
    translatedMeanings = fixEnglishYearReading(
      entry.word, entry.word_lang, targetLang, translatedMeanings,
    );
  }

  const meanings: WordMeaning[] = canonicalMeanings.map((m: CanonicalMeaning, i) => {
    const t: TranslatedMeaning | undefined = translatedMeanings?.[i];
    // POS is deterministic via POS_BY_LANG bidirectional mapping when
    // both source and target POS terms are known. AI-translated POS is
    // only used as a fallback when the canonical POS isn't in our table.
    // This is the source of the cross-language POS consistency guarantee.
    const deterministicPos = targetLang
      ? translatePos(m.partOfSpeech, targetLang)
      : null;
    const posInSource = m.partOfSpeech;
    const posFromAi = t?.partOfSpeech;
    const posFinal = (deterministicPos && deterministicPos !== posInSource)
      ? deterministicPos
      : (posFromAi ?? posInSource);
    return {
      // If translation didn't land (shouldn't happen on the happy path
      // but defensive), fall back to the canonical so the client never
      // sees an empty definition.
      definition: t?.definition ?? m.definition,
      partOfSpeech: posFinal,
      relevanceScore: m.relevanceScore ?? 80,
      ...(m.gender ? { gender: m.gender } : {}),
    };
  });

  // Pair canonical examples with their translations. When a target_lang
  // was requested AND the example's translation is missing or blank, drop
  // the example: half-rendered "sentence + empty translation" is worse than
  // no example at all (the learner can't map source → target without the
  // translation side). The empty-translation path is rare but observed at
  // ~1% pre-guard rate on shorter sentences.
  const examples: WordExample[] = entry.examples
    .map((ex: CanonicalExample, i) => {
      const t: TranslatedExample | undefined = translation?.examples_translated?.[i];
      return {
        sentence: ex.sentence,
        translation: t?.translation ?? "",
        meaningIndex: ex.meaning_index,
      };
    })
    .filter((ex) => {
      if (!targetLang) return true;
      return ex.translation && ex.translation.trim().length > 0;
    });

  // Normalize reading: client expects string | string[]. Single-element
  // arrays render fine via the existing client code path.
  let reading: string | string[] | undefined;
  if (Array.isArray(entry.reading) && entry.reading.length > 0) {
    reading = entry.reading.length === 1 ? entry.reading[0] : entry.reading;
  }

  // Chinese polyphone override: for single-character zh headwords that
  // are in our curated polyphone table, force the canonical reading
  // array. The LLM occasionally returns only one reading for true
  // polyphones (e.g. 长 → ["cháng"] instead of ["cháng", "zhǎng"]).
  // Deterministic fix so display + TTS always have the full set.
  if (entry.word_lang === "zh-CN" || entry.word_lang === "zh-TW") {
    const forced = getZhPolyphoneReadings(entry.word);
    if (forced) reading = forced;
  }

  return {
    headword: entry.headword,
    ipa: entry.ipa ?? undefined,
    reading,
    originalInput: entry.original_input ?? undefined,
    confidence: entry.confidence,
    meanings,
    synonyms: entry.synonyms.length > 0 ? entry.synonyms : undefined,
    antonyms: entry.antonyms.length > 0 ? entry.antonyms : undefined,
    examples: examples.length > 0 ? examples : undefined,
  };
}

/**
 * Full v2 post-processing chain:
 *   stitch  →  v1 normalizeResult  →  v2 filters  →  fixExampleMarkers
 *
 * This brings v2 to feature parity with v1's quality pipeline while
 * preserving the split architecture's cross-pair consistency.
 *
 * v1 normalizeResult does: POS safety net + Levenshtein POS correction,
 * meaning dedup, dispute rewrites on definitions, headword article
 * stripping, gender normalization, Chinese pinyin shape coercion,
 * MIN_RELEVANCE filter, MAX_MEANINGS cap.
 *
 * v2 filters do: peer-group antonym strip, homograph fabrication demote,
 * definition length clamp. Run AFTER v1's MIN_RELEVANCE filter so the
 * demote (relevanceScore=30) doesn't survive.
 *
 * fixExampleMarkers does: ** marker re-placement, particle stripping
 * for ko/ja, cross-script swap detection, dispute rewrites on
 * example translations.
 *
 * Order matters: clamp before normalizeResult so the dedup step sees
 * clamped definitions; v2 fabrication guard before any second pass.
 */
export function stitchAndNormalize(
  entry: WordEntry,
  translation: WordTranslation | null,
  targetLang: string,
): WordLookupResult {
  const stitched = stitchResult(entry, translation, targetLang);

  // Rejection path — no further processing needed.
  if (stitched.note) return stitched;

  // Clamp before homograph guard (homograph guard checks tokens; a
  // truncated definition is the canonical form for that check).
  const clamped = clampDefinitionLength(stitched);

  // Homograph fabrication demote (sets suspicious meanings to
  // relevanceScore=30 so v1's MIN_RELEVANCE=40 drops them).
  const guarded = guardHomographFabrication(clamped, entry.word_lang, targetLang);

  // v1 normalizeResult: POS, dedup, dispute rewrites, gender, MIN_RELEVANCE,
  // MAX_MEANINGS cap.
  const normalized = normalizeResult(guarded, targetLang, entry.word_lang);

  // Peer-group antonym strip (operates on headword + antonyms).
  const antFiltered = filterPeerAntonyms(normalized, entry.word_lang);

  // Drop orphaned examples + redistribute per the schedule.
  //
  // Drop orphaned: if normalizeResult removed a meaning (dedup or
  // MIN_RELEVANCE), any example whose meaningIndex points to the now-
  // gone meaning is misleading.
  //
  // Balance per schedule (1 meaning → 2 examples of idx 0; 2 meanings
  // → 2/1; 3+ meanings → 1 each). The AI occasionally violates this
  // (e.g. for 3-meaning headwords it emits 2/1/0 instead of 1/1/1);
  // `balanceExamples` enforces the contract in code.
  //
  // Sensitive lookups get a defensive cap of 1 regardless of meaning
  // count — the prompt also enforces this but the cap is belt-and-
  // suspenders in case the model returns more.
  if (antFiltered.examples?.length && antFiltered.meanings.length > 0) {
    // POS-aware realignment: per-meaning ENRICH sometimes generates a
    // sentence in the WRONG sense for the requested slot (e.g. asked
    // for verb-sense, returned a noun usage). Detect via surface-form
    // heuristics and swap meaning_index to a slot whose POS matches.
    // Runs before balanceExamples so distribution sees the corrected
    // indices.
    antFiltered.examples = realignExamplesByPos(
      antFiltered.meanings,
      antFiltered.examples,
      entry.word_lang,
    );
    const survivingCount = antFiltered.meanings.length;
    const sensitive = isSensitiveLookup(entry.word_lang, entry.word) ||
      isSensitiveLookup(entry.word_lang, entry.headword);
    const balanced = balanceExamples(antFiltered.examples, survivingCount);
    antFiltered.examples = sensitive ? balanced.slice(0, 1) : balanced;
  } else if (antFiltered.meanings.length === 0) {
    antFiltered.examples = undefined;
  }

  // Sanitize synonyms/antonyms: drop parenthetical "X (설명)" entries
  // (AI fabrication signature), strip headword self-references, dedup.
  if (antFiltered.synonyms?.length) {
    const cleaned = sanitizeSynAnt(antFiltered.synonyms, entry.headword);
    antFiltered.synonyms = cleaned.length > 0 ? cleaned : undefined;
  }
  if (antFiltered.antonyms?.length) {
    const cleaned = sanitizeSynAnt(antFiltered.antonyms, entry.headword);
    antFiltered.antonyms = cleaned.length > 0 ? cleaned : undefined;
  }

  // Fix example markers + apply dispute rewrites to example translations.
  // Use the normalized meanings' definitions (in target_lang) as
  // disambiguation context for the marker fixer.
  if (antFiltered.examples?.length) {
    const defs = antFiltered.meanings.map((m) => m.definition);
    antFiltered.examples = fixExampleMarkers(
      antFiltered.examples,
      entry.headword,
      entry.word_lang,
      targetLang,
      defs,
    );
  }

  // KO-specific deterministic post-process (drop bare-stem terminal,
  // marker on different lexeme, dedup near-duplicate meanings).
  const validated = applyKoValidate(antFiltered, entry.word_lang, entry.headword);

  // Sense-alignment guard: per-meaning parallel pins the meaning_index but
  // the model can still emit a sentence whose CONTENT belongs to a different
  // sense. Re-route examples to the meaning whose translated definition
  // tokens best match the example's translation. When no slot matches, the
  // example is dropped — a misleading example is worse than no example.
  const realigned = realignByTranslationTokens(validated, targetLang);

  // 1:1 enforcement: for multi-meaning headwords (≥2 meanings), every emitted
  // meaning MUST have an example. If the model couldn't construct an example
  // for a sense, DROP that meaning rather than showing it with no example —
  // the asymmetric display ("N meanings, M<N examples") confuses learners.
  // Single-meaning headwords are exempt (a noun without an example is still
  // legible).
  return enforceMeaningExampleParity(realigned);
}

function enforceMeaningExampleParity(result: WordLookupResult): WordLookupResult {
  const meanings = result.meanings ?? [];
  const examples = result.examples ?? [];
  if (meanings.length < 2) return result;
  if (examples.length === 0) return result;
  if (examples.length >= meanings.length) return result;

  // Collect indices that have at least one example.
  const indicesWithExample = new Set<number>();
  for (const ex of examples) {
    const idx = ex.meaningIndex ?? 0;
    if (idx >= 0 && idx < meanings.length) indicesWithExample.add(idx);
  }
  if (indicesWithExample.size >= meanings.length) return result;

  // Drop meanings with no example + renumber. Keep order.
  const oldToNew = new Map<number, number>();
  const newMeanings: WordMeaning[] = [];
  for (let i = 0; i < meanings.length; i++) {
    if (indicesWithExample.has(i)) {
      oldToNew.set(i, newMeanings.length);
      newMeanings.push(meanings[i]);
    }
  }
  if (newMeanings.length === 0) {
    // All meanings missing examples — keep meanings, drop examples (single-meaning fallback)
    return { ...result, examples: undefined };
  }

  const newExamples: WordExample[] = examples
    .filter((ex) => oldToNew.has(ex.meaningIndex ?? -1))
    .map((ex) => ({ ...ex, meaningIndex: oldToNew.get(ex.meaningIndex ?? 0) ?? 0 }));

  return {
    ...result,
    meanings: newMeanings,
    examples: newExamples.length > 0 ? newExamples : undefined,
  };
}

/**
 * Re-route each example to the meaning slot whose translated definition
 * tokens best match the example's translation. Handles the case where
 * per-meaning parallel pinned the slot index but the model emitted a
 * sentence demonstrating a different sense (e.g. pear sentence at the
 * stomach slot, stomach sentence at the pear slot).
 *
 * Procedure:
 *   1. Tokenize each meaning's definition.
 *   2. Compute "discriminating tokens" per meaning — tokens that appear
 *      in this meaning's definition but NOT in any other meaning's
 *      definition. These uniquely identify the sense.
 *   3. For each example, score each meaning slot by counting how many
 *      discriminating tokens appear in the example's translation. Assign
 *      to the highest-scoring slot, never to a slot already filled.
 *   4. Examples with zero discriminating-token match keep their original
 *      index if free, else are dropped.
 *
 * No-op when meanings count < 2 (single-sense headwords can't misalign)
 * or no target_lang requested (no translation to validate against).
 */
function realignByTranslationTokens(
  result: WordLookupResult,
  targetLang: string,
): WordLookupResult {
  if (!targetLang) return result;
  const meanings = result.meanings ?? [];
  const examples = result.examples ?? [];
  if (meanings.length < 2 || examples.length === 0) return result;

  const tokenize = (s: string): Set<string> =>
    new Set(
      (s || "")
        .toLowerCase()
        .replace(/[(),.;:!?'"`“”]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1),  // drop 1-char noise
    );

  const meaningTokenSets = meanings.map((m) => tokenize(m.definition || ""));
  const tokenFreq: Record<string, number> = {};
  for (const set of meaningTokenSets) {
    for (const t of set) tokenFreq[t] = (tokenFreq[t] ?? 0) + 1;
  }
  // Discriminating tokens: appear in exactly one meaning's definition.
  const discrim = meaningTokenSets.map((set) => {
    const out = new Set<string>();
    for (const t of set) if (tokenFreq[t] === 1) out.add(t);
    return out;
  });

  // Common stop-word filter so generic translation words don't drive matches.
  const STOP = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "of", "to", "in", "on", "at", "by", "for", "with", "as", "from",
    "my", "your", "his", "her", "its", "our", "their",
    "and", "or", "but", "so", "if", "then", "than",
    "this", "that", "these", "those", "it", "i", "we", "they", "you",
    "do", "did", "does", "have", "has", "had",
  ]);

  const newExamples: WordExample[] = [];
  const usedSlots = new Set<number>();

  for (const ex of examples) {
    const exTokens = tokenize(ex.translation || "");
    if (exTokens.size === 0) continue;

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < meanings.length; i++) {
      if (usedSlots.has(i)) continue;
      let score = 0;
      for (const t of discrim[i]) {
        if (STOP.has(t)) continue;
        if (exTokens.has(t)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestScore > 0 && bestIdx >= 0) {
      newExamples.push({ ...ex, meaningIndex: bestIdx });
      usedSlots.add(bestIdx);
      continue;
    }

    // No discriminating-token match. Fall back: keep original index if free.
    const orig = ex.meaningIndex ?? 0;
    if (orig < meanings.length && !usedSlots.has(orig)) {
      newExamples.push(ex);
      usedSlots.add(orig);
    }
    // Otherwise silently drop — better than misleading the learner.
  }

  // Stable sort by meaningIndex so the client display follows meaning order.
  newExamples.sort((a, b) => (a.meaningIndex ?? 0) - (b.meaningIndex ?? 0));

  return {
    ...result,
    examples: newExamples.length > 0 ? newExamples : undefined,
  };
}
