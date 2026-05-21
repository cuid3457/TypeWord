// validate-ko.ts
// -----------------------------------------------------------
// Deterministic KO-specific post-processors. Run after the LLM
// generates canonical + examples to catch the failure modes the
// prompt cannot reliably prevent.
//
// Checks (all return modified result; never throw):
//   1. dedupNearDuplicateMeanings:
//      Drop near-duplicate meanings (회사=company / corporation;
//      시간=time / hour; 친구=friend / buddy). Score by Jaccard
//      similarity on definition tokens; if ≥0.75, treat as dup.
//   2. dropBareStemTerminalExamples:
//      Korean verb headwords (X다): if an example ends in the bare
//      "X다." with no conjugation suffix, drop that example (it's
//      the most frequent flag pattern — "나는 학교에 가다.").
//   3. dropMarkerOnDifferentLexeme:
//      The ** marker must wrap the headword's stem (X for X다; X
//      itself for noun). If the marker text doesn't contain the
//      headword's stem character(s), drop the example.
//   4. afterDrop: balance + renumber meaning_index per existing
//      normalize-v2 contract.
// -----------------------------------------------------------

import type { WordLookupResult, WordMeaning, WordExample } from "./types.ts";

// --- 1. Dedup near-duplicate meanings ----------------------------

function tokenize(s: string): Set<string> {
  return new Set(
    s.normalize("NFKC").toLowerCase()
      .replace(/[(),.;]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Drop near-duplicate meanings (회사=company/corporation, 시간=time/hour).
 * Keeps the higher-relevance one. Renumbers example.meaningIndex.
 */
export function dedupNearDuplicateMeanings(
  result: WordLookupResult,
): WordLookupResult {
  const meanings = result.meanings ?? [];
  if (meanings.length < 2) return result;

  const keep: number[] = [];
  const indexMap = new Map<number, number>(); // old → new
  for (let i = 0; i < meanings.length; i++) {
    let isDup = false;
    const ti = tokenize(meanings[i].definition || "");
    for (const ki of keep) {
      const tk = tokenize(meanings[ki].definition || "");
      // Two-way containment: each side's tokens >= 75% in the other (handles
      // "company" vs "company, corporation" cases where one is a subset).
      const subsetSmall = (() => {
        const [s, l] = ti.size <= tk.size ? [ti, tk] : [tk, ti];
        let hit = 0;
        for (const t of s) if (l.has(t)) hit++;
        return s.size === 0 ? 0 : hit / s.size;
      })();
      if (jaccard(ti, tk) >= 0.5 || subsetSmall >= 0.65) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      indexMap.set(i, keep.length);
      keep.push(i);
    }
  }
  if (keep.length === meanings.length) return result;

  const newMeanings: WordMeaning[] = keep.map((i) => meanings[i]);
  const newExamples = (result.examples ?? [])
    .filter((ex) => indexMap.has(ex.meaningIndex ?? 0))
    .map((ex) => ({ ...ex, meaningIndex: indexMap.get(ex.meaningIndex ?? 0) ?? 0 }));

  return {
    ...result,
    meanings: newMeanings,
    examples: newExamples.length > 0 ? newExamples : undefined,
  };
}

// --- 2. Drop bare-stem terminal examples (ko verb) ----------------

/**
 * For a Korean verb/adjective headword (X다), an example sentence
 * ending with bare "X다." (no -ㄴ다/-는다/-았다/-았어요/-요/-습니다/etc.)
 * is a flag pattern. Drop those examples.
 *
 * Heuristic: take the last non-marker token of the sentence. If it's
 * exactly the headword (X다) with optional terminal punctuation, drop.
 * Allowed terminals: -ㄴ다 / -는다 / -았다 / -었다 / -니다 / -ㅂ니다 /
 *   -요 / -아요 / -어요 / -았어요 / -었어요 / -았어 / -었어 / -아 / -어 etc.
 *
 * The cleanest check: does the sentence terminal lemma EXACTLY equal
 * the headword? If yes, drop. (Adjectives in formal declarative writing
 * legitimately use bare -다, but that's the minority; learner-grade
 * examples should conjugate.)
 */
export function dropBareStemTerminalExamples(
  result: WordLookupResult,
  headword: string,
): WordLookupResult {
  if (!headword.endsWith("다")) return result;
  const examples = result.examples ?? [];
  if (examples.length === 0) return result;
  const meanings = result.meanings ?? [];
  // Adjective senses legitimately use bare -다 as terminal in declarative
  // writing (좋다, 작다, 예쁘다). Only flag bare-stem terminal when the
  // corresponding meaning is a verb sense.
  const isAdjective = (idx: number): boolean => {
    const m = meanings[idx];
    if (!m) return false;
    const pos = (m.partOfSpeech || "").toLowerCase();
    return pos === "형용사" || pos === "adjective" || pos === "形容詞" ||
           pos === "形容词" || pos === "adjetivo" || pos === "adjectif" ||
           pos === "adjektiv" || pos === "aggettivo";
  };
  const filtered = examples.filter((ex) => {
    if (isAdjective(ex.meaningIndex ?? 0)) return true;
    return !isBareStemTerminal(ex.sentence, headword);
  });
  if (filtered.length === examples.length) return result;
  return { ...result, examples: filtered.length > 0 ? filtered : undefined };
}

function isBareStemTerminal(sentence: string, headword: string): boolean {
  if (!sentence) return false;
  // Strip ** markers and trailing punctuation/whitespace.
  const clean = sentence.replace(/\*\*/g, "").replace(/[.!?。!?]+\s*$/, "").trim();
  if (!clean) return false;
  // Take the last whitespace-delimited token. If the sentence has no
  // spaces (rare), the whole sentence is the terminal.
  const tokens = clean.split(/\s+/);
  const lastToken = tokens[tokens.length - 1];
  return lastToken === headword;
}

// --- 2b. Noun headword: marker MUST end with headword exactly -----

/**
 * For noun headwords (NOT ending in -다), the marker text MUST equal
 * the headword exactly. Otherwise it's a verb-form usage (X하다) which
 * means the example demonstrates a different lexeme.
 *
 * Examples to drop:
 *   - headword 소개 (noun) + example "**소개했다**" → marker "소개했다" ≠ "소개" → drop
 *   - headword 졸업 (noun) + example "**졸업한다**" → drop
 *   - headword 교체 (noun) + example "**교체했다**" → drop
 *
 * Keep:
 *   - headword 소개 + example "**소개**가 끝났다" → marker "소개" === headword → keep
 *
 * Edge case: noun + particle inside marker (e.g. "**소개**를" with 를
 * outside markers should already be the norm; we only check if the
 * marker text starts with the headword stem).
 */
export function dropNounVerbFormExamples(
  result: WordLookupResult,
  headword: string,
): WordLookupResult {
  // Only apply to noun headwords (not -다 verbs/adjectives).
  if (headword.endsWith("다")) return result;
  // Skip 1-char Sino monosyllables — those have a separate frame system
  // (numeral / standalone noun / meta-suffix).
  if (headword.length === 1) return result;
  const examples = result.examples ?? [];
  if (examples.length === 0) return result;
  // Partition examples into bare-noun (preferred) and verb-form (fallback).
  const bareNoun: typeof examples = [];
  const verbForm: typeof examples = [];
  for (const ex of examples) {
    const m = ex.sentence?.match(/\*\*([^*]+)\*\*/);
    if (!m) continue;
    const marked = m[1].trim();
    if (marked === headword || marked === headword + "들") bareNoun.push(ex);
    else verbForm.push(ex);
  }
  // Prefer bare-noun examples. If we have ≥1 bare-noun, drop all verb-form.
  if (bareNoun.length > 0) {
    if (bareNoun.length === examples.length) return result;
    return { ...result, examples: bareNoun };
  }
  // All examples are verb-form (noun-only-as-X하다 case like 산책, 축하,
  // 입원, 출근). Keep 1 verb-form example — empty array would hurt the
  // learner more than a minor marker imprecision.
  if (verbForm.length === 0) return result;
  return { ...result, examples: verbForm.slice(0, 1) };
}

// --- 3. Drop marker on different lexeme ---------------------------

/**
 * The ** marker must wrap the headword's stem (X for X다, X for noun).
 * Drop examples where the bolded substring doesn't contain the
 * headword's stem character(s).
 *
 * Stem extraction:
 *   - Verb/adj X다: stem = X (strip 다).
 *   - Noun X: stem = X.
 *   - 하다 verbs (운동하다): stem = 운동 (strip 하다). Use last 2 chars
 *     as a soft check for short hops.
 *
 * Soft policy: if the marker substring contains the stem (substring
 * match — not exact), keep. Examples:
 *   - headword 가다 → stem 가 → marker "**간다**" contains 가 → keep.
 *   - headword 살다 → stem 살 → marker "**번다**" doesn't contain 살 → drop.
 *   - headword 보다 → stem 보 → marker "**시험해 본다**" contains 본 (a form of 보) → keep,
 *     so this gate is permissive. Use prompt-side rules for tighter check.
 */
export function dropMarkerOnDifferentLexeme(
  result: WordLookupResult,
  headword: string,
): WordLookupResult {
  const examples = result.examples ?? [];
  if (examples.length === 0) return result;
  // Skip for Korean verb/adj headwords — the stem character mutates
  // across conjugations (쓰→쓴, 살→산, 보→본, 쓰→썼) and a literal
  // glyph-includes check produces too many false drops. Rely on the
  // prompt-side marker rules for verb headwords.
  if (headword.endsWith("다")) return result;
  const stem = headword;
  if (!stem) return result;
  const filtered = examples.filter((ex) => {
    const m = ex.sentence?.match(/\*\*([^*]+)\*\*/);
    if (!m) return false; // no marker — drop
    const marked = m[1].trim();
    if (stem.length === 1) return marked.includes(stem);
    let hit = 0;
    for (const ch of stem) if (marked.includes(ch)) hit++;
    return hit >= Math.ceil(stem.length / 2);
  });
  if (filtered.length === examples.length) return result;
  return { ...result, examples: filtered.length > 0 ? filtered : undefined };
}

// --- 4. Enforce single-sense for monosyllabic body-part nouns ----

/**
 * Curated set of Korean monosyllabic body-part nouns. For these headwords,
 * the body-part sense overwhelmingly dominates everyday modern usage; any
 * secondary sense the model emits is almost always a hallucination
 * (length unit, action gerund, archaic counter). Models cannot reliably
 * resist these priors via prompt alone — verified empirically across
 * multiple regenerations.
 *
 * For ANY headword in this set, post-process forces single-sense emission:
 *   - Keep meanings[0] (the body-part primary).
 *   - Drop all subsequent meanings + their examples.
 *
 * If the model accidentally put a non-body-part sense at index 0 and the
 * body-part at index ≥ 1, swap so the body-part lands at index 0 first,
 * then truncate.
 */
/**
 * Per-headword allowed-translation map for Korean monosyllabic body parts.
 * Each entry constrains which English translation tokens are admissible
 * for that headword. Senses whose translation falls outside the set are
 * dropped as hallucinations. Entries include legitimate homonyms (눈 has
 * both "eye" and "snow"; 배 has belly + pear + boat + multiplier).
 *
 * Maintenance note: keep entries narrow. A token in the set is a positive
 * signal — adding "leg" to 발 would let "leg" hallucinations through.
 * Only add tokens that correspond to an attested everyday sense of the
 * headword in modern Korean.
 */
const KO_BODY_PART_ALLOWED_TRANSLATIONS: Record<string, Set<string>> = {
  "눈": new Set(["eye", "eyes", "snow"]),
  "귀": new Set(["ear", "ears"]),
  "코": new Set(["nose"]),
  "입": new Set(["mouth"]),
  "혀": new Set(["tongue"]),
  "볼": new Set(["cheek", "cheeks"]),
  "턱": new Set(["chin", "jaw"]),
  "목": new Set(["neck", "throat", "voice"]),
  "손": new Set(["hand", "hands"]),
  "발": new Set(["foot", "feet"]),
  "팔": new Set(["arm", "arms"]),
  "배": new Set(["belly", "stomach", "abdomen", "pear", "boat", "ship", "times", "fold"]),
  "등": new Set(["back"]),
  "살": new Set(["flesh", "skin", "age"]),
  "뼈": new Set(["bone", "bones"]),
  "간": new Set(["liver"]),
  "폐": new Set(["lung", "lungs"]),
  "위": new Set(["stomach", "top", "above"]),
  "장": new Set(["intestine", "intestines", "gut", "guts"]),
};

const KO_MONOSYLLABIC_BODY_PARTS = new Set<string>(
  Object.keys(KO_BODY_PART_ALLOWED_TRANSLATIONS),
);

const BODY_PART_TRANSLATION_TOKENS = new Set<string>(
  Object.values(KO_BODY_PART_ALLOWED_TRANSLATIONS).flatMap((s) => Array.from(s)),
);

function tokenizeDef(def: string): string[] {
  return (def || "")
    .toLowerCase()
    .replace(/[()[\],.;:!?]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function looksLikeBodyPartTranslation(def: string): boolean {
  const tokens = tokenizeDef(def);
  return tokens.some((t) => BODY_PART_TRANSLATION_TOKENS.has(t));
}

/**
 * Models sometimes merge a fabricated sense and the real body-part sense
 * into one comma-separated definition ("unit of length, foot"). Strip the
 * fabricated clause and keep only the body-part comma-segment.
 *
 * Conservative: if the definition has no comma, return verbatim. If splitting
 * by comma yields segments where some look like body parts and others look
 * like length/measure clauses, drop the latter.
 */
const MEASURE_CLAUSE_RE =
  /\b(?:unit|measure|measurement|length|distance|height|inch(?:es)?|cm|mm|km|feet|foot|yard|yards|mile|miles|approx|approximately|약)\b|길이|단위|치수|거리|높이|피트|미터|센티/i;

function looksLikeMeasureClause(seg: string): boolean {
  const s = seg.toLowerCase();
  // A pure body-part token (foot/feet) is OK on its own; flag only when
  // a length/measure marker is also present.
  const hasMeasure = MEASURE_CLAUSE_RE.test(s);
  if (!hasMeasure) return false;
  const hasMeasureSpecific = /\b(?:unit|measure|measurement|length|distance|height|inch(?:es)?|cm|mm|km|yard|mile|approx|approximately|약)\b|길이|단위|치수|거리|높이|피트|미터|센티/i.test(s);
  return hasMeasureSpecific;
}

function cleanBodyPartDefinition(def: string, allowed?: Set<string>): string {
  if (!def) return def;

  // Aggressive cleaning for definitions that mix a length-unit / measure
  // clause with an allowed body-part token (e.g. "unit of length (foot)",
  // "foot — about 30 cm", "unit (foot)"). When such a definition contains
  // ANY token from the per-headword allowed set AND a measure marker, replace
  // the whole definition with just the allowed tokens joined.
  if (allowed && looksLikeMeasureClause(def)) {
    const tokens = tokenizeDef(def);
    const kept = tokens.filter((t) => allowed.has(t));
    if (kept.length > 0) {
      // Deduplicate while preserving first-occurrence order.
      const seen = new Set<string>();
      const ordered = kept.filter((t) => {
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      });
      return ordered.join(", ");
    }
  }

  // Comma-separated cleanup (drop "leg" from "foot, leg" when 발's allowed
  // set is {foot, feet}).
  if (!def.includes(",")) return def;
  const segments = def.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return def;
  const cleaned = segments.filter((seg) => {
    const tokens = tokenizeDef(seg);
    if (looksLikeMeasureClause(seg)) return false;
    if (allowed) {
      return tokens.some((t) => allowed.has(t));
    }
    return tokens.some((t) => BODY_PART_TRANSLATION_TOKENS.has(t));
  });
  if (cleaned.length === 0 || cleaned.length === segments.length) return def;
  return cleaned.join(", ");
}

/**
 * Set of English action-noun tokens whose Korean lexeme is a separate verb
 * (차다 / 잡다 / 보다 / 듣다 / 먹다 / 말하다 etc.) — NOT a sense of the
 * body-part noun. Models pad body-part headwords with these on poor runs.
 */
const ACTION_GERUND_TOKENS = new Set<string>([
  "kick", "kicking", "kicks",
  "grip", "grasp", "grasping", "gripping",
  "punch", "punching",
  "hit", "hitting", "strike", "striking",
  "see", "seeing", "sight", "look", "looking", "view", "viewing",
  "hear", "hearing", "listen", "listening",
  "smell", "smelling", "sniff",
  "taste", "tasting",
  "eat", "eating", "bite", "biting",
  "speak", "speaking", "talk", "talking", "say", "saying",
  "walk", "walking", "step", "stepping",
  "breathe", "breathing", "breath",
]);

/**
 * For monosyllabic body-part headwords, drop SECONDARY senses that are
 * obviously hallucinated (length unit, archaic measurement, action gerund
 * of a Korean verb). Legitimate homonyms (눈 = eye / snow, 배 = belly /
 * pear / ship) are preserved because their secondaries do NOT match these
 * patterns.
 *
 * The PRIMARY (index 0) is also cleaned: if its definition merges a
 * body-part token with a length-unit clause ("unit of length, foot"), the
 * length clause is stripped so only the body-part remains visible.
 */
export function forceBodyPartSingleSense(
  result: WordLookupResult,
  headword: string,
): WordLookupResult {
  const allowed = KO_BODY_PART_ALLOWED_TRANSLATIONS[headword];
  if (!allowed) return result;
  const meanings = result.meanings ?? [];
  if (meanings.length === 0) return result;

  // A meaning is admissible if any token in its definition matches the
  // per-headword allowed translation set. Hallucinations (length units,
  // action gerunds, unrelated body parts) fail this check by definition.
  const isAdmissibleSense = (def: string): boolean => {
    const tokens = tokenizeDef(def);
    return tokens.some((t) => allowed.has(t));
  };

  const keepMask = meanings.map((m) => isAdmissibleSense(m.definition || ""));

  // If NO meaning is admissible, the LLM completely missed the mark.
  // Fall back to the primary so the client never receives an empty
  // meanings array — the user will see the broken sense and can report it.
  if (!keepMask.some(Boolean)) {
    return {
      ...result,
      meanings: [{
        ...meanings[0],
        definition: cleanBodyPartDefinition(meanings[0].definition || "", allowed),
      }],
      examples: (result.examples ?? []).filter((ex) => (ex.meaningIndex ?? 0) === 0)
        .map((ex) => ({ ...ex, meaningIndex: 0 })),
    };
  }

  const indexMap = new Map<number, number>();
  const newMeanings: WordMeaning[] = [];
  meanings.forEach((m, oldIdx) => {
    if (keepMask[oldIdx]) {
      indexMap.set(oldIdx, newMeanings.length);
      newMeanings.push({
        ...m,
        definition: cleanBodyPartDefinition(m.definition || "", allowed),
      });
    }
  });

  const newExamples: WordExample[] = (result.examples ?? [])
    .filter((ex) => indexMap.has(ex.meaningIndex ?? 0))
    .map((ex) => ({ ...ex, meaningIndex: indexMap.get(ex.meaningIndex ?? 0) ?? 0 }));

  return {
    ...result,
    meanings: newMeanings,
    examples: newExamples.length > 0 ? newExamples : undefined,
  };
}

// --- 5. Combined entry point --------------------------------------

/**
 * Apply all KO post-processors in order. Safe no-op when source isn't
 * Korean.
 */
export function applyKoValidate(
  result: WordLookupResult,
  sourceLang: string,
  headword: string,
): WordLookupResult {
  if (sourceLang !== "ko") return result;
  let r = result;
  r = dedupNearDuplicateMeanings(r);
  r = forceBodyPartSingleSense(r, headword);
  r = dropBareStemTerminalExamples(r, headword);
  r = dropNounVerbFormExamples(r, headword);
  r = dropMarkerOnDifferentLexeme(r, headword);
  return r;
}
