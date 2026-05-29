/**
 * Curated wordlists — pre-built test prep / topic packs that users can add
 * to their personal library. Read-only from the client; populated by a
 * server-side curation script.
 *
 * Add flow:
 *   1. Fetch curated_wordlists by source_lang
 *   2. User picks one + chooses target_lang
 *   3. Server returns curated_words with results_by_target_lang[target_lang]
 *   4. Client creates a new local book + saveWord() for each word
 *   5. Words missing results for the target_lang fall back to live lookupWord
 */
import { supabase } from '@src/api/supabase';
import { genId, lookupWord } from './wordService';
import { insertBook, saveWord } from '@src/db/queries';
import { getTtsText, phonemeForChinese } from '@src/utils/ttsLocale';
import { prefetchTtsAwaitable } from './ttsService';
import { promoteToPersistent } from './ttsCache';
import { realignExamplesByTranslation } from '@src/utils/realignExamples';
import type { WordLookupResult } from '@src/types/word';

// Category is open-ended on purpose: new buckets (foundation, academic,
// domain, …) can be added by the curation script without a client release.
// Known values are listed in CURATED_CATEGORIES for ordering / i18n; unknown
// categories surface via a fallback label.
export type CuratedCategory = 'exam' | 'foundation' | 'academic' | 'domain' | 'topic' | (string & {});

export const CURATED_CATEGORIES: readonly CuratedCategory[] = [
  'exam',
  'foundation',
  'academic',
  'domain',
  'topic',
] as const;

export interface CuratedWordlistMeta {
  id: string;
  slug: string;
  nameI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  sourceLang: string;
  examType: string | null;
  level: string | null;
  category: CuratedCategory;
  wordCount: number;
  displayOrder: number;
  /** Server-side content version. Bumped on any curated_words change in this
   * list. Used by launch-time sync to decide whether to pull a diff. */
  contentVersion: number;
}

export interface CuratedWord {
  word: string;
  /** Polysemy disambiguator. '' for normal entries; e.g. 'chang' / 'zhang' for
   * the two readings of 长. Two entries with the same `word` but different
   * `readingKey` represent distinct senses with separate meanings/TTS. */
  readingKey: string;
  displayOrder: number;
  resultsByTargetLang: Record<string, WordLookupResult>;
}

interface CuratedWordlistRow {
  id: string;
  slug: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  source_lang: string;
  exam_type: string | null;
  level: string | null;
  category: CuratedCategory;
  word_count: number;
  display_order: number;
  content_version: number;
}

interface CuratedWordRow {
  word: string;
  reading_key: string;
  display_order: number;
  results_by_target_lang: Record<string, WordLookupResult>;
  updated_at?: string;
}

function rowToMeta(row: CuratedWordlistRow): CuratedWordlistMeta {
  return {
    id: row.id,
    slug: row.slug,
    nameI18n: row.name_i18n,
    descriptionI18n: row.description_i18n,
    sourceLang: row.source_lang,
    examType: row.exam_type,
    level: row.level,
    category: row.category,
    wordCount: row.word_count,
    displayOrder: row.display_order,
    contentVersion: row.content_version ?? 1,
  };
}

/** All curated lists, optionally filtered by source language. */
export async function listCuratedWordlists(sourceLang?: string): Promise<CuratedWordlistMeta[]> {
  let q = supabase
    .from('curated_wordlists')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (sourceLang) q = q.eq('source_lang', sourceLang);
  const { data, error } = await q;
  if (error) {
    console.warn('listCuratedWordlists error:', error);
    return [];
  }
  return (data ?? []).map((r) => rowToMeta(r as CuratedWordlistRow));
}

export async function getCuratedWordlist(id: string): Promise<{
  meta: CuratedWordlistMeta;
  words: CuratedWord[];
  /** Newest curated_words.updated_at (ms since epoch) — used to seed the
   * incremental sync watermark when importing this list. 0 if no rows. */
  newestUpdatedAt: number;
} | null> {
  const { data: metaData, error: metaErr } = await supabase
    .from('curated_wordlists')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();
  if (metaErr || !metaData) return null;

  const { data: wordRows, error: wordsErr } = await supabase
    .from('curated_words')
    .select('word, reading_key, display_order, results_by_target_lang, updated_at')
    .eq('curated_wordlist_id', id)
    .order('display_order', { ascending: true });
  if (wordsErr) return null;

  let newestUpdatedAt = 0;
  const words: CuratedWord[] = (wordRows ?? []).map((r) => {
    const row = r as CuratedWordRow;
    if (row.updated_at) {
      const ms = new Date(row.updated_at).getTime();
      if (ms > newestUpdatedAt) newestUpdatedAt = ms;
    }
    return {
      word: row.word,
      readingKey: row.reading_key ?? '',
      displayOrder: row.display_order,
      resultsByTargetLang: row.results_by_target_lang ?? {},
    };
  });

  return {
    meta: rowToMeta(metaData as CuratedWordlistRow),
    words,
    newestUpdatedAt,
  };
}

/**
 * Localize a wordlist name/description to the user's current i18n locale,
 * falling back to English then any available value.
 */
export function localize(map: Record<string, string>, locale: string): string {
  if (map[locale]) return map[locale];
  const short = locale.split('-')[0];
  if (map[short]) return map[short];
  if (map.en) return map.en;
  const keys = Object.keys(map);
  return keys.length > 0 ? map[keys[0]] : '';
}

interface AddProgress {
  total: number;
  current: number;
  word: string;
}

/**
 * Copy a curated wordlist into the user's personal library.
 * Uses pre-generated results when available; falls back to live lookupWord
 * for words missing the user's target_lang in `results_by_target_lang`.
 */
export async function addCuratedWordlistToUser(
  curatedId: string,
  targetLang: string,
  locale: string,
  onProgress?: (p: AddProgress) => void,
): Promise<{ bookId: string; addedCount: number }> {
  const data = await getCuratedWordlist(curatedId);
  if (!data) throw new Error('Curated wordlist not found');

  const { meta, words, newestUpdatedAt } = data;

  const bookId = genId();
  await insertBook({
    id: bookId,
    title: localize(meta.nameI18n, locale),
    sourceLang: meta.sourceLang,
    targetLang,
    bidirectional: true,
    studyLang: meta.sourceLang,
    curatedWordlistId: meta.id,
    contentVersion: meta.contentVersion,
    // Server-time watermark; falls back to local now() only if the server
    // schema predates the updated_at column (defensive — shouldn't happen
    // after the curated_sync migration ships).
    lastSyncedAt: newestUpdatedAt || Date.now(),
  });

  let added = 0;
  const prefetchQueue: PrefetchTask[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    onProgress?.({ total: words.length, current: i + 1, word: w.word });

    let result: WordLookupResult | null = w.resultsByTargetLang[targetLang] ?? null;
    if (!result) {
      try {
        const live = await lookupWord(
          { word: w.word, sourceLang: meta.sourceLang, targetLang, bookId, mode: 'enrich' },
          { persist: false },
        );
        result = live.result;
      } catch {
        // Skip on lookup failure — user can re-add or look up later.
        continue;
      }
    }

    if (!result) continue;

    // Curated content was generated by word-lookup-v2 and stored raw in
    // curated_words.results_by_target_lang. v2 did per-meaning anchoring
    // but had no realignment safety net — the LLM occasionally emitted a
    // sentence demonstrating a different sense than the slot it was
    // pinned to, and that meaningIndex got baked into the curated data.
    // The review screen then shows example-of-sense-A while marking
    // sense-B as the correct answer. Re-route by translated-token overlap
    // before saving so the stored data matches what each example actually
    // shows. Live lookups already go through v4 server-side realignment,
    // so this path only matters for the pre-generated curated branch.
    if (result.examples && result.meanings.length >= 2) {
      const realigned = realignExamplesByTranslation(
        result.meanings,
        result.examples,
        targetLang,
      );
      result = { ...result, examples: realigned };
    }

    try {
      await saveWord({
        id: genId(),
        bookId,
        word: w.word,
        readingKey: w.readingKey,
        result,
        sourceSentence: null,
        source: 'curated',
      });
      added++;

      // Queue headword + example sentences for background prefetch so every
      // speaker icon is instant on first tap and the wordlist works offline
      // right after add.
      const ph = w.readingKey
        ? phonemeForChinese(meta.sourceLang, result.reading, w.word) ?? undefined
        : undefined;
      prefetchQueue.push({
        text: getTtsText(w.word, meta.sourceLang, result.reading),
        lang: meta.sourceLang,
        phoneme: ph,
      });
      for (const ex of result.examples ?? []) {
        const plain = (ex.sentence ?? '').replace(/\*\*/g, '').trim();
        if (plain) prefetchQueue.push({ text: plain, lang: meta.sourceLang, phoneme: undefined });
      }
    } catch {
      // Duplicate or DB error — continue.
    }
  }

  // Drain the prefetch queue with bounded concurrency. Concurrency=2
  // keeps the burst rate (~120 calls/min) below the tts-synthesize per-
  // minute cap so the queue isn't silently 429-rate-limited — earlier
  // 4-in-flight blew through the 30/min cap and left most examples
  // uncached and silent on first tap.
  void runPrefetchQueue(prefetchQueue, 2);

  return { bookId, addedCount: added };
}

interface PrefetchTask {
  text: string;
  lang: string;
  phoneme: { ph: string; alphabet?: string } | undefined;
}

async function runPrefetchQueue(tasks: PrefetchTask[], concurrency: number): Promise<void> {
  let i = 0;
  const workers: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    while (i < tasks.length) {
      const task = tasks[i++];
      // Await actual download completion so the concurrency cap really
      // bounds in-flight network ops. Earlier we used the fire-and-forget
      // prefetchSpeak which made the cap meaningless — all ~600 downloads
      // started in parallel and starved each other.
      await prefetchTtsAwaitable(task.text, task.lang, task.phoneme);
      // Move from cache/ to document/ so OS storage-pressure eviction
      // doesn't silently delete the mp3s of a saved wordlist (causing
      // a 2-second cloud refetch on every speaker tap hours later).
      promoteToPersistent(task.text, task.lang);
    }
  };
  for (let w = 0; w < concurrency; w++) workers.push(next());
  await Promise.all(workers);
}
