/**
 * Points + inventory service.
 *
 * Points: consumable currency earned from review sessions + community
 * engagement. Stored server-side (Supabase) as the authoritative balance;
 * a small in-memory cache mirrors it for instant UI updates.
 *
 * Inventory: streak freezes + active XP boost expiry timestamp.
 *
 * Separate from xpService: XP is the leveling/competition metric (never
 * spent), points are the spendable currency.
 */
import { supabase } from '@src/api/supabase';

export interface InventorySnapshot {
  points: number;
  streakFreezes: number;
  xpBoostActiveUntil: string | null; // ISO timestamp or null
}

type Listener = (snap: InventorySnapshot) => void;
const listeners = new Set<Listener>();

let _snap: InventorySnapshot = {
  points: 0,
  streakFreezes: 0,
  xpBoostActiveUntil: null,
};

function notify() {
  for (const l of listeners) l(_snap);
}

export function getInventory(): InventorySnapshot {
  return _snap;
}

export function subscribeInventory(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Boost is active iff the stored timestamp is in the future. */
export function isBoostActive(snap: InventorySnapshot = _snap): boolean {
  if (!snap.xpBoostActiveUntil) return false;
  return Date.parse(snap.xpBoostActiveUntil) > Date.now();
}

/** Remaining boost minutes (rounded up), 0 if inactive. */
export function boostMinutesLeft(snap: InventorySnapshot = _snap): number {
  if (!snap.xpBoostActiveUntil) return 0;
  const ms = Date.parse(snap.xpBoostActiveUntil) - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
}

/** Fetch authoritative inventory from server. Call on app start + after mutations. */
export async function refreshInventory(): Promise<InventorySnapshot> {
  try {
    const { data, error } = await supabase.rpc('get_inventory');
    if (error || !data || (Array.isArray(data) && data.length === 0)) return _snap;
    const row = Array.isArray(data) ? data[0] : data;
    _snap = {
      points: typeof row.points === 'number' ? row.points : 0,
      streakFreezes: typeof row.streak_freezes === 'number' ? row.streak_freezes : 0,
      xpBoostActiveUntil: row.xp_boost_active_until ?? null,
    };
    notify();
  } catch { /* offline — keep stale snap */ }
  return _snap;
}

/**
 * Award points for a completed review session. The amount is computed
 * client-side from session stats (correct count × accuracy multiplier);
 * server caps per-call to 50 as light anti-abuse.
 */
export async function awardSessionPoints(amount: number): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) return _snap.points;
  // Optimistically reflect new balance for instant UI feedback.
  const capped = Math.min(50, Math.round(amount));
  _snap = { ..._snap, points: _snap.points + capped };
  notify();
  try {
    const { data, error } = await supabase.rpc('award_points', { p_amount: capped });
    if (!error && typeof data === 'number') {
      _snap = { ..._snap, points: data };
      notify();
    }
  } catch { /* offline — local optimistic value stays */ }
  return _snap.points;
}

/**
 * Award the streak-milestone bonus (flat 200 pts every 10 days). Server is
 * idempotent on the streak value, so re-calls for the same milestone return
 * the current balance unchanged. Bypasses award_points caps by design.
 */
export async function awardStreakMilestone(streak: number): Promise<number> {
  if (!Number.isFinite(streak) || streak < 10 || streak % 10 !== 0) return _snap.points;
  try {
    const { data, error } = await supabase.rpc('award_streak_milestone', { p_streak: streak });
    if (!error && typeof data === 'number') {
      _snap = { ..._snap, points: data };
      notify();
    }
  } catch { /* offline — server will not be updated; local snap unchanged */ }
  return _snap.points;
}

export class PurchaseError extends Error {
  code: 'insufficient_points' | 'unknown_item' | 'unauthorized' | 'unknown';
  constructor(code: PurchaseError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export type StoreItemId = 'freeze_1' | 'freeze_3' | 'boost_15' | 'boost_60';

/** Atomic purchase via server RPC. Updates local snapshot on success. */
export async function purchaseItem(itemId: StoreItemId): Promise<InventorySnapshot> {
  const { data, error } = await supabase.rpc('purchase_item', { p_item_id: itemId });
  if (error) {
    const code = error.code === 'P0002' ? 'insufficient_points'
      : error.code === 'P0001' ? 'unknown_item'
      : error.code === '28000' ? 'unauthorized'
      : 'unknown';
    throw new PurchaseError(code, error.message ?? 'purchase_failed');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row) {
    _snap = {
      points: row.points_after ?? _snap.points,
      streakFreezes: row.freezes_after ?? _snap.streakFreezes,
      xpBoostActiveUntil: row.boost_until ?? _snap.xpBoostActiveUntil,
    };
    notify();
  }
  return _snap;
}

/**
 * Consume a streak freeze. Called by the streak system when hearts are
 * exhausted on a missed day. Returns true if a freeze was consumed.
 */
export async function consumeStreakFreeze(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('consume_streak_freeze');
    if (error) return false;
    const consumed = !!data;
    if (consumed) {
      _snap = { ..._snap, streakFreezes: Math.max(0, _snap.streakFreezes - 1) };
      notify();
    }
    return consumed;
  } catch {
    return false;
  }
}
