/**
 * User words content sync — bulk RPC variant.
 *
 * Calls the server-side `sync-user-words` edge function once. The
 * function:
 *   • Reads all of the user's user_words.
 *   • Bulk-fetches matching word_entries + word_translations at the
 *     current PROMPT_VERSION_V2.
 *   • Stitches the canonical view and patches user_words.result_json
 *     for rows where the server has fresher data.
 *
 * After the RPC returns, the existing syncAll → pullWords mechanism
 * brings the patched server rows down to local on the next sync
 * cycle (we call scheduleSync() to kick it).
 *
 * This replaces the earlier per-word lookupV2 loop which took 5-15
 * minutes for ~300 words. The bulk RPC finishes in a few seconds
 * because all DB reads are batched server-side.
 *
 * Throttled to once per 24h (foreground triggers also flow through
 * the throttle). force:true bypasses the throttle for explicit
 * developer/admin re-runs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@src/api/supabase';
import { scheduleSync } from '@src/services/syncService';

const TAG = '[userWordsSync]';
const THROTTLE_KEY = 'typeword.userWordsSync.lastRunAt.v8';
const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h

let running = false;

interface RpcResponse {
  total: number;
  stale: number;
  refreshed: number;
  failed: number;
  failedSample?: string[];
  durationMs: number;
}

// WiFi-only gate. Heavy sync can pull a few hundred KB of stitched
// result_json on first run; restricting to wifi avoids surprising users
// on metered cellular plans. Returns true (allow) if netinfo isn't
// available so we never silently lock out the sync.
async function isOnWifi(): Promise<boolean> {
  try {
    const NI = require('@react-native-community/netinfo').default;
    const state = await NI.fetch();
    return state.isConnected === true && state.type === 'wifi';
  } catch {
    return true;
  }
}

export async function syncUserWordsContent(options: { force?: boolean } = {}): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!options.force) {
      // Skip without setting the throttle key when off-wifi, so the next
      // launch (or AppState 'active') retries as soon as wifi is back.
      if (!(await isOnWifi())) {
        console.log(`${TAG} skipped (not on wifi)`);
        return;
      }
      const last = await AsyncStorage.getItem(THROTTLE_KEY);
      const lastMs = last ? parseInt(last, 10) : 0;
      if (Number.isFinite(lastMs) && Date.now() - lastMs < THROTTLE_MS) {
        console.log(`${TAG} skipped (throttled)`);
        return;
      }
    }

    console.log(`${TAG} calling sync-user-words RPC`);
    const { data, error } = await supabase.functions.invoke<RpcResponse>('sync-user-words', {
      body: {},
    });

    if (error) {
      console.log(`${TAG} RPC failed: ${error.message}`);
      return; // don't set throttle — let next launch retry
    }
    if (!data) {
      console.log(`${TAG} RPC returned empty`);
      return;
    }

    console.log(
      `${TAG} done: total=${data.total} stale=${data.stale} refreshed=${data.refreshed} failed=${data.failed} (${data.durationMs}ms)`,
    );
    if (data.failedSample?.length) {
      console.log(`${TAG} failed sample: ${data.failedSample.join('; ')}`);
    }

    // Trigger syncAll's pullWords to bring server-patched user_words down
    // to local. Only fires when the RPC actually refreshed something.
    if (data.refreshed > 0) scheduleSync();

    await AsyncStorage.setItem(THROTTLE_KEY, String(Date.now()));
  } catch (err) {
    console.log(`${TAG} failed: ${(err as Error).message}`);
  } finally {
    running = false;
  }
}
