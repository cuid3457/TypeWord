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
  // numeral ← variants
  'numeral': 'noun', 'cardinal numeral': 'noun', 'cardinal number': 'noun',
  '수사': 'noun', '数词': 'noun', '数詞': 'noun', '数字': 'noun',
  '고유 수사': 'noun', '한자어 수사': 'noun',
  'número': 'noun', 'nombre cardinal': 'noun', 'Zahlwort': 'noun', 'numero': 'noun',
  // proper noun ← variants
  '고유 명사': 'proper noun', '専有名詞': 'proper noun',
  // particle / 조사 (no English equiv) → map to noun for fallback
  '조사': 'noun', '助詞': 'noun', '助词': 'noun',
  // symbol / 기호 ← variants (AI emits for punctuation, math symbols)
  'symbol': 'expression', 'sign': 'expression', 'punctuation': 'expression',
  '기호': 'expression', '부호': 'expression',
  '記号': 'expression', '符号': 'expression', '符號': 'expression',
  'símbolo': 'expression', 'signe': 'expression', 'Symbol': 'expression',
  'simbolo': 'expression', 'символ': 'expression',
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

  const meanings: WordMeaning[] = entry.meanings.map((m: CanonicalMeaning, i) => {
    const t: TranslatedMeaning | undefined = translation?.meanings_translated?.[i];
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

  const examples: WordExample[] = entry.examples.map((ex: CanonicalExample, i) => {
    const t: TranslatedExample | undefined = translation?.examples_translated?.[i];
    return {
      sentence: ex.sentence,
      translation: t?.translation ?? "",
      meaningIndex: ex.meaning_index,
    };
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

  return antFiltered;
}
