export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  /** If true, this language can only be used as a native/UI language, not for wordlists. */
  nativeOnly?: boolean;
}

/**
 * All supported languages.
 * The first 10 can be used for both native language and wordlist study/target.
 * Languages marked `nativeOnly` appear only in native language selection.
 */
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', nativeOnly: true },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', nativeOnly: true },
  { code: 'th', name: 'Thai', nativeName: 'ภาษาไทย', flag: '🇹🇭', nativeOnly: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', nativeOnly: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', nativeOnly: true },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', nativeOnly: true },
];

export const STUDY_LANGUAGES = LANGUAGES.filter((l) => !l.nativeOnly);

const STUDY_CODES = new Set(STUDY_LANGUAGES.map((l) => l.code));

export function isStudyLang(code: string): boolean {
  return STUDY_CODES.has(code);
}

export function findLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
