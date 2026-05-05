/**
 * Cloud TTS playback via Supabase edge function (Azure Neural).
 *
 * Flow:
 *   1. Read voice gender + playback rate from user settings.
 *   2. POST to tts-synthesize → cache hit returns mp3 URL + per-voice
 *      rateCorrection; miss synthesizes and uploads then returns.
 *   3. Play with expo-audio at user_rate × correction (pitch corrected).
 *   4. On network/edge failure, fall back to expo-speech device TTS.
 *
 * Only one player active at a time — calling speakCloud while audio is
 * still playing replaces it, matching the previous expo-speech behavior.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { supabase } from '@src/api/supabase';
import { getUserSettings } from '@src/storage/userSettings';
import { downloadTtsToCache, findLocalTtsUri, getRateCorrection } from './ttsCache';

const SUPPORTED_LANGS = new Set([
  'en', 'ko', 'ja', 'zh-CN', 'zh-TW',
  'es', 'fr', 'de', 'it', 'pt', 'ru',
]);

let activePlayer: AudioPlayer | null = null;
// Monotonically increasing token. Each speakCloud call captures the value at
// entry; if a newer call has come in by the time async work resolves, the
// older call discards its work instead of starting playback.
let speakSeq = 0;

function disposeActive() {
  if (activePlayer) {
    try { activePlayer.pause(); } catch { /* already paused */ }
    try { activePlayer.remove(); } catch { /* already removed */ }
    activePlayer = null;
  }
}

interface TtsResponse {
  url: string;
  cached: boolean;
  rateCorrection?: number;
}

/** SSML phoneme override for polysemous CJK chars (e.g. 长 → zhǎng). */
export interface PhonemeOverride {
  ph: string;
  alphabet?: string;
}

async function fetchTts(
  text: string,
  language: string,
  gender: 'F' | 'M',
  phoneme?: PhonemeOverride,
): Promise<TtsResponse> {
  const { data, error } = await supabase.functions.invoke<TtsResponse>('tts-synthesize', {
    body: { text, language, gender, phoneme },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('tts: no url in response');
  return data;
}

function phonemeKey(p?: PhonemeOverride): string {
  // `v4:` prefix invalidates v2/v3 local mp3 files cached during sapi/mstts
  // attempts that all silently fell back to plain text.
  return p ? `v4:${p.alphabet ?? 'ipa'}:${p.ph}` : '';
}

function fallbackToDevice(text: string, language: string, rate: number) {
  // Disabled: the device TTS uses the OS default voice (often female on
  // Android), which contradicts the user's gender setting and causes
  // intermittent female playback when cloud TTS hiccups. Prefer silence —
  // the user can tap the speaker icon to retry. Keep the function so call
  // sites need no changes; just no-op for now.
  void text; void language; void rate;
}

/**
 * Speak `text` in the given language. Voice gender and rate come from user
 * settings. Falls back to device TTS on cloud failure.
 */
// All mp3s are synthesized with SSML `<prosody volume="+40%">`, so they're
// already louder at the source. iOS plays at full volume to use the boost;
// Android attenuates to roughly the original loudness (otherwise it'd be
// uncomfortably loud after the +40% baked into the file).
// 1 / 1.40 ≈ 0.71 — keeps Android perceived loudness ≈ pre-boost baseline
// while iOS gets the full 40% lift.
const PLATFORM_VOLUME = Platform.OS === 'ios' ? 1.0 : 0.71;

function startPlayback(uri: string, playbackRate: number) {
  const player = createAudioPlayer({ uri });
  activePlayer = player;
  player.setPlaybackRate(playbackRate, 'high');
  player.volume = PLATFORM_VOLUME;
  player.play();
}

export async function speakCloud(
  text: string,
  language: string,
  phoneme?: PhonemeOverride,
): Promise<void> {
  if (!text.trim()) return;

  // Step 1 (synchronous, immediate): silence anything currently playing and
  // claim a new sequence token. Any older in-flight speakCloud call will see
  // its captured token < speakSeq and abort before starting playback.
  disposeActive();
  try { Speech.stop(); } catch { /* ignore */ }
  const mySeq = ++speakSeq;

  // Step 2: read user settings (AsyncStorage round-trip).
  const settings = await getUserSettings();
  if (mySeq !== speakSeq) return;
  const gender = settings?.voiceGender ?? 'F';
  const userRate = settings?.voiceRate ?? 1.0;

  if (!SUPPORTED_LANGS.has(language)) {
    fallbackToDevice(text, language, userRate);
    return;
  }

  const pk = phonemeKey(phoneme);

  // Step 3: play from local file if already cached or persistent — no network.
  const localUri = findLocalTtsUri(text, language, gender, pk);
  if (localUri) {
    if (mySeq !== speakSeq) return;
    try {
      startPlayback(localUri, userRate * getRateCorrection(language, gender));
      return;
    } catch (err) {
      console.warn('local TTS playback failed, refetching:', err);
      // Fall through to cloud path.
    }
  }

  // Step 4: fetch URL from cloud, download mp3 into cache, play from local.
  let resp: TtsResponse;
  try {
    resp = await fetchTts(text, language, gender, phoneme);
  } catch (err) {
    if (mySeq !== speakSeq) return;
    console.warn('cloud TTS failed:', err);
    fallbackToDevice(text, language, userRate);
    return;
  }
  if (mySeq !== speakSeq) return;

  // Download to local cache so the next playback is instant + offline-capable.
  // If download fails, fall back to streaming the remote URL directly.
  let playbackUri = resp.url;
  try {
    const cached = await downloadTtsToCache(resp.url, text, language, gender, pk);
    if (mySeq !== speakSeq) return;
    if (cached) playbackUri = cached;
  } catch {
    // streaming from URL still works
  }

  try {
    const correction = resp.rateCorrection ?? getRateCorrection(language, gender);
    startPlayback(playbackUri, userRate * correction);
  } catch (err) {
    console.warn('audio playback failed, falling back:', err);
    disposeActive();
    fallbackToDevice(text, language, userRate);
  }
}

/** Stop any in-flight playback (cloud or device fallback). */
export function stopAll(): void {
  speakSeq++; // invalidate any in-flight speakCloud await chains
  disposeActive();
  try { Speech.stop(); } catch { /* ignore */ }
}

/**
 * Warm the TTS cache for `text` in the given language without playing.
 * Always pre-warms BOTH genders so toggling F/M in voice settings is
 * instant for every word the user has seen. The cache is cross-user, so
 * a user who only ever uses one gender still helps fill the other.
 *
 * Fire-and-forget — failures are silent (the speak path will retry or
 * fall back). Skips unsupported languages and empty text.
 */
export function prefetchTts(text: string, language: string, phoneme?: PhonemeOverride): void {
  // Fire-and-forget variant for callers that don't need to wait — used by
  // the in-app search/review flows where prefetch is opportunistic and
  // overlapping with user navigation.
  void prefetchTtsAwaitable(text, language, phoneme);
}

/**
 * Awaitable variant — returns a Promise that resolves once BOTH gender mp3s
 * are fully cached on disk (or known to be already there, or failed).
 * Callers can use this with a concurrency limiter to bound in-flight
 * downloads when prefetching a large batch (e.g. a curated wordlist).
 */
export async function prefetchTtsAwaitable(
  text: string,
  language: string,
  phoneme?: PhonemeOverride,
): Promise<void> {
  if (!text?.trim()) return;
  if (!SUPPORTED_LANGS.has(language)) return;
  const pk = phonemeKey(phoneme);
  await Promise.all((['F', 'M'] as const).map(async (g) => {
    if (findLocalTtsUri(text, language, g, pk)) return;
    try {
      const resp = await fetchTts(text, language, g, phoneme);
      await downloadTtsToCache(resp.url, text, language, g, pk);
    } catch {
      /* ignore — speakCloud will refetch on demand */
    }
  }));
}
