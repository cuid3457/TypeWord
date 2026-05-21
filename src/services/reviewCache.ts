/**
 * Review tab picker prefetch cache. Same pattern as dashboardCache.
 * Picker data is local-SQLite-backed (cheap), but cold-start round-trip
 * is still visible as a flash; pre-warming on boot eliminates it.
 */
import {
  getReviewableCount,
  getReviewableCountsByBook,
  getTotalWordCount,
  type BookReviewCount,
  type BookSortMode,
} from '@src/db/queries';
import { getStreak, type StreakInfo } from '@src/services/streakService';

export interface ReviewSnapshot {
  bookCounts: BookReviewCount[];
  totalDue: number;
  hasWords: boolean;
  streak: StreakInfo | null;
  sort: BookSortMode;
  reversed: boolean;
}

let cache: ReviewSnapshot | null = null;
const listeners = new Set<(snap: ReviewSnapshot) => void>();
let inFlight: Promise<void> | null = null;

export function getCachedReview(): ReviewSnapshot | null {
  return cache;
}

export function subscribeReview(fn: (snap: ReviewSnapshot) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function refreshReview(
  sort: BookSortMode = cache?.sort ?? 'recent',
  reversed: boolean = cache?.reversed ?? false,
): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [counts, total, wordCount, streak] = await Promise.all([
        getReviewableCountsByBook(sort, reversed),
        getReviewableCount(),
        getTotalWordCount(),
        getStreak().catch(() => null),
      ]);
      cache = {
        bookCounts: counts,
        totalDue: total,
        hasWords: wordCount > 0,
        streak,
        sort,
        reversed,
      };
      for (const fn of listeners) fn(cache);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
