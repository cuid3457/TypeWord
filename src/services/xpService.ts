/**
 * XP / Level system. Awards XP on correct answers, scaled by review-mode
 * difficulty and the SRS state of the card. Combo multiplier compounds
 * across consecutive correct answers within a session.
 *
 * Storage: AsyncStorage so it works fully offline. The total is mirrored
 * to the user's profile in a future sync pass; for now the dashboard reads
 * the local value.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchCloudXp, syncXpToCloud } from './friendsService';

const TOTAL_KEY = 'typeword.xpTotal';
const CLOUD_SYNC_DEBOUNCE_MS = 5000;
let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCloudSync(value: number) {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    syncXpToCloud(value).catch(() => {});
  }, CLOUD_SYNC_DEBOUNCE_MS);
}

type Listener = (total: number) => void;
const listeners = new Set<Listener>();

let _total = 0;
let _initialized = false;

function notify() {
  for (const l of listeners) l(_total);
}

export function subscribeXP(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initXP(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  try {
    const raw = await AsyncStorage.getItem(TOTAL_KEY);
    const n = raw ? Number(raw) : 0;
    _total = Number.isFinite(n) && n >= 0 ? n : 0;
    notify();
  } catch {
    _total = 0;
  }
  // Pull cloud XP and reconcile (greater wins). Best-effort — offline launches
  // simply use the local value, and the next online award triggers a sync.
  try {
    const cloud = await fetchCloudXp();
    if (cloud > _total) {
      _total = cloud;
      try { await AsyncStorage.setItem(TOTAL_KEY, String(_total)); } catch {}
      notify();
    } else if (cloud < _total) {
      // Local is ahead (e.g. offline gameplay) — push to cloud.
      scheduleCloudSync(_total);
    }
  } catch { /* offline — skip */ }
}

export function getTotalXP(): number {
  return _total;
}

/**
 * Reset the in-memory XP cache so the next session loads from a clean
 * slate. Called from the SIGNED_OUT handler in app/_layout.tsx — without
 * this, the dashboard kept showing the previous account's level/XP
 * (e.g. Apple sign-in after Google logout still rendered Google's 12 Lv
 * / 7,636 XP because `_total` is a module-level singleton).
 *
 * AsyncStorage is already cleared by clearLocalData(); this resets the
 * cached read and the `_initialized` guard so the next initXP() re-reads
 * from storage (now empty → 0) and fetches the new user's cloud XP.
 */
export function resetXP(): void {
  _total = 0;
  _initialized = false;
  for (const l of listeners) l(0);
}

// ── XP calculation ──────────────────────────────────────────────────

const BASE_XP = 10;

const MODE_XP_WEIGHT: Record<string, number> = {
  flashcard: 1.0,
  choice: 1.0,
  context: 1.2,
  fill_blank: 1.5,
  dictation: 2.0,
};

/** Resolve the multiplier for the card's current SRS state. Failed and
 *  brand-new cards reward more (the moments of greatest learning effort);
 *  mature cards reward less (steady retention, not new ground covered). */
function stageMultiplier(intervalDays: number, reviewCount: number): number {
  if (intervalDays === 0 && reviewCount > 0) return 1.3; // failed → recovery
  if (reviewCount === 0) return 1.5;                     // brand new
  if (intervalDays <= 3) return 1.2;                     // learning
  if (intervalDays <= 30) return 1.0;                    // consolidating
  return 0.8;                                             // mature
}

/** Combo multiplier: 1.0 at combo=0, scales linearly to 1.5x at combo=10+. */
function comboMultiplier(combo: number): number {
  return 1 + Math.min(combo * 0.05, 0.5);
}

export interface XPCalcInput {
  mode: string;
  intervalDays: number;
  reviewCount: number;
  combo: number;
}

export function calculateXP(input: XPCalcInput): number {
  const m = MODE_XP_WEIGHT[input.mode] ?? 1.0;
  const s = stageMultiplier(input.intervalDays, input.reviewCount);
  const c = comboMultiplier(input.combo);
  // XP 2× boost from the store. Read lazily to avoid circular import and
  // so a cold-start without inventory data still awards base XP.
  let boost = 1.0;
  try {
    const { getInventory, isBoostActive } = require('./pointsService');
    if (isBoostActive(getInventory())) boost = 2.0;
  } catch { /* pointsService unavailable — skip boost */ }
  return Math.round(BASE_XP * m * s * c * boost);
}

// ── Persisted total ─────────────────────────────────────────────────

export interface XPGrant {
  awarded: number;
  newTotal: number;
  prevLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export async function awardXP(amount: number): Promise<XPGrant> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      awarded: 0,
      newTotal: _total,
      prevLevel: getLevel(_total).level,
      newLevel: getLevel(_total).level,
      leveledUp: false,
    };
  }
  const prev = _total;
  const prevLevel = getLevel(prev).level;
  _total = prev + Math.round(amount);
  const newLevel = getLevel(_total).level;
  try {
    await AsyncStorage.setItem(TOTAL_KEY, String(_total));
  } catch { /* ignore — value still applied in memory */ }
  scheduleCloudSync(_total);
  notify();
  return {
    awarded: Math.round(amount),
    newTotal: _total,
    prevLevel,
    newLevel,
    leveledUp: newLevel > prevLevel,
  };
}

// ── Level curve ─────────────────────────────────────────────────────

/** XP needed to hit `level`. Curve: 50 × n × (n-1) — Duolingo-style triangular.
 *  Each level gap grows by exactly +100 XP. All thresholds clean multiples of 100.
 *  Lv 2 → 100, Lv 5 → 1,000, Lv 10 → 4,500, Lv 20 → 19,000, Lv 50 → 122,500. */
function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  currentLevelXP: number;   // XP within the current level (0 .. needed-1)
  nextLevelXP: number;      // XP needed to advance from current level
  progress: number;         // 0..1 fraction toward next level
}

export function getLevel(totalXP: number): LevelInfo {
  // Find the highest level whose threshold <= totalXP. Level 1 starts at 0.
  let level = 1;
  let lower = 0;
  // Iterate up; cheap until level ~100. Bound just in case.
  for (let lv = 2; lv <= 1000; lv++) {
    const needed = xpForLevel(lv);
    if (totalXP < needed) {
      const upper = needed;
      return {
        level,
        currentLevelXP: totalXP - lower,
        nextLevelXP: upper - lower,
        progress: (totalXP - lower) / (upper - lower),
      };
    }
    level = lv;
    lower = needed;
  }
  return { level, currentLevelXP: 0, nextLevelXP: 1, progress: 1 };
}
