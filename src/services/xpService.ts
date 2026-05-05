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

const TOTAL_KEY = 'typeword.xpTotal';

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
}

export function getTotalXP(): number {
  return _total;
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
  return Math.round(BASE_XP * m * s * c);
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

/** XP needed to hit `level`. Curve: 100 × level^1.3.
 *  Lv 1 → 100, Lv 5 → ~700, Lv 10 → ~2000, Lv 20 → ~5000, Lv 50 → ~15000. */
function xpForLevel(level: number): number {
  return Math.round(100 * level ** 1.3);
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
