import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@src/api/supabase';
import { getDb } from '@src/db';
import { genId } from '@src/services/wordService';
import { insertBook, saveWord } from '@src/db/queries';
import { prefetchTtsAwaitable } from '@src/services/ttsService';
import { promoteToPersistent } from '@src/services/ttsCache';
import { getTtsText, phonemeForChinese } from '@src/utils/ttsLocale';
import type { WordLookupResult } from '@src/types/word';

interface PrefetchTask {
  text: string;
  lang: string;
  phoneme: { ph: string; alphabet?: string } | undefined;
}

async function runPrefetchQueue(tasks: PrefetchTask[], concurrency: number): Promise<void> {
  let i = 0;
  const next = async (): Promise<void> => {
    while (i < tasks.length) {
      const task = tasks[i++];
      await prefetchTtsAwaitable(task.text, task.lang, task.phoneme);
      // Move from cache/ to document/ so OS storage-pressure eviction
      // doesn't silently delete the mp3s of a saved wordlist (causing
      // a 2-second cloud refetch on every speaker tap hours later).
      promoteToPersistent(task.text, task.lang);
    }
  };
  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) workers.push(next());
  await Promise.all(workers);
}

export interface CommunityWordlistMeta {
  id: string;
  userId: string;
  uploaderName: string | null;
  title: string;
  description: string | null;
  sourceLang: string;
  targetLang: string;
  wordCount: number;
  likesCount: number;
  downloadsCount: number;
  createdAt: string;
}

export interface CommunityWordlistFull extends CommunityWordlistMeta {
  words: { word: string; readingKey?: string; result: WordLookupResult }[];
}

export type CommunitySortMode = 'likes' | 'downloads';

export async function listCommunityWordlists(opts: {
  sort: CommunitySortMode;
  reversed?: boolean;
  search?: string;
  sourceLang?: string;
  targetLang?: string;
  limit?: number;
}): Promise<CommunityWordlistMeta[]> {
  const order = opts.sort === 'likes' ? 'likes_count' : 'downloads_count';
  const ascending = !!opts.reversed;
  let q = supabase
    .from('community_wordlists')
    .select('id, user_id, uploader_name, title, description, source_lang, target_lang, word_count, likes_count, downloads_count, created_at')
    .eq('is_active', true)
    .order(order, { ascending })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.search && opts.search.trim()) {
    q = q.ilike('title', `%${opts.search.trim()}%`);
  }
  if (opts.sourceLang) {
    q = q.eq('source_lang', opts.sourceLang);
  }
  if (opts.targetLang) {
    q = q.eq('target_lang', opts.targetLang);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToMeta);
}

function rowToMeta(r: any): CommunityWordlistMeta {
  return {
    id: r.id,
    userId: r.user_id,
    uploaderName: r.uploader_name,
    title: r.title,
    description: r.description,
    sourceLang: r.source_lang,
    targetLang: r.target_lang,
    wordCount: r.word_count,
    likesCount: r.likes_count,
    downloadsCount: r.downloads_count,
    createdAt: r.created_at,
  };
}

export async function getCommunityWordlist(id: string): Promise<CommunityWordlistFull | null> {
  const { data, error } = await supabase
    .from('community_wordlists')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return { ...rowToMeta(data), words: data.words };
}

/**
 * Sentinel error codes returned by the community-upload edge function.
 * UI catches these and shows a friendly message via Toast/Alert.
 */
export const UPLOAD_ERROR = {
  BLOCKLIST: 'blocklist_match',
  MODERATION: 'moderation_flagged',
  TOO_FEW: 'too_few_words',
  TOO_MANY: 'too_many_words',
  ANONYMOUS: 'anonymous_blocked',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
} as const;

export class CommunityUploadError extends Error {
  code: string;
  field?: string;
  category?: string;
  constructor(code: string, message: string, extras?: { field?: string; category?: string }) {
    super(message);
    this.code = code;
    this.field = extras?.field;
    this.category = extras?.category;
  }
}

/**
 * Upload a wordlist from the user's local library to the community.
 * Routes through the community-upload edge function so the title +
 * description are screened (keyword blocklist + OpenAI Moderation) before
 * the row is persisted publicly.
 */
export async function uploadWordlistToCommunity(opts: {
  bookId: string;
  title: string;
  description?: string;
  uploaderName?: string;
}): Promise<{ id: string }> {
  const db = await getDb();
  const book = await db.getFirstAsync<{ source_lang: string; target_lang: string }>(
    `SELECT source_lang, target_lang FROM books WHERE id = ?`,
    [opts.bookId],
  );
  if (!book) throw new Error('Book not found');
  const rows = await db.getAllAsync<{ word: string; reading_key: string; result_json: string }>(
    `SELECT word, reading_key, result_json FROM user_words WHERE book_id = ? ORDER BY created_at ASC`,
    [opts.bookId],
  );
  if (!rows.length) throw new Error('No words to upload');
  const words = rows.map((r) => ({
    word: r.word,
    readingKey: r.reading_key || '',
    result: safeParse(r.result_json),
  })).filter((w) => w.result);

  const { data: session } = await supabase.auth.getSession();
  const accessToken = session?.session?.access_token;
  if (!accessToken) throw new Error('Sign in required to upload');

  // Direct fetch (instead of supabase.functions.invoke) so we can read the
  // structured error body — invoke wraps non-2xx in FunctionsHttpError with
  // an opaque message, hiding our { code, field, category } payload.
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/community-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      title: opts.title,
      description: opts.description ?? null,
      source_lang: book.source_lang,
      target_lang: book.target_lang ?? book.source_lang,
      uploader_name: opts.uploaderName ?? null,
      words,
    }),
  });

  if (!resp.ok) {
    let body: { code?: string; error?: string; field?: string; category?: string } | null = null;
    try { body = await resp.json(); } catch { /* non-JSON response */ }
    if (body?.code) {
      throw new CommunityUploadError(body.code, body.error ?? 'Upload failed', {
        field: body.field,
        category: body.category,
      });
    }
    throw new Error(body?.error || `Upload failed (${resp.status})`);
  }

  const data = await resp.json();
  if (!data?.id) throw new Error('Upload failed: no id returned');
  return { id: data.id as string };
}

function safeParse(s: string): WordLookupResult | null {
  try { return JSON.parse(s); } catch { return null; }
}

export interface DownloadProgress {
  current: number;
  total: number;
}

/**
 * Add a community wordlist to the user's local library. Increments the
 * server-side downloads counter atomically. The downloaded book is tagged
 * with source='curated' so it doesn't game the streak's add-path.
 *
 * `onProgress` fires after each word is saved so callers can render a
 * "5 / 100" indicator (matches curated wordlist add flow).
 */
export async function downloadCommunityWordlist(
  id: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ bookId: string }> {
  const full = await getCommunityWordlist(id);
  if (!full) throw new Error('Wordlist not found');

  if (!Array.isArray(full.words) || full.words.length === 0) {
    throw new Error('Wordlist has no words');
  }

  const bookId = genId();
  await insertBook({
    id: bookId,
    title: full.title,
    sourceLang: full.sourceLang,
    targetLang: full.targetLang,
    bidirectional: true,
    studyLang: full.sourceLang,
  });

  const total = full.words.length;
  let current = 0;
  onProgress?.({ current, total });
  // Queue headword + example TTS so the speaker icons play instantly the
  // first time the user taps them and the wordlist works offline right
  // after download. Mirrors the curated wordlist add flow.
  const prefetchQueue: PrefetchTask[] = [];
  for (const w of full.words) {
    if (!w || typeof w.word !== 'string' || !w.result) continue;
    await saveWord({
      id: genId(),
      bookId,
      word: w.word,
      readingKey: w.readingKey ?? '',
      result: w.result,
      sourceSentence: null,
      source: 'curated',
    });
    current++;
    onProgress?.({ current, total });

    const phoneme = w.readingKey
      ? phonemeForChinese(full.sourceLang, w.result.reading, w.word) ?? undefined
      : undefined;
    prefetchQueue.push({
      text: getTtsText(w.word, full.sourceLang, w.result.reading),
      lang: full.sourceLang,
      phoneme,
    });
    for (const ex of w.result.examples ?? []) {
      const plain = (ex.sentence ?? '').replace(/\*\*/g, '').trim();
      if (plain) prefetchQueue.push({ text: plain, lang: full.sourceLang, phoneme: undefined });
    }
  }

  await supabase.rpc('community_wordlist_increment_downloads', { p_wordlist_id: id }).then(
    () => {},
    () => { /* counter is best-effort, don't fail download */ },
  );

  // Fire-and-forget: drain TTS queue in the background with bounded
  // concurrency. Concurrency=2 keeps the burst rate (~120 calls/min)
  // below the per-minute cap so the queue isn't silently rate-limited.
  void runPrefetchQueue(prefetchQueue, 2);

  return { bookId };
}

/**
 * Edit an existing community wordlist's title + description. Routes
 * through the same edge function as upload so the new text is moderated.
 * `id` ownership is verified server-side; client-side direct UPDATE is
 * revoked as of migration 20260509000004.
 */
export async function editCommunityWordlist(opts: {
  id: string;
  title: string;
  description?: string;
}): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session?.session?.access_token;
  if (!accessToken) throw new Error('Sign in required');

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/community-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      id: opts.id,
      title: opts.title,
      description: opts.description ?? null,
    }),
  });

  if (!resp.ok) {
    let body: { code?: string; error?: string; field?: string; category?: string } | null = null;
    try { body = await resp.json(); } catch { /* non-JSON */ }
    if (body?.code) {
      throw new CommunityUploadError(body.code, body.error ?? 'Edit failed', {
        field: body.field,
        category: body.category,
      });
    }
    throw new Error(body?.error || `Edit failed (${resp.status})`);
  }
}

/**
 * Delete one of the user's own community wordlists. RLS DELETE policy
 * (auth.uid() = user_id) handles ownership enforcement; no edge function
 * needed since deleting is unambiguous and doesn't need moderation.
 */
export async function deleteCommunityWordlist(id: string): Promise<void> {
  const { error } = await supabase
    .from('community_wordlists')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function listMyUploads(): Promise<CommunityWordlistMeta[]> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('community_wordlists')
    .select('id, user_id, uploader_name, title, description, source_lang, target_lang, word_count, likes_count, downloads_count, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToMeta);
}

/** Toggle like state. Returns the new isLiked. */
export async function toggleCommunityWordlistLike(id: string): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Sign in required');
  const { data: existing } = await supabase
    .from('community_wordlist_likes')
    .select('user_id')
    .eq('user_id', userId)
    .eq('wordlist_id', id)
    .maybeSingle();
  if (existing) {
    await supabase.from('community_wordlist_likes').delete()
      .eq('user_id', userId).eq('wordlist_id', id);
    return false;
  }
  await supabase.from('community_wordlist_likes').insert({ user_id: userId, wordlist_id: id });
  return true;
}

export async function isCommunityWordlistLiked(id: string): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return false;
  const { data } = await supabase
    .from('community_wordlist_likes')
    .select('user_id')
    .eq('user_id', userId)
    .eq('wordlist_id', id)
    .maybeSingle();
  return !!data;
}
