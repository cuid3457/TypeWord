/**
 * Home tab (my wordlists) prefetch cache. Same pattern as dashboardCache —
 * `_layout.tsx` calls refreshHome() once the session is ready, the home
 * tab seeds its useState from the cache so the first focus renders
 * without a loading flash. Streak comes along for the ride since the
 * home header shows it too.
 */
import { listBooks, type BookSortMode, type BookWithCount } from '@src/db/queries';
import { getStreak, type StreakInfo } from './streakService';

export interface HomeSnapshot {
  books: BookWithCount[];
  streak: StreakInfo | null;
  sort: BookSortMode;
  reversed: boolean;
}

let cache: HomeSnapshot | null = null;
const listeners = new Set<(snap: HomeSnapshot) => void>();
let inFlight: Promise<void> | null = null;

export function getCachedHome(): HomeSnapshot | null {
  return cache;
}

export function subscribeHome(fn: (snap: HomeSnapshot) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function refreshHome(
  sort: BookSortMode = cache?.sort ?? 'recent',
  reversed: boolean = cache?.reversed ?? false,
): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [books, streak] = await Promise.all([
        listBooks(sort, reversed),
        getStreak().catch(() => null),
      ]);
      cache = { books, streak, sort, reversed };
      for (const fn of listeners) fn(cache);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
