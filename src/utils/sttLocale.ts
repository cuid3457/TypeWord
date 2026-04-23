const STT_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zh: 'zh-CN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  ru: 'ru-RU',
};

export function getSttLocale(langCode: string): string {
  return STT_LOCALE_MAP[langCode] ?? 'en-US';
}
