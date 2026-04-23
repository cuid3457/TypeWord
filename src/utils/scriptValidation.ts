/**
 * Validates that input text uses a script compatible with the wordlist's
 * source and target languages. Catches clearly wrong scripts (e.g. hiragana
 * in an English-Korean wordlist) before making an API call.
 *
 * Latin-script languages (en, fr, de, es, etc.) cannot be distinguished
 * from each other, so Latin input is always allowed.
 */

const SCRIPT_PATTERNS: Record<string, RegExp> = {
  hangul: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,
  hiragana: /[\u3040-\u309F]/,
  katakana: /[\u30A0-\u30FF]/,
  cjk: /[\u4E00-\u9FFF\u3400-\u4DBF]/,
  cyrillic: /[\u0400-\u04FF]/,
  arabic: /[\u0600-\u06FF\u0750-\u077F]/,
  devanagari: /[\u0900-\u097F]/,
  thai: /[\u0E00-\u0E7F]/,
};

const LANG_SCRIPTS: Record<string, string[]> = {
  ko: ['hangul', 'cjk'],
  ja: ['hiragana', 'katakana', 'cjk'],
  zh: ['cjk'],
  ru: ['cyrillic'],
};

/**
 * Returns true if the input text uses a script compatible with the wordlist.
 * Latin characters are always allowed (can't distinguish between Latin-based languages).
 */
export function isValidScript(
  text: string,
  sourceLang: string,
  targetLang: string,
): boolean {
  const allowedScripts = new Set([
    ...(LANG_SCRIPTS[sourceLang] ?? []),
    ...(LANG_SCRIPTS[targetLang] ?? []),
  ]);

  for (const [script, pattern] of Object.entries(SCRIPT_PATTERNS)) {
    if (!allowedScripts.has(script) && pattern.test(text)) {
      return false;
    }
  }
  return true;
}
