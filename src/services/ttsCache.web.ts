// Web stub for ttsCache. expo-file-system isn't usable on web, so we
// skip local persistence entirely — the browser's HTTP cache + the
// Supabase edge function's own object cache cover repeat playback. The
// rate-correction table is mirrored verbatim so playback speed stays
// consistent across platforms.

export function findLocalTtsUri(
  _text: string,
  _lang: string,
  _gender: 'F' | 'M',
  _phonemeKey: string = '',
): string | null {
  return null;
}

export async function downloadTtsToCache(
  url: string,
  _text: string,
  _lang: string,
  _gender: 'F' | 'M',
  _phonemeKey: string = '',
): Promise<string | null> {
  // Return the remote URL directly; the browser handles its own caching.
  return url;
}

export function promoteToPersistent(_text: string, _lang: string, _phonemeKey: string = ''): void {
  // no-op
}

export function removeFromPersistent(_text: string, _lang: string, _phonemeKey: string = ''): void {
  // no-op
}

export function clearAllTtsFiles(): void {
  // no-op
}

const VOICE_CORRECTIONS_BY_LANG_GENDER: Record<string, { F: number; M: number }> = {
  en: { F: 0.980, M: 1.021 },
  ko: { F: 1.064, M: 0.943 },
  ja: { F: 0.990, M: 1.010 },
  'zh-CN': { F: 1.000, M: 1.011 },
  'zh-TW': { F: 0.942, M: 1.065 },
  es: { F: 0.982, M: 1.019 },
  fr: { F: 0.978, M: 1.023 },
  de: { F: 0.942, M: 1.065 },
  it: { F: 0.989, M: 1.011 },
  pt: { F: 1.062, M: 0.945 },
  ru: { F: 0.996, M: 1.004 },
};

export function getRateCorrection(lang: string, gender: 'F' | 'M'): number {
  return VOICE_CORRECTIONS_BY_LANG_GENDER[lang]?.[gender] ?? 1.0;
}
