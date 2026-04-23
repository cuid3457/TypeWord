import { AppState, type AppStateStatus } from 'react-native';
import { SUPABASE_URL } from '@src/api/supabase';

const PING_URL = `${SUPABASE_URL}/functions/v1/word-lookup`;
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
const PING_INTERVAL_MS = 4 * 60 * 1000; // ping every 4 minutes while idle

let lastActivityTs = Date.now();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ping() {
  fetch(PING_URL, { method: 'GET' }).catch(() => {});
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
