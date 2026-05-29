import { AppState, type AppStateStatus } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@src/api/supabase';

// User traffic moved to word-lookup-v4 at the dict-first cutover
// (2026-05-22). Keep this client-side warmup ping pointed at v4 so the
// 5-min idle ping actually warms the endpoint users hit, not the legacy
// v2 function (which is now only invoked by curation batch scripts).
const PING_URL = `${SUPABASE_URL}/functions/v1/word-lookup-v4`;
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
const PING_INTERVAL_MS = 5 * 60 * 1000; // ping every 5 minutes — matches OpenAI cache TTL

let lastActivityTs = Date.now();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ping() {
  // Smart warm-check: server-side dedup. If any user (globally) has done
  // a real OpenAI lookup within the last 5 minutes, the edge function
  // returns "warm" immediately without spending an OpenAI call. Otherwise
  // it fires a tiny dummy lookup to warm the prompt cache, then returns.
  // This means high-traffic periods cost $0 for warmup; idle periods cost
  // ~$0.005 per fire (max 12/hour = $0.06/hour worst case).
  fetch(PING_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ warm_only: true }),
  }).catch(() => {});
}

/** Call this whenever the user makes a real API request. */
export function markActivity() {
  lastActivityTs = Date.now();
}

function startIdlePing() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    const idle = Date.now() - lastActivityTs;
    if (idle >= IDLE_THRESHOLD_MS) {
      ping();
    }
  }, PING_INTERVAL_MS);
}

function stopIdlePing() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function handleAppState(state: AppStateStatus) {
  if (state === 'active') {
    ping();
    startIdlePing();
  } else {
    stopIdlePing();
  }
}

/** Initialize warmup: call once at app startup. */
export function initEdgeWarmup() {
  ping();
  startIdlePing();
  AppState.addEventListener('change', handleAppState);
}
