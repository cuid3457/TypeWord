// Web variant of subscriptionService. RevenueCat has no web SDK, so the
// web client reads entitlement from profiles.plan (server source of truth
// kept in sync by revenuecat-webhook and web-subscription-webhook). This
// lets a user who paid on iOS / Android see premium when visiting the web
// app, and lets a future web checkout (Paddle / Toss / Stripe) reflect
// without code changes here — the source column on the server is the only
// thing that varies.
//
// Bonus pro from the referral RPC (profiles.bonus_premium_until) is preserved
// and OR'd locally for a fast offline path; the server reconcile RPC already
// folds it into profiles.plan, but doing it again locally keeps the badge
// snappy when only the bonus expires.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@src/api/supabase';
import { captureError } from './sentry';

const TIER_CACHE_KEY = 'typeword.tier';
const BONUS_UNTIL_CACHE_KEY = 'typeword.bonus_premium_until';

export type Tier = 'free' | 'premium';

type Listener = (tier: Tier) => void;
const listeners = new Set<Listener>();

let _serverTier: Tier = 'free';
let _bonusUntilMs = 0;

function _computeTier(): Tier {
  if (_serverTier === 'premium') return 'premium';
  if (Date.now() <= _bonusUntilMs) return 'premium';
  return 'free';
}

function notify() {
  const t = _computeTier();
  for (const l of listeners) l(t);
}

async function cacheTier(tier: Tier) {
  _serverTier = tier;
  await AsyncStorage.setItem(TIER_CACHE_KEY, tier);
  notify();
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

/**
 * Refresh entitlement from the server. Reads profiles.plan +
 * bonus_premium_until in a single roundtrip. profiles.plan is kept current
 * by the RC and web-subscription webhooks, so this captures both
 * mobile-IAP and web payments uniformly.
 */
export async function refreshBonusPremium(): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user?.id;
    if (!uid) {
      _bonusUntilMs = 0;
      await cacheTier('free');
      await AsyncStorage.removeItem(BONUS_UNTIL_CACHE_KEY);
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, bonus_premium_until')
      .eq('user_id', uid)
      .maybeSingle();
    const planRaw = (profile as { plan?: string | null } | null)?.plan;
    const tier: Tier = planRaw === 'premium' || planRaw === 'pro' || planRaw === 'plus'
      ? 'premium'
      : 'free';

    const raw = (profile as { bonus_premium_until?: string | null } | null)?.bonus_premium_until;
    const ms = raw ? Date.parse(raw) : 0;
    _bonusUntilMs = Number.isFinite(ms) ? ms : 0;
    await AsyncStorage.setItem(BONUS_UNTIL_CACHE_KEY, String(_bonusUntilMs));
    await cacheTier(tier);
  } catch (e) {
    captureError(e, { service: 'subscriptionService.web', fn: 'refreshBonusPremium' });
  }
}

export async function initSubscription(): Promise<void> {
  // Warm from cache so the badge survives reload without a network blip.
  const cachedTier = (await AsyncStorage.getItem(TIER_CACHE_KEY)) as Tier | 'pro' | 'plus' | null;
  if (cachedTier === 'premium' || cachedTier === 'pro' || cachedTier === 'plus') {
    _serverTier = 'premium';
  } else {
    _serverTier = 'free';
  }
  const cachedBonus = await AsyncStorage.getItem(BONUS_UNTIL_CACHE_KEY);
  const cachedMs = cachedBonus ? Number(cachedBonus) : 0;
  _bonusUntilMs = Number.isFinite(cachedMs) ? cachedMs : 0;
  notify();
  // Then trust the server.
  await refreshBonusPremium();
}

export async function identifyUser(_userId: string): Promise<void> {
  await refreshBonusPremium();
}

export async function resetUser(): Promise<void> {
  _serverTier = 'free';
  _bonusUntilMs = 0;
  await AsyncStorage.removeItem(TIER_CACHE_KEY);
  await AsyncStorage.removeItem(BONUS_UNTIL_CACHE_KEY);
  notify();
}

/**
 * Web checkout. Gated by EXPO_PUBLIC_WEB_CHECKOUT_PROVIDER:
 *   unset / 'none' → returns false (mobile-store CTA in paywall)
 *   'paddle'       → opens Paddle checkout (TBD: hosted-page URL or JS SDK)
 *   'toss'         → opens Toss checkout (TBD)
 *
 * Until a provider is wired, both purchase paths return false and the
 * paywall falls back to the App Store / Play Store CTAs.
 */
async function startWebCheckout(_plan: 'monthly' | 'annual'): Promise<boolean> {
  const provider = process.env.EXPO_PUBLIC_WEB_CHECKOUT_PROVIDER ?? 'none';
  if (provider === 'none') return false;
  // TODO Phase 2: redirect to provider's hosted checkout, passing
  //   custom_data.user_id = (await supabase.auth.getSession()).data.session?.user.id
  // so the webhook can attribute the resulting subscription event.
  return false;
}

export async function purchaseMonthly(): Promise<boolean> {
  return startWebCheckout('monthly');
}

export async function purchaseAnnual(): Promise<boolean> {
  return startWebCheckout('annual');
}

export async function restorePurchases(): Promise<boolean> {
  await refreshBonusPremium();
  return _serverTier === 'premium';
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
  // Web doesn't read RC offerings (no web SDK); when checkout is wired we
  // either fetch from the provider or hard-code prices via env. Returning
  // null keeps the paywall in mobile-store mode until then.
  return null;
}
