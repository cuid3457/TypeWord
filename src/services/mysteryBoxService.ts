/**
 * Mystery Box (gacha) service.
 *
 * Cosmetic-only random draw: profile characters + background skins. All
 * RNG and pricing live server-side (open_mystery_box / buy_mystery_box_item
 * / equip_cosmetic RPCs). This module mirrors the resulting collection +
 * pity state locally for instant UI updates.
 */
import { supabase } from '@src/api/supabase';

import { refreshInventory } from './pointsService';

export type MysteryBoxKind = 'character' | 'background';
export type MysteryBoxRarity = 'common' | 'rare' | 'epic';

export interface MysteryBoxItem {
  id: string;
  kind: MysteryBoxKind;
  rarity: MysteryBoxRarity;
  directPrice: number;
  active: boolean;
  payload: Record<string, unknown>;
}

export interface MysteryBoxState {
  pityCount: number;
  equippedCharacterId: string | null;
  equippedBackgroundId: string | null;
  ownedItemIds: Set<string>;
}

export interface CapsuleResult {
  itemId: string;
  rarity: MysteryBoxRarity;
  wasDuplicate: boolean;
  pityTriggered: boolean;
  refund: number;
  pointsAfter: number;
  pityCountAfter: number;
}

export const CAPSULE_COST = 50;
export const DUPLICATE_REFUND = 25;
export const PITY_THRESHOLD = 50;
export const RARITY_PERCENT: Record<MysteryBoxRarity, number> = {
  common: 70,
  rare: 25,
  epic: 5,
};

let _state: MysteryBoxState = {
  pityCount: 0,
  equippedCharacterId: null,
  equippedBackgroundId: null,
  ownedItemIds: new Set(),
};
let _catalog: MysteryBoxItem[] | null = null;

type Listener = (state: MysteryBoxState) => void;
const listeners = new Set<Listener>();
function notify() { for (const l of listeners) l(_state); }

export function getMysteryBoxState(): MysteryBoxState {
  return _state;
}

export function subscribeMysteryBox(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function refreshMysteryBoxState(): Promise<MysteryBoxState> {
  try {
    const { data, error } = await supabase.rpc('get_mystery_box_state');
    if (error || !data) return _state;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return _state;
    _state = {
      pityCount: typeof row.pity_count === 'number' ? row.pity_count : 0,
      equippedCharacterId: row.equipped_character_id ?? null,
      equippedBackgroundId: row.equipped_background_id ?? null,
      ownedItemIds: new Set(Array.isArray(row.owned_item_ids) ? row.owned_item_ids : []),
    };
    notify();
  } catch { /* offline */ }
  return _state;
}

export async function fetchCatalog(force = false): Promise<MysteryBoxItem[]> {
  if (_catalog && !force) return _catalog;
  const { data, error } = await supabase
    .from('mystery_box_items')
    .select('id,kind,rarity,direct_price,active,payload')
    .eq('active', true);
  if (error || !data) return _catalog ?? [];
  _catalog = data.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    rarity: r.rarity,
    directPrice: r.direct_price,
    active: r.active,
    payload: r.payload ?? {},
  }));
  return _catalog;
}

export class MysteryBoxError extends Error {
  code:
    | 'insufficient_points'
    | 'unknown_item'
    | 'unauthorized'
    | 'anonymous_disallowed'
    | 'not_owned'
    | 'catalog_empty'
    | 'unknown';
  constructor(code: MysteryBoxError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function mapError(err: { code?: string; message?: string } | null): MysteryBoxError {
  const c = err?.code;
  const code: MysteryBoxError['code'] =
    c === 'P0002' ? 'insufficient_points'
    : c === 'P0001' ? 'unknown_item'
    : c === 'P0003' ? 'anonymous_disallowed'
    : c === 'P0004' ? 'catalog_empty'
    : c === 'P0005' ? 'not_owned'
    : c === '28000' ? 'unauthorized'
    : 'unknown';
  return new MysteryBoxError(code, err?.message ?? 'mystery_box_error');
}

/** Pull a capsule. Server picks the item; client gets the result. */
export async function openCapsule(): Promise<CapsuleResult> {
  const { data, error } = await supabase.rpc('open_mystery_box');
  if (error) throw mapError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new MysteryBoxError('unknown', 'no_result');

  const result: CapsuleResult = {
    itemId: row.result_item_id,
    rarity: row.result_rarity,
    wasDuplicate: !!row.was_duplicate,
    pityTriggered: !!row.pity_triggered,
    refund: row.refund ?? 0,
    pointsAfter: row.points_after ?? 0,
    pityCountAfter: row.pity_count_after ?? 0,
  };

  if (!result.wasDuplicate) {
    _state = {
      ..._state,
      ownedItemIds: new Set([..._state.ownedItemIds, result.itemId]),
      pityCount: result.pityCountAfter,
    };
  } else {
    _state = { ..._state, pityCount: result.pityCountAfter };
  }
  notify();
  // Refresh shared points snapshot so the store balance updates everywhere.
  refreshInventory().catch(() => {});
  return result;
}

/** Buy a specific item at its direct price. */
export async function buyDirect(itemId: string): Promise<{ pointsAfter: number; alreadyOwned: boolean }> {
  const { data, error } = await supabase.rpc('buy_mystery_box_item', { p_item_id: itemId });
  if (error) throw mapError(error);
  const row = Array.isArray(data) ? data[0] : data;
  const result = {
    pointsAfter: row?.points_after ?? 0,
    alreadyOwned: !!row?.already_owned,
  };
  if (!result.alreadyOwned) {
    _state = { ..._state, ownedItemIds: new Set([..._state.ownedItemIds, itemId]) };
    notify();
  }
  refreshInventory().catch(() => {});
  return result;
}

/** Equip an owned item to the matching slot. Pass null to unequip. */
export async function equipCosmetic(kind: MysteryBoxKind, itemId: string | null): Promise<void> {
  const { error } = await supabase.rpc('equip_cosmetic', {
    p_kind: kind,
    p_item_id: itemId,
  });
  if (error) throw mapError(error);
  _state = {
    ..._state,
    equippedCharacterId: kind === 'character' ? itemId : _state.equippedCharacterId,
    equippedBackgroundId: kind === 'background' ? itemId : _state.equippedBackgroundId,
  };
  notify();
}

export function isOwned(itemId: string): boolean {
  return _state.ownedItemIds.has(itemId);
}
