import type { WordExample, WordLookupResult } from "./types.ts";

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
const MIN_RELEVANCE = 30;

/**
 * Normalize AI response:
 * - Filter out meanings with low relevanceScore
 * - Fix partOfSpeech values that are in English when targetLang is not English
 * - Correct misspelled/hallucinated POS to the closest valid value
 */
export function normalizeResult(
  result: WordLookupResult,
  targetLang: string,
): WordLookupResult {
  if (!result.meanings) return result;

  // Filter low-relevance meanings
  const filtered = result.meanings.filter(
    (m) => (m.relevanceScore ?? 0) >= MIN_RELEVANCE,
  );

  if (targetLang === "en") return { ...result, meanings: filtered };

  const map = POS_MAP[targetLang];
  if (!map) return { ...result, meanings: filtered };

  const validPos = getValidPos(targetLang);

  const reverseMap = getReversePosMap();
  return {
    ...result,
    meanings: filtered.map((m) => {
      const key = m.partOfSpeech.toLowerCase().trim();
      const translated = map[key];
      if (translated) return { ...m, partOfSpeech: translated };
      const enKey = reverseMap.get(m.partOfSpeech);
      if (enKey && map[enKey]) return { ...m, partOfSpeech: map[enKey] };
      const fixed = fixPos(m.partOfSpeech, validPos);
      return fixed !== m.partOfSpeech ? { ...m, partOfSpeech: fixed } : m;
    }),
  };
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

  if (!word) return text;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "i");
  const match = re.exec(text);
  if (match) {
    const idx = match.index;
    return text.slice(0, idx) + "**" + match[1] + "**" + text.slice(idx + match[1].length);
  }
  return text;
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

    const sentence = fixMarkersInText(sent, headword, sourceLang);
    const def = definitions?.[ex.meaningIndex ?? 0] ?? definitions?.[0] ?? "";
    const translation = fixMarkersInText(trans, def, targetLang);

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
