import type { WordLookupResult } from '@src/types/word';

/**
 * Client-side post-processing for AI lookup results.
 * Fixes common model mistakes:
 *  1. partOfSpeech in English when targetLang is not English
 *  2. headword set when it shouldn't be (non-reverse lookups)
 *  3. examples with sentence/translation languages swapped
 */

// ── POS mapping ──

const POS_MAP: Record<string, Record<string, string>> = {
  ko: {
    noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사',
    preposition: '전치사', conjunction: '접속사', interjection: '감탄사',
    pronoun: '대명사', determiner: '관형사', particle: '조사',
    'proper noun': '고유명사', abbreviation: '약어', prefix: '접두사', suffix: '접미사',
    expression: '수식',
  },
  ja: {
    noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
    preposition: '前置詞', conjunction: '接続詞', interjection: '感嘆詞',
    pronoun: '代名詞', 'proper noun': '固有名詞', expression: '数式',
  },
  zh: {
    noun: '名词', verb: '动词', adjective: '形容词', adverb: '副词',
    preposition: '介词', conjunction: '连词', interjection: '叹词',
    pronoun: '代词', 'proper noun': '专有名词', expression: '表达式',
  },
  es: {
    noun: 'sustantivo', verb: 'verbo', adjective: 'adjetivo', adverb: 'adverbio',
    preposition: 'preposición', conjunction: 'conjunción', interjection: 'interjección',
    pronoun: 'pronombre', 'proper noun': 'nombre propio', expression: 'expresión',
  },
  fr: {
    noun: 'nom', verb: 'verbe', adjective: 'adjectif', adverb: 'adverbe',
    preposition: 'préposition', conjunction: 'conjonction', interjection: 'interjection',
    pronoun: 'pronom', 'proper noun': 'nom propre', expression: 'expression',
  },
  de: {
    noun: 'Nomen', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb',
    preposition: 'Präposition', conjunction: 'Konjunktion', interjection: 'Interjektion',
    pronoun: 'Pronomen', 'proper noun': 'Eigenname', expression: 'Ausdruck',
  },
  it: {
    noun: 'nome', verb: 'verbo', adjective: 'aggettivo', adverb: 'avverbio',
    preposition: 'preposizione', conjunction: 'congiunzione', interjection: 'interiezione',
    pronoun: 'pronome', 'proper noun': 'nome proprio', expression: 'espressione',
  },
  pt: {
    noun: 'substantivo', verb: 'verbo', adjective: 'adjetivo', adverb: 'advérbio',
    preposition: 'preposição', conjunction: 'conjunção', interjection: 'interjeição',
    pronoun: 'pronome', 'proper noun': 'nome próprio', expression: 'expressão',
  },
  ru: {
    noun: 'существительное', verb: 'глагол', adjective: 'прилагательное', adverb: 'наречие',
    preposition: 'предлог', conjunction: 'союз', interjection: 'междометие',
    pronoun: 'местоимение', 'proper noun': 'имя собственное', expression: 'выражение',
  },
};

const REVERSE_POS: Record<string, string> = {};
for (const [, map] of Object.entries(POS_MAP)) {
  for (const [enKey, localized] of Object.entries(map)) {
    REVERSE_POS[localized.toLowerCase()] = enKey;
  }
}

export function translatePOS(pos: string, toLang: string): string {
  if (!pos) return pos;
  const normalized = pos.toLowerCase().trim();
  const enKey = REVERSE_POS[normalized] ?? normalized;
  if (toLang === 'en') return enKey;
  const map = POS_MAP[toLang];
  if (!map) return pos;
  return map[enKey] ?? pos;
}

function fixPOS(result: WordLookupResult, targetLang: string): WordLookupResult {
  if (targetLang === 'en' || !result.meanings) return result;
  const map = POS_MAP[targetLang];
  if (!map) return result;

  let changed = false;
  const meanings = result.meanings.map((m) => {
    const key = m.partOfSpeech.toLowerCase().trim();
    const translated = map[key];
    if (translated) {
      changed = true;
      return { ...m, partOfSpeech: translated };
    }
    return m;
  });
  return changed ? { ...result, meanings } : result;
}

// ── Language detection heuristics ──

const CJK_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;
const HANGUL_RE = /[\uAC00-\uD7AF]/;
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/;
const LATIN_RE = /[a-zA-ZÀ-ÿ]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;

/**
 * Returns the most likely language code for a text string.
 * Only needs to distinguish among the languages the app supports.
 */
function detectLang(text: string): string | null {
  const chars = text.replace(/[\s\d\p{P}]/gu, '');
  if (!chars) return null;

  // Count script occurrences
  let hangul = 0, kana = 0, cjk = 0, latin = 0, cyrillic = 0;
  for (const ch of chars) {
    if (HANGUL_RE.test(ch)) hangul++;
    else if (KANA_RE.test(ch)) kana++;
    else if (CJK_RE.test(ch)) cjk++;
    else if (CYRILLIC_RE.test(ch)) cyrillic++;
    else if (LATIN_RE.test(ch)) latin++;
  }

  const total = chars.length;
  if (hangul / total > 0.3) return 'ko';
  if (kana / total > 0.2) return 'ja';
  if (cyrillic / total > 0.3) return 'ru';
  if (cjk / total > 0.3) return 'zh';
  if (latin / total > 0.5) return 'latin';
  return null;
}

function isLangMatch(detected: string | null, expected: string): boolean {
  if (!detected) return true; // can't tell, assume OK
  if (detected === expected) return true;
  // Latin-script languages all detect as 'latin'
  const latinLangs = new Set(['en', 'es', 'fr', 'de', 'it', 'pt']);
  if (detected === 'latin' && latinLangs.has(expected)) return true;
  return false;
}

/**
 * Fix examples where sentence/translation languages are swapped.
 */
function fixExamples(result: WordLookupResult, sourceLang: string, targetLang: string): WordLookupResult {
  if (!result.examples?.length) return result;

  let changed = false;
  const examples = result.examples.map((ex) => {
    const sentenceLang = detectLang(ex.sentence);
    const translationLang = detectLang(ex.translation);

    // If sentence looks like targetLang and translation looks like sourceLang → swap
    const sentenceMatchesTarget = isLangMatch(sentenceLang, targetLang) && !isLangMatch(sentenceLang, sourceLang);
    const translationMatchesSource = isLangMatch(translationLang, sourceLang) && !isLangMatch(translationLang, targetLang);

    if (sentenceMatchesTarget && translationMatchesSource) {
      changed = true;
      return { sentence: ex.translation, translation: ex.sentence };
    }
    return ex;
  });

  return changed ? { ...result, examples } : result;
}

// ── Particle trimming for ** markers ──

const KO_PARTICLE_RE =
  /^(.*?)(을|를|이|가|은|는|에서|에게서|에게|에|의|으로|로|와|과|도|만|까지|부터|처럼|같이|보다|한테서|한테|들|이라고|라고|이고|하고|이며|이나|나|야|아|여|이여|입니다|습니다)$/;

const JA_PARTICLE_RE = /^(.*?)(は|が|を|に|へ|で|と|から|まで|の|も|や|よ|ね|か|ば|て|で|な|だ)$/;

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
    case '을': return has;
    case '를': return !has;
    case '이': return has;
    case '가': return !has;
    case '은': return has;
    case '는': return !has;
    case '과': return has;
    case '와': return !has;
    case '으로': return has && !hasL;
    case '로': return !has || hasL;
    default: return true;
  }
}

function trimParticle(marked: string, lang: string, headword: string): string {
  if (lang === 'ko') {
    const m = KO_PARTICLE_RE.exec(marked);
    if (m && m[1].length >= 1 && isValidKoParticle(m[1], m[2])) {
      if (m[1] === headword) return m[1];
    }
  }
  if (lang === 'ja') {
    const m = JA_PARTICLE_RE.exec(marked);
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

function deduplicateMarkers(text: string, word: string, lang: string): string {
  if (!text?.includes('**') || !word) return text;
  const parts = text.split('**');
  const markedIndices: number[] = [];
  for (let i = 1; i < parts.length; i += 2) markedIndices.push(i);
  if (markedIndices.length <= 1) return text;
  if (lang === 'de') return text;

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

  let r = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      r += i === bestIdx ? '**' + parts[i] + '**' : parts[i];
    } else {
      r += parts[i];
    }
  }
  return r;
}

function fixMarkers(text: string, word: string, lang: string): string {
  if (!text?.includes('**')) return text;
  let result = deduplicateMarkers(text, word, lang);
  if (lang !== 'ko' && lang !== 'ja') return result;
  const parts = result.split('**');
  for (let i = 1; i < parts.length; i += 2) {
    const seg = parts[i];
    const trimmed = trimParticle(seg, lang, word);
    if (trimmed !== seg) {
      const particle = seg.slice(trimmed.length);
      result = result.replace(`**${seg}**`, `**${trimmed}**${particle}`);
    }
  }
  return result;
}

function fixExampleMarkers(result: WordLookupResult, sourceLang: string, targetLang: string): WordLookupResult {
  if (!result.examples?.length) return result;
  const headword = result.headword ?? '';
  let changed = false;
  const examples = result.examples.map((ex) => {
    const sentence = fixMarkers(ex.sentence, headword, sourceLang);
    const defIdx = ex.meaningIndex ?? 0;
    const def = result.meanings?.[defIdx]?.definition ?? result.meanings?.[0]?.definition ?? '';
    const translation = fixMarkers(ex.translation, def, targetLang);
    let meaningIndex = ex.meaningIndex;
    const raw = ex as unknown as Record<string, unknown>;
    if (meaningIndex === undefined && typeof raw['meaning_index'] === 'number') {
      meaningIndex = raw['meaning_index'] as number;
    }
    if (sentence !== ex.sentence || translation !== ex.translation || meaningIndex !== ex.meaningIndex) {
      changed = true;
      return { sentence, translation, meaningIndex };
    }
    return ex;
  });
  return changed ? { ...result, examples } : result;
}

/**
 * Apply all client-side normalizations to an AI lookup result.
 */
export function normalizeResult(
  result: WordLookupResult,
  opts: { sourceLang: string; targetLang: string },
): WordLookupResult {
  let r = result;
  r = fixPOS(r, opts.targetLang);
  r = fixExamples(r, opts.sourceLang, opts.targetLang);
  r = fixExampleMarkers(r, opts.sourceLang, opts.targetLang);
  return r;
}
