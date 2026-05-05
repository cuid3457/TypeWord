/**
 * TTS playback — uses the cloud TTS edge function (Azure Neural via
 * Supabase). Falls back to expo-speech device TTS on network failure or
 * when the language isn't in the supported set.
 *
 * Voice gender + playback rate come from user settings. Per-voice rate
 * correction is applied so toggling F/M within a language yields a
 * consistent perceived speed at user_rate=1.0.
 */
import { prefetchTts, speakCloud, stopAll, type PhonemeOverride } from '@src/services/ttsService';
import { phonemeForChinese } from '@src/utils/pinyin';

const TTS_LOCALE: Record<string, string> = {
  zh: 'zh-CN',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  ja: 'ja-JP',
  ko: 'ko-KR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
  ru: 'ru-RU',
};

export function getTtsLocale(langCode: string): string {
  return TTS_LOCALE[langCode] ?? langCode;
}

/**
 * Speak a word using cloud TTS (Azure Neural). User's voice gender +
 * playback rate are read from settings inside speakCloud. Falls back to
 * expo-speech if the cloud call fails.
 *
 * `phoneme` is an optional pronunciation override for polysemous Chinese
 * chars (e.g. 长 → ph='zhang3' to force zhǎng instead of Azure's default
 * cháng). Use `phonemeForChinese(langCode, reading)` to derive it from a
 * single-element pinyin reading.
 */
export function speakWord(text: string, langCode: string, phoneme?: PhonemeOverride): void {
  // Fire-and-forget — don't block the UI on TTS playback.
  speakCloud(text, langCode, phoneme).catch(() => {
    // Already falls back internally; here just swallow any final error.
  });
}

/** Stop any in-flight playback (used when navigating away or interrupting). */
export function stopSpeaking(): void {
  stopAll();
}

/**
 * Warm the TTS cache for the given text in advance (no playback). Call this
 * the moment a quick / enrich lookup returns so the audio is already cached
 * by the time the user taps the speaker button.
 */
export function prefetchSpeak(text: string, langCode: string, phoneme?: PhonemeOverride): void {
  prefetchTts(text, langCode, phoneme);
}

/** Re-export so call sites can build phoneme overrides without a second import. */
export { phonemeForChinese };

/**
 * For ja, TTS should use the reading (hiragana) instead of raw kanji,
 * which TTS engines often mispronounce.
 * Chinese and Arabic are excluded — their TTS engines read native script
 * correctly and cannot properly interpret romanization (pinyin/Latin).
 */
const READING_TTS_LANGS = new Set(['ja']);

export function getTtsText(
  word: string,
  langCode: string,
  reading?: string | string[],
): string {
  if (!reading || !READING_TTS_LANGS.has(langCode)) return word;
  const raw = Array.isArray(reading) ? reading[0] : reading;
  if (!raw) return word;
  // Strip hint after " — " (e.g. "なま — raw, uncooked" → "なま")
  const clean = raw.split(' — ')[0].trim();
  return clean || word;
}

// (cloud TTS doesn't need device voice preloading)
