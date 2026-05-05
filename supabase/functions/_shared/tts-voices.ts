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
 * Voice rate correction factors. Each Azure neural voice has a slightly
 * different native speaking rate; without correction, toggling F/M within a
 * language would change perceived speed even at user_rate=1.0.
 *
 * Computed by measuring mp3 duration of the same long sentence per voice,
 * then setting per-language reference = avg(F, M) duration. correction =
 * reference / voice_duration. Apply on the client as:
 *   playback_rate = user_rate × VOICE_CORRECTIONS[voiceId]
 *
 * Range observed: ±6.5%. Largest gaps (de/ko/zh-TW/pt) had ~12% F-M speed
 * differences before correction; this map normalizes them within-language.
 *
 * Re-run /tmp/lookup-test/measure_rates.mjs when adding/swapping voices.
 */
export const VOICE_CORRECTIONS: Record<string, number> = {
  'en-US-JennyNeural':     0.980,
  'en-US-AndrewNeural':    1.021,
  'ko-KR-JiMinNeural':     1.064,
  'ko-KR-HyunsuNeural':    0.943,
  'ja-JP-MayuNeural':      0.990,
  'ja-JP-DaichiNeural':    1.010,
  'zh-CN-XiaoxiaoNeural':  1.000,
  // YunyangNeural — news-style voice, clearer tones than Yunjian for isolated
  // CJK chars. Native rate is ~7-9% faster than Xiaoxiao's conversational
  // pacing (estimated, not yet measured against the reference sentence).
  // 0.93 brings perceived speed in line with the female voice; re-run
  // measure_rates.mjs once it's restored to refine.
  'zh-CN-YunyangNeural':   0.850,
  'zh-TW-HsiaoChenNeural': 0.942,
  'zh-TW-YunJheNeural':    1.065,
  'es-ES-AbrilNeural':     0.982,
  'es-ES-NilNeural':       1.019,
  'fr-FR-CelesteNeural':   0.978,
  'fr-FR-YvesNeural':      1.023,
  'de-DE-TanjaNeural':     0.942,
  'de-DE-KlausNeural':     1.065,
  'it-IT-PalmiraNeural':   0.989,
  'it-IT-GianniNeural':    1.011,
  'pt-BR-LeilaNeural':     1.062,
  'pt-BR-JulioNeural':     0.945,
  'ru-RU-SvetlanaNeural':  0.996,
  'ru-RU-DmitryNeural':    1.004,
};

export function pickVoice(language: string, gender: Gender): { voice: string; locale: string } | null {
  const voices = TTS_VOICES[language];
  const locale = TTS_LOCALE[language];
  if (!voices || !locale) return null;
  return { voice: voices[gender], locale };
}

/** Get correction factor for a voice. Returns 1.0 if voice unknown. */
export function rateCorrectionFor(voice: string): number {
  return VOICE_CORRECTIONS[voice] ?? 1.0;
}
