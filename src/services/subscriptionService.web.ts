// Web stub for subscriptionService. RevenueCat has no web SDK and the
// product policy for v1 web is: read-only subscription info, no
// purchase on web — users subscribe via the iOS/Android app. The web
// surface always reports 'free' until a future enhancement reads
// entitlement state from a Supabase profile field synced via the
// RevenueCat webhook. Bonus pro from the referral RPC is preserved
// because that lives in profiles.bonus_premium_until on the server.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@src/api/supabase';
import { captureError } from './sentry';

const BONUS_UNTIL_CACHE_KEY = 'typeword.bonus_premium_until';

export type Tier = 'free' | 'premium';

type Listener = (tier: Tier) => void;
const listeners = new Set<Listener>();

let _bonusUntilMs = 0;

function _computeTier(): Tier {
  if (Date.now() <= _bonusUntilMs) return 'premium';
  return 'free';
}

function notify() {
  const t = _computeTier();
  for (const l of listeners) l(t);
}

export function subscribeTier(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTier(): Tier {
  return _computeTier();
}

export function isPaid(): boolean {
  return _computeTier() === 'premium';
}

export function isPro(): boolean {
  return _computeTier() === 'premium';
}

export function isPremium(): boolean {
  return isPaid();
}

export function subscribePremium(listener: (premium: boolean) => void): () => void {
  return subscribeTier((t) => listener(t === 'premium'));
}

export async function refreshBonusPremium(): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user?.id;
    if (!uid) {
      _bonusUntilMs = 0;
      await AsyncStorage.removeItem(BONUS_UNTIL_CACHE_KEY);
      notify();
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('bonus_premium_until')
      .eq('user_id', uid)
      .maybeSingle();
    const raw = (profile as { bonus_premium_until?: string | null } | null)?.bonus_premium_until;
    const ms = raw ? Date.parse(raw) : 0;
    _bonusUntilMs = Number.isFinite(ms) ? ms : 0;
    await AsyncStorage.setItem(BONUS_UNTIL_CACHE_KEY, String(_bonusUntilMs));
    notify();
  } catch (e) {
    captureError(e, { service: 'subscriptionService.web', fn: 'refreshBonusPremium' });
  }
}

export async function initSubscription(): Promise<void> {
  const cachedBonus = await AsyncStorage.getItem(BONUS_UNTIL_CACHE_KEY);
  const cachedMs = cachedBonus ? Number(cachedBonus) : 0;
  _bonusUntilMs = Number.isFinite(cachedMs) ? cachedMs : 0;
  notify();
}

export async function identifyUser(_userId: string): Promise<void> {
  // No-op on web; entitlement state isn't tracked client-side here.
}

export async function resetUser(): Promise<void> {
  notify();
}

export async function purchaseMonthly(): Promise<boolean> {
  return false;
}

export async function purchaseAnnual(): Promise<boolean> {
  return false;
}

export async function restorePurchases(): Promise<boolean> {
  return false;
}

export interface OfferingInfo {
  priceString: string;
  price: number;
  currencyCode: string;
  identifier: string;
}

export async function getOfferings(): Promise<{
  monthly: OfferingInfo | null;
  annual: OfferingInfo | null;
} | null> {
  return null;
}
