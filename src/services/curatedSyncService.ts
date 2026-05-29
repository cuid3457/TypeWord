/**
 * Curated wordlist content sync.
 *
 * The server-side curation pipeline (curate-wordlist.js) periodically
 * re-curates wordlists — patching IPA, fixing example markers, deduping
 * meanings, etc. Without this service, those edits never reach phones
 * because:
 *   • user_words.result_json is a per-user snapshot of the lookup result
 *     at the time the user added the word.
 *   • The curated_words → user_words materialization happens only at
 *     addCuratedWordlistToUser time.
 *   • syncAll's pullWords only catches per-row updated_at bumps, but
 *     server doesn't bump user_words.updated_at when curated_words changes.
 *
 * This service closes the loop. For each local book that originated from
 * a curated wordlist, it checks the server's content_version. When the
 * server has a newer version it fetches only the rows changed since the
 * book's last_synced_at watermark and patches the matching user_words'
 * result_json in place (preserving SRS state).
 *
 * Triggered from syncAll after pullWords; cheap when nothing changed
 * (one round-trip with N book version pairs).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@src/api/supabase';
import { getDb } from '@src/db';
import { patchUserWordResult } from '@src/db/queries';
import { realignExamplesByTranslation } from '@src/utils/realignExamples';
import type { WordLookupResult } from '@src/types/word';

const TAG = '[curatedSync]';
const THROTTLE_KEY = 'typeword.curatedSync.lastRunAt.v1';
// 5 min — content updates during the launch phase can be frequent. The
// per-call cost is one cheap version-check query plus a diff fetch only
// when versions actually differ, so a shorter throttle is fine.
const THROTTLE_MS = 5 * 60 * 1000;

interface LocalCuratedBookRow {
  id: string;
  curated_wordlist_id: string;
  content_version: number;
  last_synced_at: number;
  target_lang: string | null;
}

export interface CuratedSyncResult {
  booksChecked: number;
  booksUpdated: number;
  wordsPatched: number;
  durationMs: number;
}

let running = false;

/**
 * Pull curated wordlist content updates into local user_words.
 *
 * Idempotent. Returns counts; logs failures but does not throw on
 * per-book errors (one bad list shouldn't abort the rest).
 *
 * @param force  Bypass the 6h throttle (use for manual refresh / dev).
 */
export async function syncCuratedBooks(force = false): Promise<CuratedSyncResult> {
  const startedAt = Date.now();
  const empty: CuratedSyncResult = { booksChecked: 0, booksUpdated: 0, wordsPatched: 0, durationMs: 0 };

  if (running) return empty;

  if (!force) {
    const last = await AsyncStorage.getItem(THROTTLE_KEY);
    if (last) {
      const ageMs = Date.now() - parseInt(last, 10);
      if (ageMs < THROTTLE_MS) return empty;
    }
  }

  running = true;
  try {
    const db = await getDb();
    const books = await db.getAllAsync<LocalCuratedBookRow>(
      `SELECT id, curated_wordlist_id, content_version, last_synced_at, target_lang
       FROM books
       WHERE curated_wordlist_id IS NOT NULL`,
    );

    if (books.length === 0) {
      await AsyncStorage.setItem(THROTTLE_KEY, String(Date.now()));
      return { ...empty, durationMs: Date.now() - startedAt };
    }

    // Single round-trip: fetch server content_version for all referenced lists.
    const listIds = [...new Set(books.map((b) => b.curated_wordlist_id))];
    const { data: serverMeta, error: metaErr } = await supabase
      .from('curated_wordlists')
      .select('id, content_version')
      .in('id', listIds);
    if (metaErr) {
      console.warn(`${TAG} meta fetch failed: ${metaErr.message}`);
      return { ...empty, booksChecked: books.length, durationMs: Date.now() - startedAt };
    }

    const serverVersions = new Map<string, number>();
    for (const m of serverMeta ?? []) {
      serverVersions.set(m.id as string, m.content_version as number);
    }

    let booksUpdated = 0;
    let wordsPatched = 0;

    for (const book of books) {
      const serverVer = serverVersions.get(book.curated_wordlist_id);
      // Server-side list deleted or version <= local → nothing to do.
      if (serverVer === undefined || serverVer <= book.content_version) continue;
      if (!book.target_lang) continue; // book missing target_lang — skip

      const sinceIso = new Date(book.last_synced_at || 0).toISOString();
      const { data: changed, error: cErr } = await supabase
        .from('curated_words')
        .select('word, reading_key, results_by_target_lang, updated_at')
        .eq('curated_wordlist_id', book.curated_wordlist_id)
        .gt('updated_at', sinceIso);
      if (cErr) {
        console.warn(`${TAG} fetch changed failed for ${book.curated_wordlist_id}: ${cErr.message}`);
        continue;
      }

      if (!changed || changed.length === 0) {
        // Version bumped but no rows changed within window — converge.
        await db.runAsync(
          `UPDATE books SET content_version = ? WHERE id = ?`,
          [serverVer, book.id],
        );
        booksUpdated++;
        continue;
      }

      let newestApplied = book.last_synced_at;
      let patchedThisBook = 0;
      for (const w of changed) {
        const map = w.results_by_target_lang as Record<string, WordLookupResult> | null;
        const rawResult = map?.[book.target_lang];
        if (!rawResult || !Array.isArray(rawResult.meanings) || rawResult.meanings.length === 0) continue;
        // Apply the same realignment safety net as addCuratedWordlistToUser
        // — curated data was generated by v2 and never realigned, so any
        // sense-drift baked into examples gets corrected here before the
        // patched result lands in user_words.result_json.
        const result: WordLookupResult =
          rawResult.examples && rawResult.meanings.length >= 2
            ? {
                ...rawResult,
                examples: realignExamplesByTranslation(
                  rawResult.meanings,
                  rawResult.examples,
                  book.target_lang,
                ),
              }
            : rawResult;
        try {
          const ok = await patchUserWordResult({
            bookId: book.id,
            word: w.word as string,
            readingKey: (w.reading_key as string) ?? '',
            result,
          });
          if (ok) patchedThisBook++;
          const ts = new Date(w.updated_at as string).getTime();
          if (ts > newestApplied) newestApplied = ts;
        } catch (e) {
          console.warn(`${TAG} patch ${w.word} failed: ${(e as Error).message}`);
        }
      }

      await db.runAsync(
        `UPDATE books SET content_version = ?, last_synced_at = ? WHERE id = ?`,
        [serverVer, newestApplied, book.id],
      );
      booksUpdated++;
      wordsPatched += patchedThisBook;
    }

    await AsyncStorage.setItem(THROTTLE_KEY, String(Date.now()));
    const durationMs = Date.now() - startedAt;
    console.log(
      `${TAG} done: checked=${books.length} updated=${booksUpdated} patched=${wordsPatched} in ${durationMs}ms`,
    );
    return { booksChecked: books.length, booksUpdated, wordsPatched, durationMs };
  } finally {
    running = false;
  }
}
