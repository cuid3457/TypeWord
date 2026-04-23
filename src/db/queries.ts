import type { Book, UserWord } from '@src/types/book';
import type { WordLookupResult } from '@src/types/word';

import { getDb } from './index';
import { scheduleSync } from '@src/services/syncService';

// ---------- Books ----------

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  source_lang: string;
  target_lang: string | null;
  bidirectional: number;
  study_lang: string | null;
  isbn: string | null;
  cover_url: string | null;
  sort_order: number;
  pinned: number;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}

function rowToBook(row: BookRow): Omit<Book, 'userId'> {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    bidirectional: !!row.bidirectional,
    studyLang: row.study_lang,
    isbn: row.isbn,
    coverUrl: row.cover_url,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export interface BookWithCount extends Omit<Book, 'userId'> {
  wordCount: number;
  pinned: boolean;
}

export type BookSortMode = 'recent' | 'created' | 'words';

export async function listBooks(sort: BookSortMode = 'recent', reversed = false): Promise<BookWithCount[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BookRow & { word_count: number }>(
    `SELECT b.*, COUNT(w.id) AS word_count
     FROM books b
     LEFT JOIN user_words w ON w.book_id = b.id
     GROUP BY b.id`,
  );

  const all = rows.map((row) => ({
    ...rowToBook(row),
    wordCount: row.word_count,
    pinned: !!row.pinned,
  }));

  const dir = reversed ? -1 : 1;
  const sortFn = (a: BookWithCount, b: BookWithCount) => {
    switch (sort) {
      case 'created':
        return dir * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'words':
        return dir * (b.wordCount - a.wordCount) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      default: // 'recent'
        return dir * (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  };

  const pinned = all.filter((b) => b.pinned).sort(sortFn);
  const unpinned = all.filter((b) => !b.pinned).sort(sortFn);

  return [...pinned, ...unpinned];
}

export async function getBook(id: string): Promise<Omit<Book, 'userId'> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>(
    'SELECT * FROM books WHERE id = ?',
    [id],
  );
  return row ? rowToBook(row) : null;
}

export async function insertBook(params: {
  id: string;
  title: string;
  author?: string | null;
  sourceLang: string;
  targetLang?: string | null;
  bidirectional?: boolean;
  studyLang?: string | null;
  isbn?: string | null;
  coverUrl?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO books (id, title, author, source_lang, target_lang, bidirectional, study_lang, isbn, cover_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.title,
      params.author ?? null,
      params.sourceLang,
      params.targetLang ?? null,
      params.bidirectional ? 1 : 0,
      params.studyLang ?? null,
      params.isbn ?? null,
      params.coverUrl ?? null,
      now,
      now,
    ],
  );
  scheduleSync();
}

export async function updateBookTitle(id: string, title: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE books SET title = ?, updated_at = ? WHERE id = ?',
    [title, Date.now(), id],
  );
  scheduleSync();
}

export async function deleteBooks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const placeholders = ids.map(() => '?').join(',');
    const now = Date.now();

    const words = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM user_words WHERE book_id IN (${placeholders})`, ids,
    );
    for (const w of words) {
      await db.runAsync(
        'INSERT INTO pending_deletes (record_id, table_name, deleted_at) VALUES (?, ?, ?)',
        [w.id, 'user_words', now],
      );
    }
    for (const id of ids) {
      await db.runAsync(
        'INSERT INTO pending_deletes (record_id, table_name, deleted_at) VALUES (?, ?, ?)',
        [id, 'books', now],
      );
    }

    await db.runAsync(`DELETE FROM user_words WHERE book_id IN (${placeholders})`, ids);
    await db.runAsync(`DELETE FROM books WHERE id IN (${placeholders})`, ids);
  });
  scheduleSync();
}

export async function toggleBookPinned(id: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ pinned: number }>('SELECT pinned FROM books WHERE id = ?', [id]);
  const newPinned = row?.pinned ? 0 : 1;
  await db.runAsync('UPDATE books SET pinned = ? WHERE id = ?', [newPinned, id]);
  scheduleSync();
  return !!newPinned;
}

// ---------- User words ----------

interface UserWordRow {
  id: string;
  book_id: string | null;
  word: string;
  result_json: string;
  user_note: string | null;
  source_sentence: string | null;
  ease_factor: number;
  interval_days: number;
  next_review: number | null;
  review_count: number;
  learning_step: number;
  cache_synced_at: number;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}

export interface StoredWord extends Omit<UserWord, 'userId'> {
  result: WordLookupResult;
  cacheSyncedAt: number;
}

function rowToWord(row: UserWordRow): StoredWord {
  return {
    id: row.id,
    bookId: row.book_id,
    word: row.word,
    cacheKey: null,
    userNote: row.user_note,
    sourceSentence: row.source_sentence,
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    nextReview: row.next_review ? new Date(row.next_review).toISOString() : null,
    reviewCount: row.review_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    cacheSyncedAt: row.cache_synced_at ?? 0,
    result: (() => { try { return JSON.parse(row.result_json); } catch { return { meanings: [] }; } })() as WordLookupResult,
  };
}

export async function findWord(params: {
  word: string;
  bookId: string | null;
}): Promise<StoredWord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<UserWordRow>(
    `SELECT * FROM user_words
     WHERE word = ? AND COALESCE(book_id, '') = COALESCE(?, '')`,
    [params.word, params.bookId],
  );
  return row ? rowToWord(row) : null;
}

export async function saveWord(params: {
  id: string;
  bookId: string | null;
  word: string;
  result: WordLookupResult;
  sourceSentence?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO user_words (id, book_id, word, result_json, source_sentence, cache_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(COALESCE(book_id, ''), word) DO UPDATE SET
       result_json = excluded.result_json,
       source_sentence = excluded.source_sentence,
       cache_synced_at = excluded.cache_synced_at,
       updated_at = excluded.updated_at`,
    [
      params.id,
      params.bookId,
      params.word,
      JSON.stringify(params.result),
      params.sourceSentence ?? null,
      now,
      now,
      now,
    ],
  );
  // Touch the book's updated_at so "latest" sort reflects recent activity
  if (params.bookId) {
    await db.runAsync(
      'UPDATE books SET updated_at = ? WHERE id = ?',
      [now, params.bookId],
    );
  }
  scheduleSync();
}

export async function deleteWord(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO pending_deletes (record_id, table_name, deleted_at) VALUES (?, ?, ?)',
    [id, 'user_words', Date.now()],
  );
  await db.runAsync('DELETE FROM user_words WHERE id = ?', [id]);
  scheduleSync();
}

export async function deleteWords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const now = Date.now();
    for (const id of ids) {
      await db.runAsync(
        'INSERT INTO pending_deletes (record_id, table_name, deleted_at) VALUES (?, ?, ?)',
        [id, 'user_words', now],
      );
    }
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM user_words WHERE id IN (${placeholders})`, ids);
  });
  scheduleSync();
}

export async function updateWordResult(
  id: string,
  result: WordLookupResult,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    'UPDATE user_words SET result_json = ?, cache_synced_at = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(result), now, now, id],
  );
  scheduleSync();
}

export async function applyCacheUpdate(
  id: string,
  result: WordLookupResult,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE user_words SET result_json = ?, cache_synced_at = ? WHERE id = ?',
    [JSON.stringify(result), Date.now(), id],
  );
}

export async function listWordsByBook(
  bookId: string | null,
): Promise<StoredWord[]> {
  const db = await getDb();
  const rows = bookId
    ? await db.getAllAsync<UserWordRow>(
        'SELECT * FROM user_words WHERE book_id = ? ORDER BY created_at DESC',
        [bookId],
      )
    : await db.getAllAsync<UserWordRow>(
        'SELECT * FROM user_words ORDER BY created_at DESC',
      );
  return rows.map(rowToWord);
}

// ---------- SRS Review ----------

import { isExpression } from '@src/utils/pure';
export { isExpression };

import { DAY_MS, HOUR_MS, calculateNextReview } from '@src/utils/sm2';

const DEFAULT_SESSION_LIMIT = 20;
const CANDIDATE_LIMIT = 200;

export async function getReviewableWords(
  limit = DEFAULT_SESSION_LIMIT,
  bookId?: string | null,
): Promise<StoredWord[]> {
  const db = await getDb();
  const now = Date.now();
  const bookFilter = bookId ? 'AND w.book_id = ?' : '';
  const bookParams = bookId ? [bookId] : [];
  const newWordCap = Math.max(3, Math.floor(limit / 3));

  const dueRows = await db.getAllAsync<UserWordRow>(
    `SELECT w.* FROM user_words w
     INNER JOIN books b ON w.book_id = b.id
     WHERE w.review_count > 0 AND w.next_review <= ? ${bookFilter}
     ORDER BY w.next_review ASC
     LIMIT ?`,
    [now, ...bookParams, CANDIDATE_LIMIT],
  );

  const newRows = await db.getAllAsync<UserWordRow>(
    `SELECT w.* FROM user_words w
     INNER JOIN books b ON w.book_id = b.id
     WHERE w.review_count = 0 AND (w.next_review IS NULL OR w.next_review <= ?) ${bookFilter}
     ORDER BY w.created_at DESC
     LIMIT ?`,
    [now, ...bookParams, CANDIDATE_LIMIT],
  );

  type Scored = { row: UserWordRow; score: number; category: 'failed' | 'due' | 'new' };
  const scoredDue: Scored[] = [];
  const scoredNew: Scored[] = [];

  for (const row of dueRows) {
    if (isExpression(row.word)) continue;
    if (row.interval_days === 0) {
      scoredDue.push({ row, score: Infinity, category: 'failed' });
    } else {
      const overdueMs = now - (row.next_review ?? now);
      const intervalMs = row.interval_days * DAY_MS;
      scoredDue.push({ row, score: overdueMs / intervalMs, category: 'due' });
    }
  }

  for (const row of newRows) {
    if (isExpression(row.word)) continue;
    const ageMs = now - row.created_at;
    let score: number;
    if (ageMs < HOUR_MS) score = 0.9;
    else if (ageMs < DAY_MS) score = 0.7;
    else if (ageMs < 3 * DAY_MS) score = 0.4;
    else score = 0.2;
    scoredNew.push({ row, score, category: 'new' });
  }

  scoredDue.sort((a, b) => b.score - a.score);
  scoredNew.sort((a, b) => b.score - a.score);

  const selectedNew = scoredNew.slice(0, newWordCap);
  const dueSlots = limit - selectedNew.length;
  const selectedDue = scoredDue.slice(0, dueSlots);

  // If due words don't fill remaining slots, allow more new words
  const extraNewSlots = dueSlots - selectedDue.length;
  if (extraNewSlots > 0) {
    const extra = scoredNew.slice(newWordCap, newWordCap + extraNewSlots);
    selectedNew.push(...extra);
  }

  const all = [...selectedDue, ...selectedNew];
  all.sort((a, b) => b.score - a.score);

  const failed = all.filter((s) => s.category === 'failed');
  const rest = all.filter((s) => s.category !== 'failed');
  return [...failed, ...rest].map((s) => rowToWord(s.row));
}

export async function getReviewableCount(bookId?: string | null): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  if (bookId) {
    const rows = await db.getAllAsync<{ word: string }>(
      `SELECT w.word FROM user_words w
       INNER JOIN books b ON w.book_id = b.id
       WHERE w.book_id = ? AND (w.next_review IS NULL OR w.next_review <= ?)`,
      [bookId, now],
    );
    return rows.filter((r) => !isExpression(r.word)).length;
  }
  const rows = await db.getAllAsync<{ word: string }>(
    `SELECT w.word FROM user_words w
     INNER JOIN books b ON w.book_id = b.id
     WHERE w.next_review IS NULL OR w.next_review <= ?`,
    [now],
  );
  return rows.filter((r) => !isExpression(r.word)).length;
}

export async function getRecentBookName(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ title: string }>(
    `SELECT title FROM books ORDER BY updated_at DESC LIMIT 1`,
  );
  return row?.title ?? null;
}

export async function getWeeklyStudyCount(): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(4, 0, 0, 0);
  const startMs = monday.getTime();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM user_words WHERE updated_at >= ? OR created_at >= ?',
    [startMs, startMs],
  );
  return row?.cnt ?? 0;
}

export interface BookReviewCount {
  bookId: string;
  title: string;
  sourceLang: string;
  targetLang: string | null;
  dueCount: number;
  reloadableCount: number;
  updatedAt: number;
  createdAt: number;
}

export async function getReviewableCountsByBook(sort: BookSortMode = 'recent', reversed = false): Promise<BookReviewCount[]> {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAllAsync<{
    book_id: string; title: string; source_lang: string; target_lang: string | null;
    due_count: number; reloadable_count: number; updated_at: number; created_at: number;
  }>(
    `SELECT b.id AS book_id, b.title, b.source_lang, b.target_lang,
       SUM(CASE WHEN (w.next_review IS NULL OR w.next_review <= ?) THEN 1 ELSE 0 END) AS due_count,
       SUM(CASE WHEN (w.next_review IS NOT NULL AND w.next_review > ?) THEN 1 ELSE 0 END) AS reloadable_count,
       b.updated_at, b.created_at
     FROM user_words w
     INNER JOIN books b ON w.book_id = b.id
     WHERE w.word NOT GLOB '[0-9 +\\-*/^!=<>().%]*'
     GROUP BY b.id
     HAVING due_count > 0 OR reloadable_count > 0`,
    [now, now],
  );

  const dir = reversed ? -1 : 1;
  const result = rows.map((r) => ({
    bookId: r.book_id,
    title: r.title,
    sourceLang: r.source_lang,
    targetLang: r.target_lang,
    dueCount: r.due_count,
    reloadableCount: r.reloadable_count,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }));

  result.sort((a, b) => {
    if (sort === 'created') return (b.createdAt - a.createdAt) * dir;
    if (sort === 'words') return (b.dueCount - a.dueCount) * dir;
    return (b.updatedAt - a.updatedAt) * dir;
  });

  return result;
}


export const FREE_BOOK_LIMIT = 5;

export async function getBookCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM books',
  );
  return row?.cnt ?? 0;
}

export async function getTotalWordCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM user_words',
  );
  return row?.cnt ?? 0;
}

export const MAX_RELOAD = 30;
const RELOAD_RECENT_RATIO = 0.6;

export async function resetReviewSchedule(bookId?: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();

  if (!bookId) {
    await db.runAsync(
      'UPDATE user_words SET next_review = ? WHERE next_review > ?',
      [now, now],
    );
    return;
  }

  const recentCount = Math.ceil(MAX_RELOAD * RELOAD_RECENT_RATIO);
  const srsCount = MAX_RELOAD - recentCount;

  const recentRows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM user_words
     WHERE book_id = ? AND next_review > ? AND review_count > 0
     ORDER BY updated_at DESC
     LIMIT ?`,
    [bookId, now, recentCount],
  );

  const recentIds = new Set(recentRows.map((r) => r.id));

  const srsRows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM user_words
     WHERE book_id = ? AND next_review > ?
     ORDER BY next_review ASC
     LIMIT ?`,
    [bookId, now, srsCount + recentIds.size],
  );

  const srsIds = srsRows.filter((r) => !recentIds.has(r.id)).slice(0, srsCount);
  const allIds = [...recentIds, ...srsIds.map((r) => r.id)];

  if (allIds.length === 0) return;

  const placeholders = allIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE user_words SET next_review = ? WHERE id IN (${placeholders})`,
    [now, ...allIds],
  );
}

export async function updateReviewResult(
  id: string,
  quality: 'got_it' | 'uncertain' | 'still_learning',
  mode: string = 'flashcard',
): Promise<{ nextReviewMs: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<UserWordRow>(
    'SELECT * FROM user_words WHERE id = ?',
    [id],
  );
  if (!row) return { nextReviewMs: Date.now() };

  const now = Date.now();
  const result = calculateNextReview(
    {
      easeFactor: row.ease_factor,
      intervalDays: row.interval_days,
      learningStep: row.learning_step,
      updatedAt: row.updated_at,
    },
    quality,
    mode,
    now,
  );

  await db.runAsync(
    `UPDATE user_words
     SET ease_factor = ?, interval_days = ?, next_review = ?, review_count = ?, learning_step = ?, updated_at = ?
     WHERE id = ?`,
    [result.easeFactor, result.intervalDays, result.nextReview, row.review_count + 1, result.learningStep, now, id],
  );
  scheduleSync();
  return { nextReviewMs: result.nextReview };
}
