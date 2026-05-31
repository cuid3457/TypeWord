// Per-dict POS normalization. Each source dict uses its own raw POS strings
// (krdict "명사" / jmdict "n,v5r" / wiktionary "noun" / cedict empty). We map
// raw → a canonical position index → its CANONICAL ENGLISH name.
//
// English is the storage form because the card's POS label must follow the
// user's UI language (their native language), not the wordlist's target. A
// Korean user looking up ko→en should still see "명사", not "noun" — so the
// client owns the final localization (translatePOS in normalizeResult.ts).
//
// Canonical positions (must match POS_BY_LANG in prompts-v3.ts EXACTLY):
//   0 noun · 1 verb · 2 adjective · 3 adverb · 4 preposition · 5 conjunction
//   6 interjection · 7 pronoun · 8 proper noun · 9 expression
//   10 numeral · 11 symbol

// Raw POS → canonical index, by source.
const POS_MAP: Record<string, Record<string, number>> = {
  wiktionary: {
    noun: 0, n: 0,
    verb: 1, v: 1,
    adjective: 2, adj: 2,
    adverb: 3, adv: 3,
    preposition: 4, prep: 4, postp: 4,
    conjunction: 5, conj: 5,
    interjection: 6, intj: 6, interj: 6,
    pronoun: 7, pron: 7,
    "proper noun": 8, "proper-noun": 8, name: 8,
    phrase: 9, expression: 9, idiom: 9, proverb: 9, particle: 9, prt: 9,
    article: 9, det: 9, determiner: 9, "auxiliary verb": 9, aux: 9,
    numeral: 10, num: 10, "cardinal-number": 10, "ordinal-number": 10,
    symbol: 11, letter: 11, abbrev: 11, abbreviation: 11, punct: 11,
    prefix: 11, suffix: 11, affix: 11, "alphabet-letter": 11, character: 11,
  },
  freedict: {
    noun: 0, n: 0,
    verb: 1, v: 1,
    adjective: 2, adj: 2,
    adverb: 3, adv: 3,
    preposition: 4, prep: 4,
    conjunction: 5, conj: 5,
    interjection: 6, intj: 6, interj: 6,
    pronoun: 7, pron: 7,
    "proper noun": 8, "proper-noun": 8, name: 8,
    phrase: 9, expression: 9, idiom: 9, particle: 9, prt: 9,
    article: 9, det: 9, determiner: 9,
    numeral: 10, num: 10,
    symbol: 11, abbrev: 11, abbreviation: 11,
    prefix: 11, suffix: 11, affix: 11,
  },
  krdict: {
    "명사": 0, "의존 명사": 0, "의존명사": 0,
    "동사": 1, "보조 동사": 1, "보조동사": 1,
    "형용사": 2, "보조 형용사": 2, "보조형용사": 2, "관형사": 2,
    "부사": 3,
    "감탄사": 6,
    "대명사": 7,
    "수사": 10,
    "조사": 9,
    "접사": 11, "어미": 11,
    "품사 없음": 11, "품사없음": 11,
  },
  jmdict: {
    // Nouns
    n: 0, "n-suf": 0, "n-t": 0, "n-adv": 0, "n-pref": 0, ctr: 0, cnt: 0,
    "n-pr": 8,
    // Verbs (all godan/ichidan/irregular collapse to verb)
    v1: 1, "v1-s": 1,
    v5: 1, v5b: 1, v5g: 1, v5k: 1, "v5k-s": 1, v5m: 1, v5n: 1,
    v5r: 1, "v5r-i": 1, v5s: 1, v5t: 1, v5u: 1, "v5u-s": 1, v5aru: 1,
    "v5b-s": 1, "v5g-s": 1,
    vs: 1, "vs-i": 1, "vs-s": 1, "vs-c": 1,
    vk: 1, vz: 1, vn: 1, vr: 1, "v-unspec": 1,
    vi: 1, vt: 1,
    "aux-v": 9, aux: 9, "aux-adj": 9,
    // Adjectives
    "adj-i": 2, "adj-ix": 2, "adj-na": 2, "adj-no": 2, "adj-pn": 2,
    "adj-t": 2, "adj-f": 2, "adj-kari": 2, "adj-ku": 2, "adj-shiku": 2,
    "adj-nari": 2,
    adv: 3, "adv-to": 3,
    conj: 5,
    int: 6,
    pn: 7,
    exp: 9, prt: 9,
    num: 10,
    pref: 11, suf: 11, unc: 11,
  },
  cedict: {}, // CEDICT doesn't expose POS structurally — POS comes from the AI judge instead (see unified judge's pos field).
  // LLM-derived POS strings (neologism path + judge-inferred POS). Same
  // English vocabulary as wiktionary's map plus a few learner-card synonyms
  // that GPT models commonly emit.
  llm: {
    noun: 0, n: 0,
    verb: 1, v: 1,
    adjective: 2, adj: 2,
    adverb: 3, adv: 3,
    preposition: 4, prep: 4, postposition: 4, postp: 4,
    conjunction: 5, conj: 5,
    interjection: 6, intj: 6, interj: 6, exclamation: 6,
    pronoun: 7, pron: 7,
    "proper noun": 8, "proper-noun": 8, name: 8,
    phrase: 9, expression: 9, idiom: 9, proverb: 9, particle: 9, prt: 9,
    article: 9, det: 9, determiner: 9, "auxiliary verb": 9, aux: 9,
    // Chinese classifiers (量词/measure words) appear as cedict POS labels
    // the LLM infers — map to expression (canonical 9) so they render
    // instead of dropping to empty "-". Similarly for Korean grammatical
    // particles the LLM might emit in English.
    classifier: 9, "measure word": 9, "bound form": 9,
    numeral: 10, num: 10, "cardinal-number": 10, "ordinal-number": 10,
    symbol: 11, letter: 11, abbrev: 11, abbreviation: 11,
    prefix: 11, suffix: 11, affix: 11,
  },
};

// Canonical English POS labels by index. Client localizes to UI language via
// POS_MAP in src/utils/normalizeResult.ts.
const CANONICAL_EN: string[] = [
  "noun", "verb", "adjective", "adverb", "preposition", "conjunction",
  "interjection", "pronoun", "proper noun", "expression", "numeral", "symbol",
];

function posCanonicalIndex(rawPos: string | undefined, source: string): number | undefined {
  if (!rawPos) return undefined;
  const map = POS_MAP[source];
  if (!map) return undefined;
  // JMdict pos is comma-joined ("n,vs"), take the first significant token.
  // Other dicts have a single token already.
  for (const token of rawPos.split(",")) {
    const t = token.trim().toLowerCase();
    if (t in map) return map[t];
  }
  return undefined;
}

export function posCanonical(rawPos: string | undefined, source: string): string {
  const idx = posCanonicalIndex(rawPos, source);
  if (idx === undefined) return "";
  return CANONICAL_EN[idx] ?? "";
}
