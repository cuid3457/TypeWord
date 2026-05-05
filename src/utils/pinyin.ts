/**
 * Pinyin tone-mark → SAPI numeric tone converter, used to override Azure
 * Neural TTS pronunciation for polysemous Chinese characters (e.g. 长 →
 * `<phoneme alphabet="sapi" ph="zhang3">长</phoneme>` to force zhǎng).
 *
 * Azure SAPI Mandarin format:
 *   - Each syllable = letters + numeric tone (1-4) or no number for neutral
 *   - Multi-syllable separated by spaces
 *   - ü → "v" (SAPI convention)
 *
 * Examples:
 *   "zhǎng"     → "zhang3"
 *   "cháng"     → "chang2"
 *   "kǎo shì"   → "kao3 shi4"
 *   "lǜ"        → "lv4"
 */

const TONE_MARKS: Record<string, [string, number]> = {
  'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
  'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
  'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
  'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
  'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
  'ǖ': ['v', 1], 'ǘ': ['v', 2], 'ǚ': ['v', 3], 'ǜ': ['v', 4],
};

function syllableToSapi(syllable: string): string {
  let tone = 5; // neutral default — emit no number
  let stripped = '';
  for (const ch of syllable) {
    const m = TONE_MARKS[ch];
    if (m) {
      stripped += m[0];
      tone = m[1];
    } else if (ch === 'ü' || ch === 'Ü') {
      stripped += 'v';
    } else {
      stripped += ch.toLowerCase();
    }
  }
  return tone === 5 ? stripped : `${stripped}${tone}`;
}

/**
 * Convert tone-marked pinyin to SAPI numeric form. Multi-syllable input
 * (separated by spaces or dashes) is split, each syllable converted, joined
 * with single spaces.
 *
 * Returns null when the input contains no tone-marked vowels and no syllable
 * boundaries — that's a sign the string isn't actually pinyin (e.g. it's
 * already a hanzi character) and falling back to the engine's default
 * pronunciation is safer than a spurious phoneme override.
 */
export function pinyinToSapi(pinyin: string): string | null {
  const trimmed = pinyin.trim();
  if (!trimmed) return null;
  const syllables = trimmed.split(/[\s\-·]+/).filter((s) => s.length > 0);
  if (syllables.length === 0) return null;

  const hasToneMarkOrSpace =
    syllables.length > 1 || /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ]/.test(trimmed);
  if (!hasToneMarkOrSpace) return null;

  return syllables.map(syllableToSapi).join(' ');
}

/**
 * Build an SSML phoneme override for a Chinese word — disabled by design.
 *
 * Azure neural zh-CN voices (verified XiaoxiaoNeural) reject `<phoneme>`
 * payloads with empty 400 responses regardless of alphabet (sapi, mstts
 * namespaced, ipa) or quoting/structure variants tested in production. The
 * function is kept so call sites don't need to change if a future Azure
 * voice update or alternate provider adds support — they can pass the
 * pronunciation through as before. For now we always return null so the
 * TTS pipeline uses plain-text SSML, which Azure reads correctly with its
 * default pronunciation.
 *
 * Polysemy entries (e.g. 长 cháng / 长 zhǎng) therefore play the same
 * audio. Visual disambiguation (two cards, separate meanings, reading text
 * shown next to the headword) is the user-facing distinction.
 */
export function phonemeForChinese(
  _langCode: string,
  _reading: string | string[] | undefined,
  _word?: string,
): { ph: string; alphabet: string } | null {
  return null;
}
