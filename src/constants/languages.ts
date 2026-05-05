export interface Language {
  code: string;
  name: string;
  nativeName: string;
  /** Reserved for future use. Country flags were removed from the picker
   *  to avoid conflating language with nationality (and the inevitable
   *  political readings — particularly around zh-CN / zh-TW). */
  flag: string;
}

/**
 * Supported languages — single source of truth.
 * Used as both UI/native language and wordlist study/target language.
 * `zh` and the legacy `zh-TW` are normalized to `zh-CN` via findLanguage,
 * so users with old wordlists don't break.
 */
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English (US)', nativeName: 'English (US)', flag: '' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '' },
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文', flag: '' },
  { code: 'es', name: 'Spanish (Spain)', nativeName: 'Español (España)', flag: '' },
  { code: 'fr', name: 'French (France)', nativeName: 'Français (France)', flag: '' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '' },
  { code: 'pt', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '' },
];

export const STUDY_LANGUAGES = LANGUAGES;
export const NATIVE_LANGUAGES = LANGUAGES;

const STUDY_CODES = new Set(STUDY_LANGUAGES.map((l) => l.code));

export function isStudyLang(code: string): boolean {
  if (code === 'zh') return true; // legacy
  return STUDY_CODES.has(code);
}

export function findLanguage(code: string): Language | undefined {
  if (code === 'zh' || code === 'zh-TW') {
    // Legacy `zh` and `zh-TW` (Traditional Chinese — removed from the
    // picker to avoid the politically loaded 🇨🇳/🇹🇼 dual presentation)
    // both map to the unified Chinese entry for display.
    return LANGUAGES.find((l) => l.code === 'zh-CN');
  }
  return LANGUAGES.find((l) => l.code === code);
}

/**
 * Normalize language codes for backend API calls and script detection.
 * `zh-TW` is kept as a valid backend value (existing wordlists may still
 * carry it) but funnels into the same handling as `zh-CN` in the script-
 * family layer.
 */
export function normalizeLangFamily(code: string): string {
  if (code === 'zh-CN' || code === 'zh-TW') return 'zh';
  return code;
}

/**
 * Codes removed across migrations. UI fall-back: 'en' (or 'zh-CN' for
 * Traditional Chinese which was removed in the flag/region cleanup).
 */
const REMOVED_NATIVE_CODES = new Set(['vi', 'id', 'th', 'ar', 'hi', 'tr']);

/**
 * Migrate a stored native-language code to a supported one.
 * Returns the input unchanged if it is still supported.
 */
export function migrateNativeLang(code: string | null | undefined): string {
  if (!code) return 'en';
  if (code === 'zh-TW' || code === 'zh') return 'zh-CN';
  if (REMOVED_NATIVE_CODES.has(code)) return 'en';
  return code;
}
