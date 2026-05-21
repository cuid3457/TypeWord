/**
 * Library tab (community wordlists) prefetch cache. Same pattern as
 * dashboardCache. Default sort=likes desc, search='' (the values shown when
 * the tab opens). User-driven sort/search/lang-filter changes call
 * refreshLibrary with new args and update the cache.
 */
import { listCommunityWordlists, type CommunitySortMode, type CommunityWordlistMeta } from './communityWordlistService';

export interface LibrarySnapshot {
  items: CommunityWordlistMeta[];
  sort: CommunitySortMode;
  reversed: boolean;
  search: string;
  sourceLang: string | null;
  targetLang: string | null;
}

let cache: LibrarySnapshot | null = null;
const listeners = new Set<(snap: LibrarySnapshot) => void>();
let inFlight: Promise<void> | null = null;

export function getCachedLibrary(): LibrarySnapshot | null {
  return cache;
}

export function subscribeLibrary(fn: (snap: LibrarySnapshot) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function refreshLibrary(
  sort: CommunitySortMode = cache?.sort ?? 'likes',
  search: string = cache?.search ?? '',
  sourceLang: string | null = cache?.sourceLang ?? null,
  targetLang: string | null = cache?.targetLang ?? null,
  reversed: boolean = cache?.reversed ?? false,
): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const items = await listCommunityWordlists({
        sort,
        reversed,
        search,
        sourceLang: sourceLang ?? undefined,
        targetLang: targetLang ?? undefined,
      }).catch(() => []);
      cache = { items, sort, reversed, search, sourceLang, targetLang };
      for (const fn of listeners) fn(cache);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
