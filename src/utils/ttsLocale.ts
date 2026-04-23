/**
 * TTS voice selection — picks the best available voice for each language.
 * Prefers network voices (higher quality, better tone/accent) over local ones.
 */
import * as Speech from 'expo-speech';

const TTS_LOCALE: Record<string, string> = {
  zh: 'zh-CN',
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

// Cache the best voice per locale so we only resolve once
const voiceCache: Record<string, string | null> = {};
let voicesLoaded = false;
let allVoices: Speech.Voice[] = [];

async function loadVoices(): Promise<void> {
  if (voicesLoaded) return;
  try {
    allVoices = await Speech.getAvailableVoicesAsync();
    voicesLoaded = true;
  } catch {
    // Silently fail — will use default voice
  }
}

function pickBestVoice(locale: string): string | null {
  if (voiceCache[locale] !== undefined) return voiceCache[locale];

  // Filter voices matching this locale
  const matching = allVoices.filter((v) => v.language === locale);
  if (matching.length === 0) {
    voiceCache[locale] = null;
    return null;
  }

  // Prefer network voices (higher quality, better tones/prosody)
  const network = matching.find((v) => v.identifier.includes('-network'));
  const picked = network ?? matching[0];
  voiceCache[locale] = picked.identifier;
  return picked.identifier;
}

/**
 * Speak a word with the best available voice for the given language.
 * Falls back to locale-only if the specific voice fails.
 */
export function speakWord(text: string, langCode: string, rate = 0.85): void {
  const locale = getTtsLocale(langCode);

  // Try with a specific high-quality voice if voices are loaded
  if (voicesLoaded) {
    const voiceId = pickBestVoice(locale);
    if (voiceId) {
      try {
        Speech.speak(text, { language: locale, rate, voice: voiceId });
        return;
      } catch {
        // voice rejected — fall through to basic call
      }
    }
  }

  // Fallback: locale only
  try {
    Speech.speak(text, { language: locale, rate });
  } catch {
    // TTS unavailable — silently ignore
  }
}

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

// Preload voices in the background on first import
loadVoices();
