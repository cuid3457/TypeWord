import type { WordExample, WordLookupResult, WordMeaning } from "./types.ts";
import { applyContextualDisputeRewrites, applyDisputeRewrites } from "./disputes.ts";

/**
 * Mapping of English POS terms → target-language equivalents.
 * Used as a safety net when the AI ignores the prompt instruction.
 */
const POS_MAP: Record<string, Record<string, string>> = {
  ko: {
    noun: "명사", verb: "동사", adjective: "형용사", adverb: "부사",
    preposition: "전치사", conjunction: "접속사", interjection: "감탄사",
    pronoun: "대명사", determiner: "관형사", particle: "조사",
    "proper noun": "고유명사", abbreviation: "약어", prefix: "접두사", suffix: "접미사",
    expression: "수식",
  },
  ja: {
    noun: "名詞", verb: "動詞", adjective: "形容詞", adverb: "副詞",
    preposition: "前置詞", conjunction: "接続詞", interjection: "感嘆詞",
    pronoun: "代名詞", determiner: "連体詞", particle: "助詞",
    "proper noun": "固有名詞", abbreviation: "略語", prefix: "接頭辞", suffix: "接尾辞",
    expression: "数式",
  },
  zh: {
    noun: "名词", verb: "动词", adjective: "形容词", adverb: "副词",
    preposition: "介词", conjunction: "连词", interjection: "叹词",
    pronoun: "代词", determiner: "限定词", particle: "助词",
    "proper noun": "专有名词", abbreviation: "缩写", prefix: "前缀", suffix: "后缀",
    expression: "表达式",
  },
  es: {
    noun: "sustantivo", verb: "verbo", adjective: "adjetivo", adverb: "adverbio",
    preposition: "preposición", conjunction: "conjunción", interjection: "interjección",
    pronoun: "pronombre", determiner: "determinante",
    "proper noun": "nombre propio", abbreviation: "abreviatura",
    expression: "expresión",
  },
  fr: {
    noun: "nom", verb: "verbe", adjective: "adjectif", adverb: "adverbe",
    preposition: "préposition", conjunction: "conjonction", interjection: "interjection",
    pronoun: "pronom", determiner: "déterminant",
    "proper noun": "nom propre", abbreviation: "abréviation",
    expression: "expression",
  },
  de: {
    noun: "Nomen", verb: "Verb", adjective: "Adjektiv", adverb: "Adverb",
    preposition: "Präposition", conjunction: "Konjunktion", interjection: "Interjektion",
    pronoun: "Pronomen", determiner: "Artikel",
    "proper noun": "Eigenname", abbreviation: "Abkürzung",
    expression: "Ausdruck",
  },
  it: {
    noun: "nome", verb: "verbo", adjective: "aggettivo", adverb: "avverbio",
    preposition: "preposizione", conjunction: "congiunzione", interjection: "interiezione",
    pronoun: "pronome", determiner: "determinante",
    "proper noun": "nome proprio", abbreviation: "abbreviazione",
    expression: "espressione",
  },
  pt: {
    noun: "substantivo", verb: "verbo", adjective: "adjetivo", adverb: "advérbio",
    preposition: "preposição", conjunction: "conjunção", interjection: "interjeição",
    pronoun: "pronome", determiner: "determinante",
    "proper noun": "nome próprio", abbreviation: "abreviatura",
    expression: "expressão",
  },
  ru: {
    noun: "существительное", verb: "глагол", adjective: "прилагательное", adverb: "наречие",
    preposition: "предлог", conjunction: "союз", interjection: "междометие",
    pronoun: "местоимение", determiner: "определитель",
    "proper noun": "имя собственное", abbreviation: "сокращение",
    expression: "выражение",
  },
  vi: {
    noun: "danh từ", verb: "động từ", adjective: "tính từ", adverb: "trạng từ",
    preposition: "giới từ", conjunction: "liên từ", interjection: "thán từ",
    pronoun: "đại từ", determiner: "từ hạn định",
    "proper noun": "danh từ riêng", abbreviation: "viết tắt",
  },
  id: {
    noun: "kata benda", verb: "kata kerja", adjective: "kata sifat", adverb: "kata keterangan",
    preposition: "kata depan", conjunction: "kata hubung", interjection: "kata seru",
    pronoun: "kata ganti", determiner: "kata penentu",
    "proper noun": "kata benda nama", abbreviation: "singkatan",
  },
  th: {
    noun: "คำนาม", verb: "คำกริยา", adjective: "คำคุณศัพท์", adverb: "คำวิเศษณ์",
    preposition: "คำบุพบท", conjunction: "คำสันธาน", interjection: "คำอุทาน",
    pronoun: "คำสรรพนาม", determiner: "คำนำหน้านาม",
    "proper noun": "คำนามเฉพาะ", abbreviation: "คำย่อ",
  },
  ar: {
    noun: "اسم", verb: "فعل", adjective: "صفة", adverb: "ظرف",
    preposition: "حرف جر", conjunction: "حرف عطف", interjection: "تعجب",
    pronoun: "ضمير", determiner: "أداة تعريف",
    "proper noun": "اسم علم", abbreviation: "اختصار",
  },
  hi: {
    noun: "संज्ञा", verb: "क्रिया", adjective: "विशेषण", adverb: "क्रिया-विशेषण",
    preposition: "संबंधबोधक", conjunction: "समुच्चयबोधक", interjection: "विस्मयादिबोधक",
    pronoun: "सर्वनाम", determiner: "निर्धारक",
    "proper noun": "व्यक्तिवाचक संज्ञा", abbreviation: "संक्षिप्त रूप",
  },
  tr: {
    noun: "isim", verb: "fiil", adjective: "sıfat", adverb: "zarf",
    preposition: "edat", conjunction: "bağlaç", interjection: "ünlem",
    pronoun: "zamir", determiner: "belirleyici",
    "proper noun": "özel isim", abbreviation: "kısaltma",
  },
};

/** Build the set of valid POS values for a given target language. */
function getValidPos(targetLang: string): Set<string> {
  const map = POS_MAP[targetLang];
  if (!map) return new Set();
  return new Set(Object.values(map));
}

let _reversePosMap: Map<string, string> | null = null;
function getReversePosMap(): Map<string, string> {
  if (_reversePosMap) return _reversePosMap;
  _reversePosMap = new Map();
  for (const map of Object.values(POS_MAP)) {
    for (const [enKey, localizedValue] of Object.entries(map)) {
      _reversePosMap.set(localizedValue, enKey);
    }
  }
  return _reversePosMap;
}

/** Simple Levenshtein distance for short strings. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/** Find the closest valid POS for the target language, or return as-is. */
function fixPos(pos: string, validPos: Set<string>): string {
  if (validPos.has(pos)) return pos;
  let best = pos;
  let bestDist = Infinity;
  for (const v of validPos) {
    const d = editDistance(pos, v);
    if (d < bestDist) { bestDist = d; best = v; }
  }
  // Only correct if reasonably close (≤ 40% of the longer string)
  return bestDist <= Math.ceil(Math.max(pos.length, best.length) * 0.4) ? best : pos;
}

/** Minimum relevanceScore to keep a meaning. */
const MIN_RELEVANCE = 40;
/** Cap meanings — language learners only need the most common senses. */
const MAX_MEANINGS = 2;

/** Languages with grammatical gender on nouns. */
const GENDERED_LANGS = new Set(["de", "fr", "es", "it", "pt", "ru"]);

/**
 * Article tokens to strip from the start of a noun headword. Includes definite,
 * indefinite, and (for German) negative articles in all relevant case forms.
 * Russian has no articles, so it's intentionally absent. The match is
 * case-insensitive on the article side; the noun keeps its original casing.
 */
const HEADWORD_ARTICLES: Record<string, string[]> = {
  de: [
    "der", "die", "das", "den", "dem", "des",
    "ein", "eine", "einen", "einem", "eines", "einer",
    "kein", "keine", "keinen", "keinem", "keines", "keiner",
  ],
  fr: ["le", "la", "les", "un", "une", "des"],
  es: ["el", "la", "los", "las", "un", "una", "unos", "unas"],
  it: ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una"],
  pt: ["o", "a", "os", "as", "um", "uma", "uns", "umas"],
};

/** Elided article forms attached with apostrophe in fr/it. */
const ELIDED_ARTICLE_RE: Record<string, RegExp> = {
  fr: /^(l|d|n|s|t|qu|j|m)['']/i,
  it: /^(l|un|d|s|n|m|t|c|v|qu|gl)['']/i,
};

/**
 * Strip a leading article from a single-noun headword if the AI smuggled one
 * in despite the prompt's headword-cleanliness rule. Multi-word phrases (e.g.
 * idioms, proper nouns containing articles) are left untouched — only the
 * exact `article SPACE single-word` pattern is rewritten. Returns the original
 * string when no article is detected.
 */
function stripLeadingArticle(headword: string, sourceLang: string): string {
  const articles = HEADWORD_ARTICLES[sourceLang];
  if (!articles) return headword;
  const trimmed = headword.trim();
  // Pattern: <article> <single-word> — both bounded, no further spaces.
  const m = trimmed.match(/^(\S+)\s+(\S+)$/);
  if (!m) return headword;
  const [, first, rest] = m;
  if (articles.includes(first.toLowerCase())) return rest;
  // Elided forms (l'eau, d'accordo, ...) — strip when present.
  const elidedRe = ELIDED_ARTICLE_RE[sourceLang];
  if (elidedRe && elidedRe.test(trimmed)) {
    const stripped = trimmed.replace(elidedRe, "");
    if (stripped && /^\S+$/.test(stripped)) return stripped;
  }
  return headword;
}

/**
 * Coerce the AI's gender field to the canonical "m"/"f"/"n"/"mf" form. AI
 * sometimes emits longer forms ("masculine"/"feminine"/"common"), localized
 * labels ("男성"), or uppercase. Anything unrecognized → undefined.
 *
 * "mf" represents common/epicene gender: one surface form used for both
 * genders (élève, médecin, collègue, …). The match must come BEFORE the
 * single-letter "m" check so "mf" doesn't get truncated to "m".
 *
 * Also drops the field when WORD LANGUAGE doesn't have grammatical gender —
 * keeps the result clean even if the model leaked a value.
 */
function normalizeGender(raw: unknown, sourceLang: string): "m" | "f" | "n" | "mf" | undefined {
  if (!GENDERED_LANGS.has(sourceLang)) return undefined;
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  // Common-gender / epicene must be checked first so it doesn't fall into the
  // "m..." branch.
  if (
    v === "mf" || v === "fm" || v === "m/f" || v === "m·f" ||
    v.startsWith("comm") || v.startsWith("epic") ||
    v.startsWith("общ")
  ) return "mf";
  if (v === "m" || v.startsWith("masc") || v.startsWith("mannlich") || v.startsWith("männlich") || v.startsWith("muz") || v.startsWith("мужск")) return "m";
  if (v === "f" || v.startsWith("fem") || v.startsWith("weibl") || v.startsWith("женск")) return "f";
  if (v === "n" || v.startsWith("neut") || v.startsWith("säch") || v.startsWith("sach") || v.startsWith("средн")) return "n";
  return undefined;
}

/**
 * Strip diacritics and lowercase for "did the spelling change" comparison.
 * Restoring accents (cafe→café) or capitalization (iphone→iPhone) is NOT a typo
 * correction; only actual letter substitution/addition/deletion is.
 */
function canonicalizeForCompare(s: string): string {
  return s
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Levenshtein distance — used to gate "typo correction" banner. */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Decide whether the gap between user input and the AI's headword represents a
 * genuine typo correction (worth surfacing as "did you mean X?") rather than
 * formatting (case/diacritics) or grammatical normalization (Korean particle
 * stripping, Japanese conjugation → dictionary form, etc.).
 */
function isLikelyTypoCorrection(headword: string, originalInput: string): boolean {
  const a = canonicalizeForCompare(headword);
  const b = canonicalizeForCompare(originalInput);
  if (!a || !b) return false;
  if (a === b) return false; // pure case/diacritic restoration
  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  // Reject if the lengths differ a lot — likely particle stripping / very different word.
  if (maxLen - minLen > 3) return false;
  const d = lev(a, b);
  // Typo-like: small absolute distance and small relative distance.
  return d > 0 && d <= Math.max(2, Math.ceil(maxLen * 0.25));
}

/** Allowed values for the "note" field. Anything else is dropped. */
const VALID_NOTES = new Set(["sentence", "non_word", "wrong_language", "phrase_too_long"]);

/**
 * Normalize AI response:
 * - Coerce confidence/note/correctedHeadword shape
 * - Filter out meanings with low relevanceScore
 * - Fix partOfSpeech values that are in English when targetLang is not English
 * - Correct misspelled/hallucinated POS to the closest valid value
 */
export function normalizeResult(
  result: WordLookupResult,
  targetLang: string,
  sourceLang?: string,
): WordLookupResult {
  // Coerce new metadata fields to safe values regardless of meanings shape.
  const out: WordLookupResult = { ...result };
  if (typeof out.confidence === "number") {
    out.confidence = Math.max(0, Math.min(100, Math.round(out.confidence)));
  } else if (out.confidence != null) {
    delete out.confidence;
  }
  if (out.note && !VALID_NOTES.has(out.note as string)) delete out.note;
  if (typeof out.originalInput === "string") {
    out.originalInput = out.originalInput.trim();
  } else if (out.originalInput != null) {
    delete out.originalInput;
  }
  // Strip leading articles smuggled into the headword for gendered languages.
  // The AI follows dictionary convention ("der Hund") even when the prompt
  // forbids it; this is a defensive rewrite. Must run BEFORE the corrected-
  // headword comparison so the typo gate doesn't mistake "der Hund" → "Hund"
  // as a typo correction.
  if (sourceLang && typeof out.headword === "string") {
    out.headword = stripLeadingArticle(out.headword, sourceLang);
  }
  // Server-derived correctedHeadword: ignore whatever AI sent and decide
  // deterministically based on whether the headword differs from the input
  // by actual letter changes (not just case/diacritics/particles). Suppressed
  // when "note" is set (sentence/non_word) since the UI shows the rejection
  // message instead of any correction banner.
  delete out.correctedHeadword;
  if (
    !out.note &&
    typeof out.headword === "string" &&
    typeof out.originalInput === "string" &&
    isLikelyTypoCorrection(out.headword, out.originalInput)
  ) {
    out.correctedHeadword = out.headword.trim();
  }

  // Pinyin shape coercion for Chinese:
  //   1. AI sometimes returns reading as a bare string ("zhīdao") instead of
  //      array. Coerce to single-element array to match the schema and the
  //      reading-display component's join-with-' / ' contract.
  //   2. AI sometimes splits multi-character compounds per syllable
  //      (["zhèng","zài"] for 正在). Compound words are pronounced as one
  //      prosodic unit and must render as one token; rejoin when array length
  //      equals the headword's Han-character count (>=2).
  // Polyphone single-char words (e.g. 长 → ["cháng","zhǎng"]) keep their
  // multi-element array since each element is an *alternative* reading.
  if (sourceLang && /^zh/.test(sourceLang) && typeof out.headword === "string") {
    const r = (out as { reading?: unknown }).reading;
    if (typeof r === "string" && r.trim().length > 0) {
      (out as { reading: string[] }).reading = [r.trim()];
    } else if (Array.isArray(r) && r.length >= 2) {
      const hanCount = (out.headword.match(/\p{Script=Han}/gu) ?? []).length;
      if (hanCount >= 2 && r.length === hanCount && r.every((s) => typeof s === "string")) {
        (out as { reading: string[] }).reading = [(r as string[]).join("")];
      }
    }
  }

  if (!Array.isArray(out.meanings)) {
    out.meanings = [];
    return out;
  }

  // Filter low-relevance meanings, keep only the top N most relevant.
  // Sanitize gender on each surviving meaning — coerce free-form AI output
  // to the canonical "m"/"f"/"n"/"mf" and drop it for non-gendered source langs.
  const sanitizeGender = (m: WordMeaning): WordMeaning => {
    const raw = (m as { gender?: unknown }).gender;
    const g = sourceLang ? normalizeGender(raw, sourceLang) : undefined;
    if (g) return { ...m, gender: g };
    if (raw !== undefined) {
      const cleaned = { ...m } as WordMeaning;
      delete (cleaned as { gender?: unknown }).gender;
      return cleaned;
    }
    return m;
  };
  // Apply dispute rewrites to definitions FIRST so the dedupe step sees the
  // post-rewrite text. Without this order, AI outputs like "East Sea" + "Sea
  // of Japan" pass dedupe (different strings) and only become identical
  // ("East Sea" + "East Sea (Sea of Japan)") after the rewriter runs later.
  // Contextual rewrites (Korea-China disputes — kimchi/paocai, hanbok) run
  // alongside the global ones since they depend on the lookup word.
  const lookupForRewrite = out.headword ?? out.originalInput ?? "";
  const rewrittenMeanings = out.meanings.map((m) => {
    const def = applyDisputeRewrites(m.definition ?? "", targetLang);
    const contextual = applyContextualDisputeRewrites(def, targetLang, lookupForRewrite);
    return { ...m, definition: contextual };
  });

  // De-duplicate near-identical meanings before relevance-trim so we don't
  // burn one of the MAX_MEANINGS slots on a redundant entry. Triggers:
  //   - same partOfSpeech AND
  //   - one definition is a normalized prefix/substring of the other
  // Common case: proper-noun lookups like 동해 where the AI emits both a bare
  // form ("East Sea") and a dual-form variant ("East Sea (Sea of Japan)") —
  // same referent. Keep the longer / more informative one.
  const normDef = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const deduped: WordMeaning[] = [];
  for (const m of rewrittenMeanings) {
    const a = normDef(m.definition ?? "");
    const dup = deduped.find((d) => {
      if (d.partOfSpeech !== m.partOfSpeech) return false;
      const b = normDef(d.definition ?? "");
      return a === b || a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a);
    });
    if (!dup) {
      deduped.push(m);
      continue;
    }
    if ((m.definition?.length ?? 0) > (dup.definition?.length ?? 0)) {
      const i = deduped.indexOf(dup);
      deduped[i] = {
        ...m,
        relevanceScore: Math.max(m.relevanceScore ?? 0, dup.relevanceScore ?? 0),
      };
    } else {
      dup.relevanceScore = Math.max(m.relevanceScore ?? 0, dup.relevanceScore ?? 0);
    }
  }
  const filtered = deduped
    .filter((m) => (m.relevanceScore ?? 0) >= MIN_RELEVANCE)
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, MAX_MEANINGS)
    .map(sanitizeGender);

  // Compute meanings with POS translation as the final step. POS_MAP for
  // zh-CN/zh-TW is shared (POS terms are identical across both scripts).
  let processed = filtered;
  if (targetLang !== "en") {
    const posLang = targetLang === "zh-CN" || targetLang === "zh-TW" ? "zh" : targetLang;
    const map = POS_MAP[posLang];
    if (map) {
      const validPos = getValidPos(posLang);
      const reverseMap = getReversePosMap();
      processed = filtered.map((m) => {
        const key = m.partOfSpeech.toLowerCase().trim();
        const translated = map[key];
        if (translated) return { ...m, partOfSpeech: translated };
        const enKey = reverseMap.get(m.partOfSpeech);
        if (enKey && map[enKey]) return { ...m, partOfSpeech: map[enKey] };
        const fixed = fixPos(m.partOfSpeech, validPos);
        return fixed !== m.partOfSpeech ? { ...m, partOfSpeech: fixed } : m;
      });
    }
  }

  // Definitions were already rewritten before dedupe (see top of this fn).
  // Source-language sentence text is rewritten in fixExampleMarkers, which
  // also handles example-translation rewrites.
  return { ...out, meanings: processed };
}

// ── Example ** marker post-processing ──

const KO_PARTICLES =
  /^(.*?)(을|를|이|가|은|는|에서|에게서|에게|에|의|으로|로|와|과|도|만|까지|부터|처럼|같이|보다|한테서|한테|들|이라고|라고|이고|하고|이며|이나|나|야|아|여|이여|입니다|습니다)$/;

const JA_PARTICLES = /^(.*?)(は|が|を|に|へ|で|と|から|まで|の|も|や|よ|ね|か|ば|て|で|な|だ)$/;

function koBatchim(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c < 0xAC00 || c > 0xD7A3) return -1;
  return (c - 0xAC00) % 28;
}

function isValidKoParticle(stem: string, particle: string): boolean {
  const last = stem[stem.length - 1];
  const b = koBatchim(last);
  if (b < 0) return true;
  const has = b !== 0;
  const hasL = b === 8;
  switch (particle) {
    case "을": return has;
    case "를": return !has;
    case "이": return has;
    case "가": return !has;
    case "은": return has;
    case "는": return !has;
    case "과": return has;
    case "와": return !has;
    case "으로": return has && !hasL;
    case "로": return !has || hasL;
    default: return true;
  }
}

function trimParticles(marked: string, lang: string, headword: string): string {
  if (lang === "ko") {
    const m = KO_PARTICLES.exec(marked);
    if (m && m[1].length >= 1 && isValidKoParticle(m[1], m[2])) {
      if (m[1] === headword) return m[1];
    }
  }
  if (lang === "ja") {
    const m = JA_PARTICLES.exec(marked);
    if (m && m[1].length >= 1) {
      if (m[1] === headword) return m[1];
      if (headword.length >= 2) {
        const base = headword.slice(0, -1);
        if (m[1].startsWith(base) && m[1].length <= headword.length + 2) return m[1];
      }
    }
  }
  return marked;
}

/**
 * If multiple ** pairs exist, keep only the one that best matches `word`.
 * Exception: German allows multiple (separable verbs like "fangen ... an").
 */
function deduplicateMarkers(text: string, word: string, lang: string): string {
  if (!text?.includes("**") || !word) return text;
  const parts = text.split("**");
  const markedIndices: number[] = [];
  for (let i = 1; i < parts.length; i += 2) markedIndices.push(i);
  if (markedIndices.length <= 1) return text;
  if (lang === "de") return text;

  const wl = word.toLowerCase();
  let bestIdx = markedIndices[0];
  let bestScore = -1;
  for (const idx of markedIndices) {
    const seg = parts[idx].toLowerCase();
    if (seg === wl) { bestIdx = idx; bestScore = 2; break; }
    let score = 0;
    if (seg.startsWith(wl) || wl.startsWith(seg)) {
      score = Math.min(seg.length, wl.length) / Math.max(seg.length, wl.length);
    }
    if (score === 0) {
      let common = 0;
      const minLen = Math.min(seg.length, wl.length);
      while (common < minLen && seg[common] === wl[common]) common++;
      if (common >= 1 && common >= Math.ceil(minLen * 0.5)) {
        score = common / Math.max(seg.length, wl.length);
      }
    }
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  }

  let result = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      result += i === bestIdx ? "**" + parts[i] + "**" : parts[i];
    } else {
      result += parts[i];
    }
  }
  return result;
}

function fixMarkersInText(
  text: string,
  word: string,
  lang: string,
): string {
  if (!text) return text;

  if (text.includes("**")) {
    let result = deduplicateMarkers(text, word, lang);
    // Validate that the marked content is actually a (case-insensitive,
    // diacritic-stripped) substring of the target `word`. If not, the
    // model has marked the wrong word — strip the existing markers and
    // fall through to re-add them at the correct position. Skips the
    // check for empty `word` (translation cases where the def is empty).
    if (word) {
      const parts = result.split("**");
      const marked = parts.length >= 3 ? parts[1] : "";
      if (marked && !markerMatchesWord(marked, word)) {
        result = result.replace(/\*\*/g, "");
      } else {
        for (let i = 1; i < result.split("**").length; i += 2) {
          const segParts = result.split("**");
          const seg = segParts[i];
          const trimmed = trimParticles(seg, lang, word);
          if (trimmed !== seg) {
            const particle = seg.slice(trimmed.length);
            result = result.replace(`**${seg}**`, `**${trimmed}**${particle}`);
          }
        }
        return result;
      }
    } else {
      const parts = result.split("**");
      for (let i = 1; i < parts.length; i += 2) {
        const seg = parts[i];
        const trimmed = trimParticles(seg, lang, word);
        if (trimmed !== seg) {
          const particle = seg.slice(trimmed.length);
          result = result.replace(`**${seg}**`, `**${trimmed}**${particle}`);
        }
      }
      return result;
    }
    text = result; // markers stripped — re-add below
  }

  if (!word) return text;
  // Definitions are often comma- or semicolon-separated synonym lists
  // ("안녕, 인사" / "happy; glad"). Match against each candidate
  // individually so we mark whichever form actually appears in the
  // translation. Tries the longest first so multi-word entries beat
  // bare-stem entries when both are present.
  const candidates = word
    .split(/[,;、·／/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length);
  for (const cand of candidates) {
    const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})`, "i");
    const match = re.exec(text);
    if (match) {
      const idx = match.index;
      return text.slice(0, idx) + "**" + match[1] + "**" + text.slice(idx + match[1].length);
    }
  }
  return text;
}

/** Returns true when the marked text is recognizably the target word —
 *  case-insensitive + diacritic-stripped, accepts substring relationship
 *  in either direction (handles inflection / partial matches like
 *  definitions written as "도시" matching marker "도시"). */
function markerMatchesWord(marked: string, word: string): boolean {
  const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const m = norm(marked);
  const w = norm(word);
  if (!m || !w) return false;
  return m === w || m.includes(w) || w.includes(m);
}

// ── Script detection for sentence/translation language validation ──

type ScriptId = "hangul" | "kana" | "cjk" | "latin" | "cyrillic" | "unknown";

function detectDominantScript(text: string): ScriptId {
  const clean = text.replace(/\*\*/g, "").replace(/[^\p{L}]/gu, "");
  if (!clean) return "unknown";

  let hangul = 0, kana = 0, cjk = 0, latin = 0, cyrillic = 0;
  for (const ch of clean) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x1100 && code <= 0x11FF) || (code >= 0x3130 && code <= 0x318F)) hangul++;
    else if ((code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)) kana++;
    else if (code >= 0x4E00 && code <= 0x9FFF) cjk++;
    else if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) latin++;
    else if (code >= 0x0400 && code <= 0x04FF) cyrillic++;
  }

  const total = hangul + kana + cjk + latin + cyrillic;
  if (total === 0) return "unknown";

  if (hangul / total > 0.3) return "hangul";
  if (kana / total > 0.1) return "kana";
  if (cjk / total > 0.3) return "cjk";
  if (latin / total > 0.5) return "latin";
  if (cyrillic / total > 0.3) return "cyrillic";
  return "unknown";
}

const LANG_SCRIPT: Record<string, ScriptId> = {
  ko: "hangul", ja: "kana", zh: "cjk",
  en: "latin", es: "latin", fr: "latin", de: "latin", it: "latin", pt: "latin",
  ru: "cyrillic",
};

/**
 * Post-process enrichment examples: fix ** markers and normalize meaning_index.
 */
export function fixExampleMarkers(
  examples: WordExample[],
  headword: string,
  sourceLang: string,
  targetLang: string,
  definitions?: string[],
): WordExample[] {
  const srcScript = LANG_SCRIPT[sourceLang];
  const tgtScript = LANG_SCRIPT[targetLang];
  const canDetectSwap = !!(srcScript && tgtScript && srcScript !== tgtScript
    && !(sourceLang === "ja" && targetLang === "zh")
    && !(sourceLang === "zh" && targetLang === "ja"));

  return examples.map((ex, i) => {
    let sent = ex.sentence;
    let trans = ex.translation;

    if (canDetectSwap && sent && trans) {
      const sentScript = detectDominantScript(sent);
      const transScript = detectDominantScript(trans);
      if (sentScript === tgtScript && transScript === srcScript) {
        [sent, trans] = [trans, sent];
      }
    }

    // Sentence is in the SOURCE language and must contain the lookup word
    // verbatim — apply marker fix only. The dispute rewriter would distort
    // the headword presence requirement here, so it's skipped.
    const sentence = fixMarkersInText(sent, headword, sourceLang);
    const def = definitions?.[ex.meaningIndex ?? 0] ?? definitions?.[0] ?? "";
    // Translation is in the TARGET language — apply dispute rewrites so
    // disputed naming (e.g. 일본해 → 동해 in Korean output) gets normalized
    // even when the AI ignores the prompt instruction. Contextual rewrites
    // run alongside (e.g. 김치/泡菜 disambiguation when headword matches).
    const translation = applyContextualDisputeRewrites(
      applyDisputeRewrites(
        fixMarkersInText(trans, def, targetLang),
        targetLang,
      ),
      targetLang,
      headword,
    );

    // Normalize meaning_index from AI (could be "meaning_index" key in raw JSON)
    let meaningIndex = ex.meaningIndex;
    const raw = ex as Record<string, unknown>;
    if (meaningIndex === undefined && typeof raw["meaning_index"] === "number") {
      meaningIndex = raw["meaning_index"] as number;
    }
    if (definitions && meaningIndex !== undefined) {
      if (meaningIndex < 0 || meaningIndex >= definitions.length) {
        meaningIndex = 0;
      }
    }

    return { sentence, translation, meaningIndex };
  });
}
