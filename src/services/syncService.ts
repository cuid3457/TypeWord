import AsyncStorage from '@react-native-async-storage/async-storage';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean { return UUID_RE.test(s); }

function uuidv4(): string {
  const h = '0123456789abcdef';
  let u = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) u += '-';
    else if (i === 14) u += '4';
    else if (i === 19) u += h[(Math.random() * 4 | 0) + 8];
    else u += h[Math.random() * 16 | 0];
  }
  return u;
}
import { supabase } from '@src/api/supabase';
import { getDb } from '@src/db';
import { flushPendingReports } from '@src/services/reportService';
import { getUserSettings } from '@src/storage/userSettings';
import { captureError } from './sentry';

const LAST_SYNC_KEY = 'typeword.lastSync';
const BATCH_SIZE = 100;
const PULL_PAGE_SIZE = 1000;

type Listener = (syncing: boolean) => void;
const listeners = new Set<Listener>();
let _syncing = false;

function notify() {
  for (const l of listeners) l(_syncing);
}

export function subscribeSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSyncing(): boolean {
  return _syncing;
}

export function scheduleSync() {
  syncAll().catch((e) => captureError(e, { service: 'syncService', fn: 'scheduleSync' }));
}

let _retryAfterSync = false;

// The user id that owns the currently-running sync. Captured once at the
// start of syncAll and checked by getSessionUserId() before every server
// write. If the auth session swaps mid-sync (e.g. OAuth-popup account
// switch, where the SIGNED_OUT event never fires), getSessionUserId throws
// and the in-flight sync aborts instead of stamping user A's local rows
// with user B's user_id and uploading them to B's account.
let _syncOwnerId: string | null = null;

export async function syncAll(): Promise<void> {
  if (_syncing) {
    _retryAfterSync = true;
    return;
  }

  await flushPendingReports().catch((e) => captureError(e, { service: 'syncService', fn: 'flushPendingReports' }));

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user || session.session.user.is_anonymous) return;

  _syncing = true;
  _syncOwnerId = session.session.user.id;
  notify();

  try {
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const since = lastSync || new Date(0).toISOString();
    const syncStartTime = new Date().toISOString();
    await migrateNonUuidIds();
    await pushProfile();
    await pushDeletes();
    await pushBooks(since);
    await pushWords(since);
    await pushStudyDates(since);

    const pendingDeleteIds = await getPendingDeleteIds();
    await pullBooks(since, pendingDeleteIds);
    await pullWords(since, pendingDeleteIds);
    await pullStudyDates(since);
    // pullCacheUpdates removed 2026-05-14 — v1's check_word_updates RPC
    // queried global_word_cache, which v2 doesn't write to. userWordsSync
    // (services/userWordsSyncService.ts) is the v2 equivalent and
    // covers all locally-stored words.

    // Pull curated wordlist content updates (server-side re-curation
    // patches need to reach phones without forcing users to delete and
    // re-add the book). 6h-throttled internally.
    try {
      const { syncCuratedBooks } = await import('./curatedSyncService');
      await syncCuratedBooks();
    } catch (e) {
      captureError(e, { service: 'syncService', fn: 'syncCuratedBooks' });
    }

    await AsyncStorage.setItem(LAST_SYNC_KEY, syncStartTime);
  } finally {
    _syncing = false;
    _syncOwnerId = null;
    notify();
    if (_retryAfterSync) {
      _retryAfterSync = false;
      syncAll().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSessionUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  // Abort if the session is gone or swapped to a different user since the
  // sync started — prevents writing the owner's local rows under another
  // account's id (cross-account data leak on account switch).
  if (!id || (_syncOwnerId !== null && id !== _syncOwnerId)) {
    throw new Error('sync aborted: auth session changed mid-sync');
  }
  return id;
}

async function pushProfile() {
  const { data } = await supabase.auth.getSession();
  const user = data.session!.user;
  const settings = await getUserSettings();
  const { error } = await supabase.from('profiles').upsert({
    user_id: user.id,
    email: user.email ?? null,
    native_language: settings?.nativeLanguage ?? null,
    country_code: settings?.countryCode ?? null,
    timezone: settings?.timezone ?? null,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(`pushProfile: ${error.message} (${error.code})`);
}

async function migrateNonUuidIds() {
  const db = await getDb();
  const books = await db.getAllAsync<{ id: string }>('SELECT id FROM books');
  for (const b of books) {
    if (!isUuid(b.id)) {
      const newId = uuidv4();
      await db.runAsync('UPDATE user_words SET book_id = ? WHERE book_id = ?', [newId, b.id]);
      await db.runAsync('UPDATE books SET id = ? WHERE id = ?', [newId, b.id]);
    }
  }
  const words = await db.getAllAsync<{ id: string }>('SELECT id FROM user_words');
  for (const w of words) {
    if (!isUuid(w.id)) {
      const newId = uuidv4();
      await db.runAsync('UPDATE user_words SET id = ? WHERE id = ?', [newId, w.id]);
    }
  }
}

async function getPendingDeleteIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ record_id: string }>('SELECT record_id FROM pending_deletes');
  return new Set(rows.map(r => r.record_id));
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Push — local → server
// ---------------------------------------------------------------------------

async function pushDeletes() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ record_id: string; table_name: string; deleted_at: number }>(
    'SELECT * FROM pending_deletes',
  );
  if (rows.length === 0) return;

  const bookIds = rows.filter(r => r.table_name === 'books').map(r => r.record_id);
  const wordIds = rows.filter(r => r.table_name === 'user_words').map(r => r.record_id);

  await getSessionUserId(); // abort if session swapped mid-sync

  for (const batch of chunks(wordIds, BATCH_SIZE)) {
    const { error } = await supabase.from('user_words').delete().in('id', batch);
    if (error) throw new Error(`pushDeletes(words): ${error.message} (${error.code})`);
  }
  for (const batch of chunks(bookIds, BATCH_SIZE)) {
    const { error } = await supabase.from('books').delete().in('id', batch);
    if (error) throw new Error(`pushDeletes(books): ${error.message} (${error.code})`);
  }

  await db.runAsync('DELETE FROM pending_deletes');
}

interface LocalBookRow {
  id: string;
  title: string;
  source_lang: string;
  target_lang: string | null;
  bidirectional: number;
  study_lang: string | null;
  sort_order: number;
  pinned: number;
  notif_enabled: number;
  notif_hour: number | null;
  notif_minute: number;
  notif_days: number;
  curated_wordlist_id: string | null;
  created_at: number;
  updated_at: number;
}

async function pushBooks(since: string) {
  const db = await getDb();
  const sinceMs = new Date(since).getTime();
  const rows = await db.getAllAsync<LocalBookRow>(
    'SELECT * FROM books WHERE updated_at > ?',
    [sinceMs],
  );
  if (rows.length === 0) return;

  const userId = await getSessionUserId();

  const records = rows.map(r => ({
    id: r.id,
    user_id: userId,
    title: r.title,
    source_lang: r.source_lang,
    target_lang: r.target_lang,
    bidirectional: r.bidirectional === 1,
    study_lang: r.study_lang,
    sort_order: r.sort_order,
    pinned: r.pinned === 1,
    notif_enabled: r.notif_enabled === 1,
    notif_hour: r.notif_hour,
    notif_minute: r.notif_minute ?? 0,
    notif_days: r.notif_days ?? 127,
    curated_wordlist_id: r.curated_wordlist_id ?? null,
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  }));

  for (const batch of chunks(records, BATCH_SIZE)) {
    const { error } = await supabase.from('books').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`pushBooks: ${error.message} (${error.code})`);
  }
}

interface LocalWordRow {
  id: string;
  book_id: string | null;
  word: string;
  reading_key: string | null;
  result_json: string;
  source_sentence: string | null;
  ease_factor: number;
  interval_days: number;
  next_review: number | null;
  review_count: number;
  created_at: number;
  updated_at: number;
}

function wordRowToRecord(r: LocalWordRow, userId: string) {
  let resultJson: unknown = null;
  try { resultJson = JSON.parse(r.result_json); } catch { /* keep null */ }
  return {
    id: r.id,
    user_id: userId,
    book_id: r.book_id,
    word: r.word,
    reading_key: r.reading_key ?? '',
    result_json: resultJson,
    source_sentence: r.source_sentence,
    ease_factor: r.ease_factor,
    interval_days: r.interval_days,
    next_review: r.next_review ? new Date(r.next_review).toISOString() : null,
    review_count: r.review_count,
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

async function pushWords(since: string) {
  const db = await getDb();
  const sinceMs = new Date(since).getTime();
  const rows = await db.getAllAsync<LocalWordRow>(
    'SELECT * FROM user_words WHERE updated_at > ?',
    [sinceMs],
  );
  if (rows.length === 0) return;

  const userId = await getSessionUserId();
  const records = rows.map(r => wordRowToRecord(r, userId));

  for (const batch of chunks(records, BATCH_SIZE)) {
    const { error } = await supabase.from('user_words').upsert(batch, { onConflict: 'id' });

    if (error?.code === '23505') {
      for (const record of batch) {
        const { error: err } = await supabase.from('user_words').upsert(record, { onConflict: 'id' });
        if (err?.code === '23505') {
          const { id: _id, ...fields } = record;
          let q = supabase.from('user_words').update(fields)
            .eq('user_id', userId)
            .eq('word', record.word)
            .eq('reading_key', record.reading_key);
          q = record.book_id ? q.eq('book_id', record.book_id) : q.is('book_id', null);
          await q;
        } else if (err) {
          throw new Error(`pushWords: ${err.message} (${err.code})`);
        }
      }
    } else if (error) {
      throw new Error(`pushWords: ${error.message} (${error.code})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pull — server → local
// ---------------------------------------------------------------------------

// pullDeletes removed — using hard delete, no soft-delete columns on server

async function pullBooks(since: string, pendingDeleteIds: Set<string>) {
  const db = await getDb();
  let from = 0;

  while (true) {
    await getSessionUserId(); // abort if session swapped mid-sync
    const { data } = await supabase
      .from('books')
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (pendingDeleteIds.has(row.id)) continue;
      const updatedAt = new Date(row.updated_at).getTime();
      const existing = await db.getFirstAsync<{ updated_at: number }>(
        'SELECT updated_at FROM books WHERE id = ?',
        [row.id],
      );
      if (existing && existing.updated_at >= updatedAt) continue;

      await db.runAsync(
        `INSERT INTO books (id, title, source_lang, target_lang, bidirectional, study_lang, sort_order, pinned, notif_enabled, notif_hour, notif_minute, notif_days, curated_wordlist_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           source_lang = excluded.source_lang,
           target_lang = excluded.target_lang,
           bidirectional = excluded.bidirectional,
           study_lang = excluded.study_lang,
           sort_order = excluded.sort_order,
           pinned = excluded.pinned,
           notif_enabled = excluded.notif_enabled,
           notif_hour = excluded.notif_hour,
           notif_minute = excluded.notif_minute,
           notif_days = excluded.notif_days,
           curated_wordlist_id = excluded.curated_wordlist_id,
           updated_at = excluded.updated_at`,
        [
          row.id,
          row.title,
          row.source_lang,
          row.target_lang,
          row.bidirectional ? 1 : 0,
          row.study_lang,
          row.sort_order ?? 0,
          row.pinned ? 1 : 0,
          row.notif_enabled ? 1 : 0,
          row.notif_hour ?? null,
          row.notif_minute ?? 0,
          row.notif_days ?? 127,
          row.curated_wordlist_id ?? null,
          new Date(row.created_at).getTime(),
          updatedAt,
        ],
      );
    }

    if (data.length < PULL_PAGE_SIZE) break;
    from += PULL_PAGE_SIZE;
  }
}

async function pullWords(since: string, pendingDeleteIds: Set<string>) {
  const db = await getDb();
  let from = 0;

  while (true) {
    await getSessionUserId(); // abort if session swapped mid-sync
    const { data } = await supabase
      .from('user_words')
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (pendingDeleteIds.has(row.id)) continue;
      const updatedAt = new Date(row.updated_at).getTime();

      const existingById = await db.getFirstAsync<{ updated_at: number }>(
        'SELECT updated_at FROM user_words WHERE id = ?',
        [row.id],
      );
      if (existingById && existingById.updated_at >= updatedAt) continue;

      const readingKey = (row as { reading_key?: string | null }).reading_key ?? '';
      const existingByWord = await db.getFirstAsync<{ id: string; updated_at: number }>(
        "SELECT id, updated_at FROM user_words WHERE COALESCE(book_id, '') = COALESCE(?, '') AND word = ? AND reading_key = ?",
        [row.book_id, row.word, readingKey],
      );
      if (existingByWord && existingByWord.id !== row.id) {
        if (existingByWord.updated_at >= updatedAt) continue;
        await db.runAsync('DELETE FROM user_words WHERE id = ?', [existingByWord.id]);
      }

      const resultJson = row.result_json ? JSON.stringify(row.result_json) : '{"meanings":[]}';

      await db.runAsync(
        `INSERT INTO user_words (id, book_id, word, reading_key, result_json, source_sentence, ease_factor, interval_days, next_review, review_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           book_id = excluded.book_id,
           word = excluded.word,
           reading_key = excluded.reading_key,
           result_json = excluded.result_json,
           source_sentence = excluded.source_sentence,
           ease_factor = excluded.ease_factor,
           interval_days = excluded.interval_days,
           next_review = excluded.next_review,
           review_count = excluded.review_count,
           updated_at = excluded.updated_at`,
        [
          row.id,
          row.book_id,
          row.word,
          readingKey,
          resultJson,
          row.source_sentence,
          row.ease_factor,
          row.interval_days,
          row.next_review ? new Date(row.next_review).getTime() : null,
          row.review_count,
          new Date(row.created_at).getTime(),
          updatedAt,
        ],
      );
    }

    if (data.length < PULL_PAGE_SIZE) break;
    from += PULL_PAGE_SIZE;
  }
}

// ---------------------------------------------------------------------------
// study_dates — append-only streak/calendar history.
//
// Local SQLite study_dates records "user qualified for streak on day X"
// independently of wordlist deletion. We mirror that to a per-user server
// table so iPad ↔ Galaxy on the same account converge: each device pushes
// its own qualified days and pulls anything new from the other device.
//
// Sync is simple because the data is append-only on both sides — no
// updates, no deletes (the table has no DELETE policy). UPSERT with
// PRIMARY KEY (user_id, date) is idempotent.
// ---------------------------------------------------------------------------

const STUDY_DATES_BACKFILL_KEY = 'typeword.studyDatesBackfilled';

async function pushStudyDates(since: string) {
  const db = await getDb();
  // One-time historical backfill: study_dates sync was added 2026-05-16;
  // for existing installs, the first sync pushes ALL local study_dates
  // (not just rows newer than `since`) so the user's pre-feature streak
  // history reaches the server. After the first successful push we set
  // a flag so subsequent syncs use the normal since-cursor.
  const backfilled = await AsyncStorage.getItem(STUDY_DATES_BACKFILL_KEY);
  const rows = backfilled
    ? await db.getAllAsync<{ date: string; qualified_at: number }>(
        'SELECT date, qualified_at FROM study_dates WHERE qualified_at > ?',
        [new Date(since).getTime()],
      )
    : await db.getAllAsync<{ date: string; qualified_at: number }>(
        'SELECT date, qualified_at FROM study_dates',
      );
  if (rows.length === 0) {
    if (!backfilled) await AsyncStorage.setItem(STUDY_DATES_BACKFILL_KEY, '1');
    return;
  }

  const userId = await getSessionUserId();
  const records = rows.map((r) => ({
    user_id: userId,
    date: r.date,
    qualified_at: new Date(r.qualified_at).toISOString(),
  }));

  for (const batch of chunks(records, BATCH_SIZE)) {
    const { error } = await supabase
      .from('study_dates')
      .upsert(batch, { onConflict: 'user_id,date', ignoreDuplicates: true });
    if (error) throw new Error(`pushStudyDates: ${error.message} (${error.code})`);
  }
  await AsyncStorage.setItem(STUDY_DATES_BACKFILL_KEY, '1');
}

async function pullStudyDates(since: string) {
  const db = await getDb();
  const userId = await getSessionUserId();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('study_dates')
      .select('date, qualified_at')
      .eq('user_id', userId)
      .gt('qualified_at', since)
      .order('qualified_at', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);

    if (error) throw new Error(`pullStudyDates: ${error.message} (${error.code})`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const ts = new Date(row.qualified_at as string).getTime();
      await db.runAsync(
        'INSERT OR IGNORE INTO study_dates (date, qualified_at) VALUES (?, ?)',
        [row.date as string, ts],
      );
    }

    if (data.length < PULL_PAGE_SIZE) break;
    from += PULL_PAGE_SIZE;
  }
}

// Cache update propagation: v1's pullCacheUpdates was removed 2026-05-14.
// userWordsSyncService is the v2 equivalent (compares word_entries.updated_at
// + prompt_version against local cache_synced_at and refreshes the diff).
