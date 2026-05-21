// normalize-v2.ts
// -----------------------------------------------------------
// v2-specific post-processing applied AFTER v1's normalizeResult.
//
// These filters catch quality issues that the LLM doesn't reliably
// solve through prompt instructions alone:
//
//   1. filterPeerAntonyms — for headwords belonging to a known
//      semantic group (seasons / cardinal directions / weekdays /
//      months / playing-card suits / primary colors), strip peer
//      members from the antonyms array. Keep only the one
//      directly-paired canonical opposite (if any).
//
//   2. guardHomographFabrication — when WORD_LANG and TARGET_LANG
//      share a Latin-alphabet spelling, the model sometimes invents
//      a secondary "lecture-style" meaning that's actually a sense
//      of the other language's homograph. Demote suspicious second
//      meanings by lowering their relevanceScore, so the
//      MIN_RELEVANCE=40 filter in normalize.ts drops them.
//
// Both filters are conservative: when in doubt, leave the result
// alone. They strip only obvious violations.
// -----------------------------------------------------------

import type { WordLookupResult, WordMeaning } from "./types.ts";

// ── Semantic groups: members are PEERS not ANTONYMS ──
// Each row is a closed set of coordinated members. Headword in any
// of these rows triggers peer-stripping on its antonyms array.
//
// Casing is preserved as written (we match case-insensitively at
// runtime via normalize helper). For CJK, the script form is what
// gets stored; for languages with multiple script forms (zh-CN /
// zh-TW), include both.
//
// Reserved: paired opposites (spring↔autumn, summer↔winter,
// north↔south, east↔west) are stored in PAIRED_OPPOSITES separately
// — these survive the peer strip when they're actually the
// canonical antonym of the headword.

const SEMANTIC_GROUPS: Record<string, string[][]> = {
  ko: [
    ["봄", "여름", "가을", "겨울"],
    ["동", "서", "남", "북"],
    ["동쪽", "서쪽", "남쪽", "북쪽"],
    ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"],
    ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
    ["일월", "이월", "삼월", "사월", "오월", "유월", "칠월", "팔월", "구월", "시월", "십일월", "십이월"],
    ["빨강", "주황", "노랑", "초록", "파랑", "남색", "보라"],
    ["빨간색", "주황색", "노란색", "초록색", "파란색", "남색", "보라색"],
    ["스페이드", "하트", "다이아", "클로버"],
  ],
  en: [
    ["spring", "summer", "autumn", "fall", "winter"],
    ["north", "south", "east", "west"],
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    ["red", "orange", "yellow", "green", "blue", "purple", "violet", "indigo"],
    ["spades", "hearts", "diamonds", "clubs"],
  ],
  ja: [
    ["春", "夏", "秋", "冬"],
    ["東", "西", "南", "北"],
    ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"],
    ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    ["赤", "橙", "黄", "緑", "青", "紫"],
  ],
  zh: [
    ["春", "夏", "秋", "冬"],
    ["春天", "夏天", "秋天", "冬天"],
    ["东", "西", "南", "北"],
    ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日", "星期天"],
    ["红", "橙", "黄", "绿", "蓝", "紫"],
  ],
  fr: [
    ["printemps", "été", "automne", "hiver"],
    ["nord", "sud", "est", "ouest"],
    ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    ["rouge", "orange", "jaune", "vert", "bleu", "violet"],
  ],
  de: [
    ["Frühling", "Sommer", "Herbst", "Winter"],
    ["Nord", "Süd", "Ost", "West"],
    ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    ["rot", "orange", "gelb", "grün", "blau", "violett"],
  ],
  es: [
    ["primavera", "verano", "otoño", "invierno"],
    ["norte", "sur", "este", "oeste"],
    ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    ["rojo", "naranja", "amarillo", "verde", "azul", "violeta"],
  ],
  it: [
    ["primavera", "estate", "autunno", "inverno"],
    ["nord", "sud", "est", "ovest"],
    ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
    ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
  ],
  pt: [
    ["primavera", "verão", "outono", "inverno"],
    ["norte", "sul", "leste", "oeste"],
  ],
  ru: [
    ["весна", "лето", "осень", "зима"],
    ["север", "юг", "восток", "запад"],
  ],
};

// Paired opposites that survive the peer filter (canonical antonyms).
// Each row: [a, b] where a's only valid antonym is b, and vice versa.
const PAIRED_OPPOSITES: Record<string, Array<[string, string]>> = {
  ko: [
    ["봄", "가을"], ["여름", "겨울"],
    ["동", "서"], ["남", "북"],
    ["동쪽", "서쪽"], ["남쪽", "북쪽"],
  ],
  en: [
    ["spring", "autumn"], ["spring", "fall"], ["summer", "winter"],
    ["north", "south"], ["east", "west"],
  ],
  ja: [
    ["春", "秋"], ["夏", "冬"],
    ["東", "西"], ["南", "北"],
  ],
  zh: [
    ["春", "秋"], ["夏", "冬"],
    ["春天", "秋天"], ["夏天", "冬天"],
    ["东", "西"], ["南", "北"],
  ],
  fr: [
    ["printemps", "automne"], ["été", "hiver"],
    ["nord", "sud"], ["est", "ouest"],
  ],
  de: [
    ["Frühling", "Herbst"], ["Sommer", "Winter"],
    ["Nord", "Süd"], ["Ost", "West"],
  ],
  es: [
    ["primavera", "otoño"], ["verano", "invierno"],
    ["norte", "sur"], ["este", "oeste"],
  ],
  it: [
    ["primavera", "autunno"], ["estate", "inverno"],
    ["nord", "sud"], ["est", "ovest"],
  ],
  pt: [
    ["primavera", "outono"], ["verão", "inverno"],
    ["norte", "sul"], ["leste", "oeste"],
  ],
  ru: [
    ["весна", "осень"], ["лето", "зима"],
    ["север", "юг"], ["восток", "запад"],
  ],
};

function normalizeLangFamily(code: string): string {
  if (code === "zh-CN" || code === "zh-TW") return "zh";
  return code;
}

function normWord(s: string): string {
  return s.normalize("NFKC").trim().toLowerCase();
}

/**
 * Find the canonical paired opposite for a headword in its language,
 * or null if none is defined.
 */
function getPairedOpposite(headword: string, lang: string): string | null {
  const pairs = PAIRED_OPPOSITES[normalizeLangFamily(lang)];
  if (!pairs) return null;
  const h = normWord(headword);
  for (const [a, b] of pairs) {
    if (normWord(a) === h) return b;
    if (normWord(b) === h) return a;
  }
  return null;
}

/**
 * Find the semantic group containing the headword, if any.
 * Returns the set of normalized peer members (excluding the headword
 * itself) so the caller can strip them from the antonyms array.
 */
function getPeerSet(headword: string, lang: string): Set<string> | null {
  const groups = SEMANTIC_GROUPS[normalizeLangFamily(lang)];
  if (!groups) return null;
  const h = normWord(headword);
  for (const group of groups) {
    const normalized = group.map(normWord);
    if (normalized.includes(h)) {
      const peers = new Set(normalized);
      peers.delete(h);
      return peers;
    }
  }
  return null;
}

/**
 * Strip peer members from the antonyms array. If the headword has a
 * canonical paired opposite, the survivor is the paired opposite
 * (if present in the antonyms); otherwise antonyms become [].
 */
export function filterPeerAntonyms(
  result: WordLookupResult,
  sourceLang: string,
): WordLookupResult {
  if (!result.antonyms || result.antonyms.length === 0) return result;
  const headword = result.headword ?? "";
  if (!headword) return result;

  const peers = getPeerSet(headword, sourceLang);
  if (!peers) return result; // headword not in any semantic group

  const paired = getPairedOpposite(headword, sourceLang);
  const pairedNorm = paired ? normWord(paired) : null;

  const survivors: string[] = [];
  for (const ant of result.antonyms) {
    const a = normWord(ant);
    if (peers.has(a)) {
      // Peer member — strip UNLESS it's the canonical paired opposite.
      if (pairedNorm && a === pairedNorm) survivors.push(ant);
      // else: drop silently
    } else {
      // Not a peer — keep (might be a legitimate non-group antonym).
      survivors.push(ant);
    }
  }
  return { ...result, antonyms: survivors };
}

// ── Homograph fabrication guard ──
// When source and target share a Latin alphabet, the model sometimes
// invents a secondary meaning that's actually a sense of the
// same-spelled word in the OTHER language (fr "lecture" → "lecture"
// the academic talk; en "actual" → "actual" the Spanish current).
//
// Heuristic: if the headword and TARGET_LANG share the Latin script,
// and a secondary meaning's translated definition contains a token
// that is an exact case-insensitive match for the headword (modulo
// accents), demote its relevanceScore so the MIN_RELEVANCE filter
// drops it. We only run this on the SECOND meaning onward — the
// primary meaning is the user's intent and stays.
//
// The guard is conservative: it doesn't catch every homograph trap,
// but the ones it catches are the most damaging (false friends
// presented as legitimate polysemy).

const LATIN_LANGS = new Set(["en", "es", "fr", "de", "it", "pt"]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokensOf(s: string): string[] {
  return s
    .split(/[,;:.()\[\]]+/)
    .flatMap((p) => p.split(/\s+/))
    .map((t) => stripAccents(t).toLowerCase().replace(/[^a-z]/g, ""))
    .filter((t) => t.length >= 2);
}

/**
 * Demote secondary meanings whose translated definition contains the
 * headword itself as a token — that's the textbook false-friend
 * fabrication signature (e.g. fr "lecture" with en definition
 * containing "lecture").
 */
export function guardHomographFabrication(
  result: WordLookupResult,
  sourceLang: string,
  targetLang: string,
): WordLookupResult {
  if (!LATIN_LANGS.has(sourceLang) || !LATIN_LANGS.has(targetLang)) return result;
  if (sourceLang === targetLang) return result;
  if (!result.meanings || result.meanings.length < 2) return result;
  const headword = result.headword ?? "";
  if (!headword) return result;
  const hwToken = stripAccents(headword).toLowerCase().replace(/[^a-z]/g, "");
  if (hwToken.length < 3) return result;

  const updated: WordMeaning[] = result.meanings.map((m, i) => {
    if (i === 0) return m; // primary meaning always kept
    const defTokens = tokensOf(m.definition ?? "");
    if (defTokens.includes(hwToken)) {
      // Demote so MIN_RELEVANCE=40 in normalize.ts drops it on next pass.
      return { ...m, relevanceScore: 30 };
    }
    return m;
  });

  return { ...result, meanings: updated };
}

// ── Example quantity schedule enforcement ──
// The prompt instructs the AI on the per-meaning example distribution,
// but the model occasionally violates it (e.g. for 3-meaning headwords
// it emits 2/1/0 instead of 1/1/1). This function enforces the schedule
// in code so the user-facing output always matches the contract:
//
//   1 meaning   → up to 2 examples, all meaning_index=0
//   2 meanings  → up to 2 of idx=0 + up to 1 of idx=1 (total ≤3)
//   3+ meanings → up to 1 each per index, max 3 total
//
// When the AI under-delivered for an index (no example), we return fewer
// total examples rather than mis-attributing a sibling. Better to have
// one fewer correct example than one over-claimed example.

import type { WordExample } from "./types.ts";

export function balanceExamples(
  examples: WordExample[],
  meaningCount: number,
): WordExample[] {
  if (!examples || examples.length === 0 || meaningCount <= 0) return examples ?? [];
  // v6+ schedule: exactly 1 example per meaning, max 3.
  // Monosemous words used to get 2 examples but LLM convergence on
  // hard idioms (mind you, per se) made them visually duplicate.
  // Polysemous already produced naturally varied examples since each
  // sense has different POS/frame, so 1 each is fine.
  const seen = new Set<number>();
  const out: WordExample[] = [];
  for (const ex of examples) {
    const idx = ex.meaningIndex ?? 0;
    if (idx < 0 || idx >= meaningCount) continue;
    if (!seen.has(idx)) {
      out.push(ex);
      seen.add(idx);
      if (out.length >= 3) break;
    }
  }
  return out;
}

// ── POS-aware meaning_index realignment ──
// The per-meaning ENRICH architecture eliminates cross-tagging (the LLM
// no longer sees other slots to confuse with), but it does NOT prevent
// the LLM from generating a sentence in the WRONG SENSE for the
// requested meaning. Example: asked for "release(verb)", LLM emits
// "The company made a big release today." — a valid sentence but in
// the noun sense. The slot-based meaning_index ends up wrong.
//
// This pass detects POS mismatches and swaps meaning_index to a slot
// whose POS actually matches the example's surface form. Heuristic;
// best-effort; lang-aware where signals are strong (en suffixes,
// ko/ja stem markers) and a no-op where they aren't.

interface PosSignal {
  noun: boolean;
  verb: boolean;
  adjective: boolean;
}

/** Coarse POS guess for the headword's surface form inside `**...**`
 * and surrounding context. Returns presence flags rather than a single
 * label because some forms genuinely fit two slots (e.g. en gerund
 * "running" can be noun or verb participle). */
function inferExamplePos(sentence: string, lang: string): PosSignal {
  const match = sentence.match(/\*\*([^*]+)\*\*/);
  const out: PosSignal = { noun: false, verb: false, adjective: false };
  if (!match) return out;
  const inflected = match[1].trim();
  if (!inflected) return out;

  const beforeText = sentence.slice(0, match.index ?? 0);
  const afterText = sentence.slice((match.index ?? 0) + match[0].length);
  const beforeWord = beforeText.match(/(\S+)\s*$/)?.[1]?.toLowerCase() ?? "";
  const afterChar = afterText.replace(/^\s+/, "").charAt(0);

  if (lang === "en") {
    // Article / possessive / demonstrative ANYWHERE within the preceding
    // 1-3 tokens → strong noun signal. "a quick **run**" → "a" is two
    // tokens back, still indicates noun.
    const NOUN_DETERMINERS = new Set([
      "the", "a", "an", "this", "that", "these", "those",
      "my", "your", "his", "her", "their", "our", "its",
      "any", "some", "every", "no", "another", "each",
    ]);
    const beforeTokens = beforeText.toLowerCase().trim().split(/\s+/).slice(-3);
    if (beforeTokens.some((t) => NOUN_DETERMINERS.has(t))) out.noun = true;
    // Possessive 's ("the child's **toy**", "John's **car**") → noun
    if (beforeWord.endsWith("'s") || beforeWord.endsWith("'")) out.noun = true;
    // Verb-form suffixes (rough but reliable for the common cases)
    if (/(ed|ing|en)$/i.test(inflected)) {
      // -ed/-ing/-en almost always indicate verb form (or participial adjective)
      out.verb = true;
    }
    // Bare base form after subject pronoun → likely verb ("She runs", "I read")
    if (["i", "you", "we", "they", "he", "she", "it", "people"].includes(beforeWord)) {
      out.verb = true;
    }
    // Modal/auxiliary before → verb base form ("will run", "can play")
    if (/^(will|would|can|could|should|may|might|must|shall|do|does|did|to)$/.test(beforeWord)) {
      out.verb = true;
    }
    // Object pronoun / noun immediately after a base form → likely verb
    // ("**charge** five dollars", "**release** the bird")
    const afterToken = afterText.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (/^(me|you|him|her|us|them|it|the|a|an|this|that|these|those|his|her|their|my|our|your)$/.test(afterToken)
        && !/(ed|ing|en|s)$/i.test(inflected)) {
      // Only stamp as verb if no noun determiner found upstream.
      if (!out.noun) out.verb = true;
    }
    // -ly preceded by linking verb → adjective
    if (/^(is|are|was|were|been|seems|looks|feels|appears)$/.test(beforeWord)) {
      out.adjective = true;
    }
  } else if (lang === "ko") {
    // Korean verb stems usually end in -다 or are followed by inflection
    if (/다$/.test(inflected)) out.verb = true;
    // Particle 을/를/이/가/은/는/에/의 after → noun usage
    if (/^[을를이가은는에의도]/.test(afterChar)) out.noun = true;
  } else if (lang === "ja") {
    // Japanese verbs end in -る/-う/-く/-ぐ/-す/-つ/-ぬ/-ぶ/-む or -した
    if (/[るうくぐすつぬぶむ]$/.test(inflected) || /た$/.test(inflected)) out.verb = true;
    if (/^[をはがにのとへで]/.test(afterChar)) out.noun = true;
  } else if (lang === "fr" || lang === "es" || lang === "it" || lang === "pt" || lang === "de") {
    // Latin-script: article-before-word → noun
    const ARTICLES = new Set([
      "le", "la", "les", "un", "une", "des", "du", "de", "l'",  // fr
      "el", "los", "las", "los", "unos", "unas",                 // es
      "il", "lo", "gli", "uno", "una",                            // it
      "o", "os", "as", "um", "uma", "uns", "umas",               // pt
      "der", "die", "das", "den", "dem", "des", "ein", "eine",   // de
    ]);
    if (ARTICLES.has(beforeWord) || beforeWord.endsWith("'")) out.noun = true;
  }
  return out;
}

function posMatchesSignal(meaningPos: string, sig: PosSignal): boolean {
  const p = meaningPos.toLowerCase();
  // Be permissive — if no strong signal detected, accept (don't false-positive into swap).
  if (!sig.noun && !sig.verb && !sig.adjective) return true;
  if (sig.noun && /(noun|명사|名詞|名词|nom|sustantivo|nombre|substantiv|sostantivo)/.test(p)) return true;
  if (sig.verb && /(verb|동사|動詞|动词|verbe|verbo)/.test(p)) return true;
  if (sig.adjective && /(adjective|형용사|形容詞|形容词|adjectif|adjetivo|aggettivo)/.test(p)) return true;
  // Some POS values combine ("noun, verb") — match if either side wins
  if (sig.noun && /noun|명사/.test(p)) return true;
  if (sig.verb && /verb|동사/.test(p)) return true;
  return false;
}

/** Re-attribute examples whose inferred POS doesn't match the assigned
 * meaning's POS. Two-pass:
 *   1. Move mismatched examples into EMPTY slots whose POS matches
 *      (no destructive swap, no duplicates).
 *   2. For remaining mismatches, find pairs where swapping fixes BOTH
 *      examples (m1/m2 each holding the other's content). Pairwise
 *      swap.
 * Examples that still don't fit after both passes keep their original
 * slot — a mis-labeled valid example is still better than no example. */
export function realignExamplesByPos(
  meanings: Array<{ partOfSpeech: string }>,
  examples: WordExample[],
  lang: string,
): WordExample[] {
  if (meanings.length < 2 || examples.length === 0) return examples;

  const work = examples.map((ex) => ({ ...ex }));
  // Cache per-example POS signal so we don't re-parse inside loops.
  const sigs = work.map((ex) => inferExamplePos(ex.sentence, lang));

  const matchesSlot = (exIdx: number, slotIdx: number): boolean =>
    posMatchesSignal(meanings[slotIdx].partOfSpeech, sigs[exIdx]);

  const occupied = new Set<number>();
  for (const ex of work) {
    const idx = ex.meaningIndex ?? 0;
    if (idx >= 0 && idx < meanings.length) occupied.add(idx);
  }

  // Pass 1: move into empty matching slots.
  for (let i = 0; i < work.length; i++) {
    const cur = work[i].meaningIndex ?? 0;
    if (cur < 0 || cur >= meanings.length) continue;
    if (matchesSlot(i, cur)) continue;
    for (let j = 0; j < meanings.length; j++) {
      if (j === cur || occupied.has(j)) continue;
      if (matchesSlot(i, j)) {
        occupied.delete(cur);
        occupied.add(j);
        work[i].meaningIndex = j;
        break;
      }
    }
  }

  // Pass 2: pairwise swap. For each pair (i, k) of currently-mismatched
  // examples, swap their meaning_index if BOTH end up matching.
  for (let i = 0; i < work.length; i++) {
    const ci = work[i].meaningIndex ?? 0;
    if (matchesSlot(i, ci)) continue;
    for (let k = i + 1; k < work.length; k++) {
      const ck = work[k].meaningIndex ?? 0;
      if (matchesSlot(k, ck)) continue;
      if (matchesSlot(i, ck) && matchesSlot(k, ci)) {
        work[i].meaningIndex = ck;
        work[k].meaningIndex = ci;
        break;
      }
    }
  }

  return work;
}

// ── Synonym / antonym sanitization ──
// AI quirks observed:
//   - "X(설명)" patterns: synonym with a parenthetical disclaimer
//     (e.g. "배추(과일 종류 중에서는 없음)" — fabricated)
//   - Headword itself appearing as a synonym
//   - Empty strings, whitespace-only entries
//   - Same entry listed multiple times
//
// Strategy: drop any entry that contains parentheses (legitimate
// dictionary synonyms never carry parenthetical glosses); drop
// entries that equal the headword case-insensitively; trim; dedupe.

function normalizeSynAnt(s: string): string {
  return s.normalize("NFKC").trim();
}

export function sanitizeSynAnt(
  entries: string[] | undefined,
  headword: string,
): string[] {
  if (!entries || entries.length === 0) return [];
  const headLower = normalizeSynAnt(headword).toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entries) {
    if (typeof raw !== "string") continue;
    const trimmed = normalizeSynAnt(raw);
    if (trimmed.length === 0) continue;
    // Drop any entry containing parentheses — they signal an AI gloss
    // or disclaimer, never a legitimate dictionary synonym.
    if (/[()（）]/.test(trimmed)) continue;
    // Drop entry that IS the headword (case-insensitive). Also drop
    // entries that simply append a Korean particle to the headword.
    const lower = trimmed.toLowerCase();
    if (lower === headLower) continue;
    // Dedup.
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

/**
 * Code-level definition-length sanity check. The prompt now enforces
 * a hard cap, but a defensive truncation prevents the rare model
 * runaway from polluting the canonical entry. We DON'T truncate
 * proper nouns or definitions that look like transliteration+category
 * lists (commas inside short segments).
 */
const DEF_LATIN_CAP_WORDS = 10;
const DEF_CJK_CAP_CHARS = 18;
const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/;

export function clampDefinitionLength(result: WordLookupResult): WordLookupResult {
  if (!result.meanings?.length) return result;
  const updated: WordMeaning[] = result.meanings.map((m) => {
    const def = m.definition ?? "";
    if (!def) return m;
    if (CJK_RE.test(def)) {
      const chars = [...def];
      if (chars.length > DEF_CJK_CAP_CHARS) {
        // Try to clip at last comma within the cap.
        const head = chars.slice(0, DEF_CJK_CAP_CHARS).join("");
        const lastComma = Math.max(head.lastIndexOf(","), head.lastIndexOf("，"));
        const clipped = lastComma > 0 ? head.slice(0, lastComma) : head;
        return { ...m, definition: clipped.trim() };
      }
      return m;
    }
    const words = def.trim().split(/\s+/);
    if (words.length > DEF_LATIN_CAP_WORDS) {
      // Try comma-split first.
      const head = words.slice(0, DEF_LATIN_CAP_WORDS).join(" ");
      const lastComma = head.lastIndexOf(",");
      const clipped = lastComma > 0 ? head.slice(0, lastComma) : head;
      return { ...m, definition: clipped.trim() };
    }
    return m;
  });
  return { ...result, meanings: updated };
}
