/**
 * In-memory cache for the Dashboard tab's bundle of user data.
 *
 * Why: Without prefetch, the first time the user navigates to the
 * dashboard tab in a session triggers a 3-call fetch (profile + streak
 * + 2 years of studied dates) plus an optional friends list. That
 * 100-300 ms gap shows as a loading spinner — visible flicker that's
 * absent on every other tab.
 *
 * Strategy: kick off the fetch from `_layout.tsx` right after the
 * session is ready, store the result here. The dashboard component
 * seeds its useState from `getCachedDashboard()` synchronously and
 * subscribes for updates. By the time the user taps the tab, the
 * cache is populated and the page renders instantly.
 *
 * Subsequent focuses still call `refreshDashboard()` from useFocusEffect
 * so the data stays current — listeners receive the new snapshot via
 * the subscription channel.
 */
import { getMyProfile, listFriends, type FriendRow, type MyProfile } from './friendsService';
import { getFrozenDates, getStreak, getStudiedDates, type StreakInfo } from './streakService';

export interface DashboardSnapshot {
  profile: MyProfile | null;
  streak: StreakInfo | null;
  studiedDates: Set<string>;
  frozenDates: Set<string>;
  friends: FriendRow[];
}

let cache: DashboardSnapshot | null = null;
const listeners = new Set<(snap: DashboardSnapshot) => void>();
let inFlight: Promise<void> | null = null;

export function getCachedDashboard(): DashboardSnapshot | null {
  return cache;
}

export function subscribeDashboard(fn: (snap: DashboardSnapshot) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Fetch (or refetch) the dashboard bundle. Coalesces concurrent callers
 * so a tab focus mid-prefetch doesn't issue a duplicate fetch.
 */
export async function refreshDashboard(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [p, s, days, frozen] = await Promise.all([
        getMyProfile(),
        getStreak().catch(() => null),
        getStudiedDates(730).catch(() => new Set<string>()),
        getFrozenDates(730).catch(() => new Set<string>()),
      ]);
      const friends = p && !p.isAnonymous
        ? await listFriends().catch(() => [])
        : [];
      cache = { profile: p, streak: s, studiedDates: days, frozenDates: frozen, friends };
      for (const fn of listeners) fn(cache);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
