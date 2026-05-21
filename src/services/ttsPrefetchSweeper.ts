/**
 * Background sweep that ensures every user_word + example sentence on this
 * device has its mp3 audio cached locally.
 *
 * Why it exists
 * -------------
 * The import paths (`wordlist/add`, `addCuratedWordlistToUser`,
 * `communityWordlistService`) all trigger `prefetchTtsAwaitable` +
 * `promoteToPersistent` at import time, so the originating device has
 * instant playback. But when those rows are pushed to Supabase and
 * pulled to a SECOND device (cross-device sync, fresh install + restore),
 * only the data comes down — the mp3s do not. Result: every speaker tap
 * on that device pays a ~1s cloud round-trip.
 *
 * This sweeper closes the gap. It runs once per launch (throttled to a
 * day so we don't re-scan repeatedly), iterates the local user_words,
 * checks which texts are missing in the on-disk cache, and queues those
 * with bounded concurrency for download. Cached entries are skipped via
 * `findLocalTtsUri`, so re-runs are nearly free.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDb } from '@src/db';
import { findLocalTtsUri, promoteToPersistent } from '@src/services/ttsCache';
import { prefetchTtsAwaitable, ttsPhonemeKey } from '@src/services/ttsService';
import { getUserSettings } from '@src/storage/userSettings';
import { getTtsText, phonemeForChinese } from '@src/utils/ttsLocale';
import type { WordLookupResult } from '@src/types/word';

const TAG = '[ttsSweep]';
const THROTTLE_KEY = 'typeword.ttsSweep.lastRunAt.v3';
const THROTTLE_MS = 24 * 60 * 60 * 1000; // 24h — single pass per day is plenty
// tts-synthesize has no per-user rate limit (only a system-wide 80k/min
// guard). 6 concurrent saturates RTT without burning the bandwidth or
// CPU of an in-foreground device. The earlier "concurrency=2" was
// inherited from a stale 30/min cap that no longer exists.
const CONCURRENCY = 6;

const SUPPORTED_LANGS = new Set([
  'en', 'ko', 'ja', 'zh-CN', 'zh-TW',
  'es', 'fr', 'de', 'it', 'pt', 'ru',
]);

interface Task {
  text: string;
  lang: string;
  phoneme: { ph: string; alphabet?: string } | undefined;
}

let running = false;

/** Public entry. Idempotent, throttled, silent on failure. */
export async function sweepTtsPrefetch(options: { force?: boolean } = {}): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!options.force) {
      const last = await AsyncStorage.getItem(THROTTLE_KEY);
      const lastMs = last ? parseInt(last, 10) : 0;
      if (Number.isFinite(lastMs) && Date.now() - lastMs < THROTTLE_MS) {
        console.log(`${TAG} skipped (throttled)`);
        return;
      }
    }

    const settings = await getUserSettings();
    const primary = (settings?.voiceGender ?? 'F') as 'F' | 'M';
    const secondary: 'F' | 'M' = primary === 'F' ? 'M' : 'F';

    // Run the user's current gender first so playback is unblocked ASAP,
    // then top up the other gender so toggling voices is instant even
    // without a future foreground sweep. Total ≈ 26 MB for TOEIC 600 —
    // small enough that Wi-Fi gating isn't necessary on modern plans.
    for (const gender of [primary, secondary] as const) {
      const tasks = await buildTaskList(gender);
      console.log(`${TAG} ${tasks.length} missing mp3(s) (gender=${gender})`);
      if (tasks.length === 0) continue;
      await runQueue(tasks, gender);
    }

    await AsyncStorage.setItem(THROTTLE_KEY, String(Date.now()));
    console.log(`${TAG} done`);
  } catch (err) {
    console.log(`${TAG} failed: ${(err as Error).message}`);
  } finally {
    running = false;
  }
}

interface WordRow {
  book_id: string;
  word: string;
  reading_key: string | null;
  result_json: string;
  source_lang: string;
}

async function buildTaskList(gender: 'F' | 'M'): Promise<Task[]> {
  const db = await getDb();
  // Join books to get each word's source language (which dictates the
  // TTS voice). We only need the user_words for books with a known
  // source_lang in the cloud-supported set.
  const rows = await db.getAllAsync<WordRow>(
    `SELECT w.book_id AS book_id, w.word AS word, w.reading_key AS reading_key,
            w.result_json AS result_json, b.source_lang AS source_lang
     FROM user_words w
     JOIN books b ON b.id = w.book_id`,
  );

  const tasks: Task[] = [];
  const dedupe = new Set<string>();
  const queue = (text: string, lang: string, phoneme: Task['phoneme']) => {
    if (!text.trim()) return;
    const pk = ttsPhonemeKey(phoneme);
    if (findLocalTtsUri(text, lang, gender, pk)) return;
    const dk = `${lang}|${pk}|${text}`;
    if (dedupe.has(dk)) return;
    dedupe.add(dk);
    tasks.push({ text, lang, phoneme });
  };

  for (const r of rows) {
    if (!SUPPORTED_LANGS.has(r.source_lang)) continue;

    let result: WordLookupResult;
    try {
      result = JSON.parse(r.result_json) as WordLookupResult;
    } catch {
      continue;
    }

    const headwordText = getTtsText(r.word, r.source_lang, result?.reading);
    const phoneme = r.reading_key
      ? phonemeForChinese(r.source_lang, result?.reading, r.word) ?? undefined
      : undefined;
    queue(headwordText, r.source_lang, phoneme);

    for (const ex of result?.examples ?? []) {
      const plain = (ex.sentence ?? '').replace(/\*\*/g, '').trim();
      if (plain) queue(plain, r.source_lang, undefined);
    }
  }

  return tasks;
}

async function runQueue(tasks: Task[], gender: 'F' | 'M'): Promise<void> {
  let i = 0;
  let ok = 0;
  let fail = 0;
  const startedAt = Date.now();
  const progressReporter = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`${TAG} progress: ${ok + fail}/${tasks.length} (ok=${ok} fail=${fail}) ${elapsed}s`);
  }, 5000);

  const worker = async (): Promise<void> => {
    while (i < tasks.length) {
      const t = tasks[i++];
      const pk = ttsPhonemeKey(t.phoneme);
      try {
        // Sweeper only prefetches the user's CURRENT gender. The other
        // gender will be lazy-fetched on first tap if the user switches.
        // Halves bandwidth on a cross-device first-launch sweep.
        await prefetchTtsAwaitable(t.text, t.lang, t.phoneme, [gender]);
        promoteToPersistent(t.text, t.lang, pk);
        // prefetchTtsAwaitable swallows per-gender errors silently
        // (designed for fire-and-forget callers), so verify post-hoc by
        // checking whether the mp3 actually landed on disk.
        if (findLocalTtsUri(t.text, t.lang, gender, pk)) {
          ok++;
        } else {
          fail++;
          if (fail <= 3) console.log(`${TAG} silent fail: "${t.text.slice(0, 40)}" lang=${t.lang}`);
        }
      } catch (err) {
        fail++;
        if (fail <= 3) console.log(`${TAG} task error (${t.text.slice(0, 30)}): ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  clearInterval(progressReporter);
  console.log(`${TAG} final: ok=${ok} fail=${fail} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}
