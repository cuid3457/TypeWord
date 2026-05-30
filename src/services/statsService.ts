/**
 * Aggregated learning stats sourced from the local SQLite cache.
 *
 * Stats screen consumes these for the SRS mastery distribution and the
 * per-language word breakdown. Heatmap/streak/XP come from
 * dashboardCache + streakService + xpService respectively.
 */

import { getDb } from '@src/db';

export type SrsStage = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface SrsDistribution {
  new: number;
  learning: number;
  reviewing: number;
  mastered: number;
  total: number;
}

/**
 * Classify a single card by SRS stage.
 *
 * Stage boundaries mirror the SM-2 schedule the review loop runs:
 *   - New: never reviewed
 *   - Learning: in-progress, interval <= 3 days (re-encounters within a week)
 *   - Reviewing: stabilizing, interval 4–30 days
 *   - Mastered: long-interval, > 30 days between reviews
 */
export function classifyStage(reviewCount: number, intervalDays: number): SrsStage {
  if (reviewCount <= 0) return 'new';
  if (intervalDays <= 3) return 'learning';
  if (intervalDays <= 30) return 'reviewing';
  return 'mastered';
}

export async function getSrsDistribution(): Promise<SrsDistribution> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ review_count: number; interval_days: number }>(
    'SELECT review_count, interval_days FROM user_words',
  );
  const dist: SrsDistribution = { new: 0, learning: 0, reviewing: 0, mastered: 0, total: 0 };
  for (const r of rows) {
    dist[classifyStage(r.review_count, r.interval_days)] += 1;
    dist.total += 1;
  }
  return dist;
}

export interface LanguageBreakdownRow {
  lang: string;
  wordCount: number;
}

/**
 * Word counts grouped by the *source* language of the containing book.
 * Words in books that have no source_lang (shouldn't happen, defensive)
 * are dropped from the result.
 */
export async function getLanguageBreakdown(): Promise<LanguageBreakdownRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ source_lang: string | null; word_count: number }>(
    `SELECT b.source_lang AS source_lang, COUNT(w.id) AS word_count
     FROM books b
     LEFT JOIN user_words w ON w.book_id = b.id
     GROUP BY b.source_lang`,
  );
  return rows
    .filter((r) => !!r.source_lang && r.word_count > 0)
    .map((r) => ({ lang: r.source_lang as string, wordCount: r.word_count }))
    .sort((a, b) => b.wordCount - a.wordCount);
}

export interface StatsSnapshot {
  srs: SrsDistribution;
  byLanguage: LanguageBreakdownRow[];
}

export async function getStatsSnapshot(): Promise<StatsSnapshot> {
  const [srs, byLanguage] = await Promise.all([
    getSrsDistribution(),
    getLanguageBreakdown(),
  ]);
  return { srs, byLanguage };
}

/**
 * Weekly recap stats — surfaced in the Sunday wrap-up card. Mondays mark the
 * start of the bucket, mirroring `getWeeklyStudyCount`. We measure reviews
 * (updated_at this week + review_count > 0) and adds (created_at this week)
 * separately so the recap can call out both behaviors. "Hardest" words are
 * the lowest-ease cards touched this week — the user's friction list.
 */
export interface WeeklyRecap {
  reviewedCount: number;
  addedCount: number;
  hardestWords: string[];
  streakCurrent: number;
}

export async function getWeeklyRecap(): Promise<WeeklyRecap> {
  const { getDb } = await import('@src/db');
  const { getStreak } = await import('./streakService');
  const db = await getDb();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(4, 0, 0, 0);
  const startMs = monday.getTime();

  const reviewedRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM user_words WHERE updated_at >= ? AND review_count > 0`,
    [startMs],
  );
  const addedRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM user_words WHERE created_at >= ?`,
    [startMs],
  );
  const hardestRows = await db.getAllAsync<{ word: string }>(
    `SELECT word FROM user_words
     WHERE updated_at >= ? AND review_count > 0
     ORDER BY ease_factor ASC, updated_at DESC
     LIMIT 3`,
    [startMs],
  );

  const streak = await getStreak();
  return {
    reviewedCount: reviewedRow?.cnt ?? 0,
    addedCount: addedRow?.cnt ?? 0,
    hardestWords: hardestRows.map((r) => r.word),
    streakCurrent: streak.current,
  };
}
