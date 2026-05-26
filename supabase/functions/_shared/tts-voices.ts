// Azure Neural TTS voice mapping per language. Each language has one F + one M
// voice — the most natural-sounding native voice from the Azure catalog.
//
// Reference: https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts
//
// Why these specific voices: among Azure's 4-30 voices per language, these are
// the consistently-rated "default natural" voices used as recommended defaults
// in Azure docs. They prioritize clarity (important for language learners)
// over conversational dramatic style.

export const TTS_VOICES: Record<string, { F: string; M: string }> = {
  en:      { F: 'en-US-JennyNeural',     M: 'en-US-AndrewNeural' },
  ko:      { F: 'ko-KR-JiMinNeural',     M: 'ko-KR-HyunsuNeural' },
  ja:      { F: 'ja-JP-MayuNeural',      M: 'ja-JP-DaichiNeural' },
  'zh-CN': { F: 'zh-CN-XiaoxiaoNeural',  M: 'zh-CN-YunyangNeural' },
  'zh-TW': { F: 'zh-TW-HsiaoChenNeural', M: 'zh-TW-YunJheNeural' },
  es:      { F: 'es-ES-AbrilNeural',     M: 'es-ES-NilNeural' },
  fr:      { F: 'fr-FR-CelesteNeural',   M: 'fr-FR-YvesNeural' },
  de:      { F: 'de-DE-TanjaNeural',     M: 'de-DE-KlausNeural' },
  it:      { F: 'it-IT-PalmiraNeural',   M: 'it-IT-GianniNeural' },
  pt:      { F: 'pt-BR-LeilaNeural',     M: 'pt-BR-JulioNeural' },
  ru:      { F: 'ru-RU-SvetlanaNeural',  M: 'ru-RU-DmitryNeural' },
};

// Map app language code → BCP-47 locale Azure expects in SSML xml:lang.
export const TTS_LOCALE: Record<string, string> = {
  en:      'en-US',
  ko:      'ko-KR',
  ja:      'ja-JP',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  es:      'es-ES',
  fr:      'fr-FR',
  de:      'de-DE',
  it:      'it-IT',
  pt:      'pt-BR',
  ru:      'ru-RU',
};

export type Gender = 'M' | 'F';

/**
 * Per-voice rate correction (within-language F/M normalization).
 *
 * Measured 2026-05-26 via scripts/measure_tts_rates.ts:
 *   correction = voice_duration / language_avg_duration
 *
 * Direction: faster voice (shorter duration) gets correction < 1 to slow
 * it back to the language average; slower voice gets > 1. Combined with
 * LANGUAGE_BASE_RATE this normalizes both within-language F/M and
 * cross-language pace.
 *
 * Final playback rate (client side):
 *   playback_rate = user_rate × LANGUAGE_BASE_RATE[lang] × VOICE_CORRECTIONS[voice]
 *
 * Edge function returns the combined factor as `rateCorrection` so clients
 * just multiply by their user_rate.
 *
 * Re-run scripts/measure_tts_rates.ts when adding/swapping voices.
 */
export const VOICE_CORRECTIONS: Record<string, number> = {
  'en-US-JennyNeural':     1.025,
  'en-US-AndrewNeural':    0.975,
  'ko-KR-JiMinNeural':     0.922,
  'ko-KR-HyunsuNeural':    1.078,
  'ja-JP-MayuNeural':      1.034,
  'ja-JP-DaichiNeural':    0.966,
  'zh-CN-XiaoxiaoNeural':  1.047,
  'zh-CN-YunyangNeural':   0.953,
  'zh-TW-HsiaoChenNeural': 1.034,
  'zh-TW-YunJheNeural':    0.966,
  'es-ES-AbrilNeural':     1.023,
  'es-ES-NilNeural':       0.977,
  'fr-FR-CelesteNeural':   1.027,
  'fr-FR-YvesNeural':      0.973,
  'de-DE-TanjaNeural':     1.055,
  'de-DE-KlausNeural':     0.945,
  'it-IT-PalmiraNeural':   0.993,
  'it-IT-GianniNeural':    1.007,
  'pt-BR-LeilaNeural':     0.960,
  'pt-BR-JulioNeural':     1.040,
  'ru-RU-SvetlanaNeural':  0.979,
  'ru-RU-DmitryNeural':    1.021,
};

/**
 * Per-language base rate (cross-language pace normalization).
 *
 * Azure's native voices have wildly different default syllable rates — at
 * user_rate=1.0, Japanese plays ~50% faster than English. This map scales
 * each language toward a comfortable L2-learner pace.
 *
 * Tuned 2026-05-26 with these targets (syllables/sec at user_rate=1.0):
 *   - English/German were too slow (3.6-3.8 → 4.2)
 *   - Chinese intentionally slower than others (3.8) so tones don't collapse
 *   - Other languages stay close to their natural conversational pace
 *
 * Subjective — re-tune by ear; lower value = slower playback.
 */
// 2026-05-26 final targets per user: en/zh = 3.2 syll/s, Latin = 4.0, ko/ja = 4.5
export const LANGUAGE_BASE_RATE: Record<string, number> = {
  en:      0.879,  // → 3.2 syll/s
  ko:      0.964,  // → 4.5 syll/s
  ja:      0.815,  // → 4.5 syll/s
  'zh-CN': 0.766,  // → 3.2 syll/s (tones)
  'zh-TW': 0.856,  // → 3.2 syll/s (tones)
  es:      0.862,  // → 4.0 syll/s
  fr:      0.873,  // → 4.0 syll/s
  de:      1.044,  // → 4.0 syll/s
  it:      0.828,  // → 4.0 syll/s
  pt:      0.821,  // → 4.0 syll/s
  ru:      0.926,  // → 4.0 syll/s
};

export function pickVoice(language: string, gender: Gender): { voice: string; locale: string } | null {
  const voices = TTS_VOICES[language];
  const locale = TTS_LOCALE[language];
  if (!voices || !locale) return null;
  return { voice: voices[gender], locale };
}

/** Derive app-language code from voice ID (`en-US-JennyNeural` → `en`,
 * `zh-CN-XiaoxiaoNeural` → `zh-CN`). */
function langFromVoice(voice: string): string {
  if (voice.startsWith('zh-CN-')) return 'zh-CN';
  if (voice.startsWith('zh-TW-')) return 'zh-TW';
  return voice.split('-')[0];
}

/** Combined correction = LANGUAGE_BASE_RATE × VOICE_CORRECTIONS.
 * Returns 1.0 if voice unknown. */
export function rateCorrectionFor(voice: string): number {
  const voiceCorr = VOICE_CORRECTIONS[voice] ?? 1.0;
  const langBase = LANGUAGE_BASE_RATE[langFromVoice(voice)] ?? 1.0;
  return voiceCorr * langBase;
}
