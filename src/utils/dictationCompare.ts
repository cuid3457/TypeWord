/**
 * Compare dictation input against the correct word with script-aware tolerance.
 *
 * Korean — decompose Hangul into initial/vowel/final jamo. Allow 1 syllable
 *   to differ ONLY if the difference is a confusable vowel pair (ㅔ↔ㅐ, ㅖ↔ㅒ)
 *   that even native speakers swap because they're phonetically identical in
 *   modern Korean.
 *
 * Japanese — allow 1 kana to differ if it's a confusable pair (は↔わ, を↔お,
 *   づ↔ず, ぢ↔じ) — same-pronunciation orthographic confusion.
 *
 * Chinese — strict. Each character carries meaning, and homophone characters
 *   are rampant (他/她/它, 在/再) so a "confusable pair" set is meaningless.
 *
 * Latin (en/es/fr/de/it/pt/ru) — Levenshtein ≤ 1 for words of ≥5 characters.
 *   Below 5 a single-char diff is usually a different word.
 */

export type DictationResult = 'exact' | 'typo' | 'wrong';

export function compareDictation(input: string, correct: string, lang: string): DictationResult {
  const cleanInput = normalize(input, lang);
  const cleanCorrect = normalize(correct, lang);
  if (cleanInput === cleanCorrect) return 'exact';
  if (!cleanInput) return 'wrong';

  if (lang === 'ko') return compareKorean(cleanInput, cleanCorrect);
  if (lang === 'ja') return compareJapanese(cleanInput, cleanCorrect);
  if (lang === 'zh-CN' || lang === 'zh-TW') return 'wrong';

  return compareLatin(cleanInput, cleanCorrect);
}

/**
 * Normalize for comparison.
 *   CJK — strip all whitespace. Korean/Japanese/Chinese space conventions
 *     vary widely (especially for proper nouns and brand names), so a missing
 *     or added space shouldn't be marked wrong.
 *   Latin — collapse runs of whitespace to a single space. Spaces still matter
 *     ("hot dog" ≠ "hotdog") but double spaces shouldn't.
 */
function normalize(s: string, lang: string): string {
  const lower = s.trim().toLocaleLowerCase();
  if (lang === 'ko' || lang === 'ja' || lang === 'zh-CN' || lang === 'zh-TW') {
    return lower.replace(/\s+/g, '');
  }
  return lower.replace(/\s+/g, ' ');
}

function compareLatin(a: string, b: string): DictationResult {
  if (b.length < 5) return 'wrong';
  return levenshtein(a, b) === 1 ? 'typo' : 'wrong';
}

function compareKorean(a: string, b: string): DictationResult {
  if (a.length !== b.length) return 'wrong';
  let diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    diffCount++;
    if (diffCount > 1) return 'wrong';
    if (!isKoreanConfusablePair(a[i], b[i])) return 'wrong';
  }
  return diffCount === 1 ? 'typo' : 'wrong';
}

const KO_INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const KO_VOWELS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const KO_FINALS = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const KO_VOWEL_PAIRS = new Set(['ㅔㅐ', 'ㅐㅔ', 'ㅖㅒ', 'ㅒㅖ']);

function decomposeHangul(syllable: string): { initial: string; vowel: string; final: string } | null {
  const code = syllable.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  const offset = code - 0xAC00;
  return {
    initial: KO_INITIALS[Math.floor(offset / 588)],
    vowel: KO_VOWELS[Math.floor((offset % 588) / 28)],
    final: KO_FINALS[offset % 28],
  };
}

function isKoreanConfusablePair(a: string, b: string): boolean {
  const ja = decomposeHangul(a);
  const jb = decomposeHangul(b);
  if (!ja || !jb) return false;
  if (ja.initial !== jb.initial || ja.final !== jb.final) return false;
  return KO_VOWEL_PAIRS.has(ja.vowel + jb.vowel);
}

function compareJapanese(a: string, b: string): DictationResult {
  if (a.length !== b.length) return 'wrong';
  let diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    diffCount++;
    if (diffCount > 1) return 'wrong';
    if (!JA_KANA_PAIRS.has(a[i] + b[i])) return 'wrong';
  }
  return diffCount === 1 ? 'typo' : 'wrong';
}

const JA_KANA_PAIRS = new Set([
  'はわ', 'わは',
  'をお', 'おを',
  'づず', 'ずづ',
  'ぢじ', 'じぢ',
]);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
