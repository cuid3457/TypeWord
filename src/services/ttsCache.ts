/**
 * Two-tier local TTS audio cache.
 *
 *   cache/    — temporary mp3s downloaded on lookup. The OS may evict these
 *               under storage pressure. Used for words the user hasn't saved.
 *   document/ — permanent mp3s for words the user saved. Kept until the user
 *               deletes the word.
 *
 * Filenames are deterministic 64-bit hashes of (text, language, gender) so
 * the same lookup always maps to the same file regardless of when it was
 * fetched. Lookup order is persistent → cache → null.
 */
import { Directory, File, Paths } from 'expo-file-system';

const CACHE_DIR = new Directory(Paths.cache, 'tts');
const PERSISTENT_DIR = new Directory(Paths.document, 'tts');

let dirsReady = false;
function ensureDirs() {
  if (dirsReady) return;
  try {
    if (!CACHE_DIR.exists) CACHE_DIR.create({ intermediates: true, idempotent: true });
    if (!PERSISTENT_DIR.exists) PERSISTENT_DIR.create({ intermediates: true, idempotent: true });
    dirsReady = true;
  } catch (err) {
    console.warn('tts cache: failed to create dirs:', err);
  }
}

/** 64-bit hash via two FNV-1a passes with different seeds. Keeps filenames
 *  short, fixed-width, and filesystem-safe regardless of input script.
 *
 *  phonemeKey is included so polysemy variants (e.g. 长 cháng vs zhǎng) cache
 *  to distinct files even though the text is identical. Pass '' for normal
 *  entries to keep their cache untouched by this change. */
// Bump this when server-side TTS output changes so existing local mp3 cache
// is treated as "not found" and the next playback re-downloads.
//   v2: zh-CN male swap Yunjian → Yunyang.
//   v3: SSML now wraps content in <prosody volume="+40%"> for louder iOS
//       playback (expo-audio's volume clamps at 1.0, so the boost has to
//       happen at synthesis time). Re-fetch all locales.
const HASH_KEY_VERSION = 'v3';

function hashKey(text: string, lang: string, gender: 'F' | 'M', phonemeKey: string): string {
  const norm = text.normalize('NFC').toLowerCase().trim();
  const combined = `${norm}|${lang}|${gender}${phonemeKey ? `|ph:${phonemeKey}` : ''}|${HASH_KEY_VERSION}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x12345678;
  for (let i = 0; i < combined.length; i++) {
    const c = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x9e3779b1);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
}

function fileName(text: string, lang: string, gender: 'F' | 'M', phonemeKey: string): string {
  return `${hashKey(text, lang, gender, phonemeKey)}.mp3`;
}

/** Returns local file URI if the audio is already cached or persistent. */
export function findLocalTtsUri(
  text: string,
  lang: string,
  gender: 'F' | 'M',
  phonemeKey: string = '',
): string | null {
  ensureDirs();
  const name = fileName(text, lang, gender, phonemeKey);
  try {
    const persistent = new File(PERSISTENT_DIR, name);
    if (persistent.exists) return persistent.uri;
    const cache = new File(CACHE_DIR, name);
    if (cache.exists) return cache.uri;
  } catch (err) {
    console.warn('tts cache: lookup failed:', err);
  }
  return null;
}

/**
 * Download mp3 from a remote URL into the cache directory. Returns the local
 * file URI. If already cached/persistent, returns existing URI without
 * re-downloading.
 */
export async function downloadTtsToCache(
  url: string,
  text: string,
  lang: string,
  gender: 'F' | 'M',
  phonemeKey: string = '',
): Promise<string | null> {
  ensureDirs();
  const existing = findLocalTtsUri(text, lang, gender, phonemeKey);
  if (existing) return existing;
  try {
    const dest = new File(CACHE_DIR, fileName(text, lang, gender, phonemeKey));
    const downloaded = await File.downloadFileAsync(url, dest);
    return downloaded.uri;
  } catch (err) {
    console.warn('tts cache: download failed:', err);
    return null;
  }
}

/**
 * Move both gender variants of a word from cache → persistent storage.
 * Called when the user saves a word, so its audio survives cache eviction.
 * No-op if the file isn't in cache (e.g. download failed earlier).
 *
 * `phonemeKey` defaults to '' (the non-polysemy file name). Polysemy
 * variants don't get promoted by this helper — they remain in the cache
 * directory and get re-downloaded on demand, which is acceptable since
 * polysemous entries are uncommon enough that the OS cache rarely evicts
 * them between sessions.
 */
export function promoteToPersistent(text: string, lang: string, phonemeKey: string = ''): void {
  ensureDirs();
  for (const g of ['F', 'M'] as const) {
    const name = fileName(text, lang, g, phonemeKey);
    try {
      const persistent = new File(PERSISTENT_DIR, name);
      if (persistent.exists) {
        // Already promoted — clean up any leftover cache entry.
        const cache = new File(CACHE_DIR, name);
        if (cache.exists) cache.delete();
        continue;
      }
      const cache = new File(CACHE_DIR, name);
      if (!cache.exists) continue;
      cache.move(persistent);
    } catch (err) {
      console.warn('tts cache: promote failed:', err);
    }
  }
}

/** Remove both gender variants of a word from persistent storage. */
export function removeFromPersistent(text: string, lang: string, phonemeKey: string = ''): void {
  ensureDirs();
  for (const g of ['F', 'M'] as const) {
    const name = fileName(text, lang, g, phonemeKey);
    try {
      const file = new File(PERSISTENT_DIR, name);
      if (file.exists) file.delete();
    } catch (err) {
      console.warn('tts cache: delete failed:', err);
    }
  }
}

/**
 * Wipe both the cache and persistent TTS directories. Used by the in-app
 * "Reset Local Data" action so users get a clean slate after a voice swap
 * (otherwise the OLD voice's mp3 stays in persistent storage and is played
 * preferentially over a fresh cloud fetch).
 */
export function clearAllTtsFiles(): void {
  for (const dir of [CACHE_DIR, PERSISTENT_DIR]) {
    try {
      if (dir.exists) {
        dir.delete();
        dir.create({ intermediates: true, idempotent: true });
      }
    } catch (err) {
      console.warn('tts cache: clearAll failed:', err);
    }
  }
  dirsReady = true;
}

/** Per-voice playback rate correction, mirroring tts-voices.ts on server.
 * Values are LANGUAGE_BASE_RATE × VOICE_CORRECTION (combined). Used only
 * as a client-side fallback when the edge function fails to return
 * `rateCorrection` — normal path uses the server-computed value. */
const VOICE_CORRECTIONS_BY_LANG_GENDER: Record<string, { F: number; M: number }> = {
  en:      { F: 0.879 * 1.025, M: 0.879 * 0.975 },
  ko:      { F: 0.964 * 0.922, M: 0.964 * 1.078 },
  ja:      { F: 0.815 * 1.034, M: 0.815 * 0.966 },
  'zh-CN': { F: 0.766 * 1.047, M: 0.766 * 0.953 },
  'zh-TW': { F: 0.856 * 1.034, M: 0.856 * 0.966 },
  es:      { F: 0.862 * 1.023, M: 0.862 * 0.977 },
  fr:      { F: 0.873 * 1.027, M: 0.873 * 0.973 },
  de:      { F: 1.044 * 1.055, M: 1.044 * 0.945 },
  it:      { F: 0.828 * 0.993, M: 0.828 * 1.007 },
  pt:      { F: 0.821 * 0.960, M: 0.821 * 1.040 },
  ru:      { F: 0.926 * 0.979, M: 0.926 * 1.021 },
};

export function getRateCorrection(lang: string, gender: 'F' | 'M'): number {
  return VOICE_CORRECTIONS_BY_LANG_GENDER[lang]?.[gender] ?? 1.0;
}
