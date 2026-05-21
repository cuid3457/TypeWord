import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@src/api/supabase';
import { captureError } from './sentry';

const TIER_CACHE_KEY = 'typeword.tier';
const PREMIUM_CACHE_KEY = 'typeword.premium'; // legacy — read for migration only
const BONUS_UNTIL_CACHE_KEY = 'typeword.bonus_premium_until';

export type Tier = 'free' | 'plus' | 'pro';

type Listener = (tier: Tier) => void;
const listeners = new Set<Listener>();

let _rcTier: Tier = 'free';
let _bonusUntilMs = 0; // epoch ms; treated as plus when now() <= this (referral bonus)
let _initialized = false;

function notify() {
  const t = _computeTier();
  for (const l of listeners) l(t);
}

function _computeTier(): Tier {
  // Pro entitlement always wins. Bonus referral grants plus, not pro.
  if (_rcTier === 'pro') return 'pro';
  if (_rcTier === 'plus') return 'plus';
  if (Date.now() <= _bonusUntilMs) return 'plus';
  return 'free';
}

export function subscribeTier(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTier(): Tier {
  return _computeTier();
}

/** Convenience: any paid tier (plus or pro). */
export function isPaid(): boolean {
  return _computeTier() !== 'free';
}

/** Convenience: pro tier only. */
export function isPro(): boolean {
  return _computeTier() === 'pro';
}

/** Convenience: plus tier only (NOT pro). */
export function isPlus(): boolean {
  return _computeTier() === 'plus';
}

/**
 * Backward-compatible alias for callers that just need "is the user paying?".
 * Returns true for plus AND pro. New code should prefer getTier() / isPro().
 */
export function isPremium(): boolean {
  return isPaid();
}

/** Backward-compatible subscription wrapper. */
export function subscribePremium(listener: (premium: boolean) => void): () => void {
  return subscribeTier((t) => listener(t !== 'free'));
}

async function cacheTier(tier: Tier) {
  _rcTier = tier;
  await AsyncStorage.setItem(TIER_CACHE_KEY, tier);
  notify();
}

/**
 * Map RevenueCat entitlements to our tier. Pro wins over plus, both win over
 * the legacy "TypeWord premium" entitlement (which existing subscribers have
 * and which now grants plus-equivalent access).
 */
function tierFromEntitlements(active: Record<string, unknown>): Tier {
  if (active['TypeWord pro'] !== undefined) return 'pro';
  if (active['TypeWord plus'] !== undefined) return 'plus';
  if (active['TypeWord premium'] !== undefined) return 'plus'; // legacy → plus
  return 'free';
}

/**
 * Sync the bonus_premium_until window from the user's profile (set by the
 * apply_referral RPC). Independent of RevenueCat — both grant premium and
 * the longer of the two wins.
 */
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
    captureError(e, { service: 'subscriptionService', fn: 'refreshBonusPremium' });
  }
}

export async function initSubscription(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  // Prefer new tier cache; migrate from legacy boolean cache if needed.
  const cachedTier = (await AsyncStorage.getItem(TIER_CACHE_KEY)) as Tier | null;
  if (cachedTier === 'pro' || cachedTier === 'plus' || cachedTier === 'free') {
    _rcTier = cachedTier;
  } else {
    const legacy = await AsyncStorage.getItem(PREMIUM_CACHE_KEY);
    _rcTier = legacy === '1' ? 'plus' : 'free';
  }
  const cachedBonus = await AsyncStorage.getItem(BONUS_UNTIL_CACHE_KEY);
  const cachedMs = cachedBonus ? Number(cachedBonus) : 0;
  _bonusUntilMs = Number.isFinite(cachedMs) ? cachedMs : 0;

  try {
    const { default: Purchases } = require('react-native-purchases');

    const apiKey = Platform.select({
      ios: process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '',
      android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '',
      default: '',
    });

    if (!apiKey) return;

    Purchases.configure({ apiKey });

    const info = await Purchases.getCustomerInfo();
    await cacheTier(tierFromEntitlements(info.entitlements.active));

    Purchases.addCustomerInfoUpdateListener(
      (updatedInfo: { entitlements: { active: Record<string, unknown> } }) => {
        cacheTier(tierFromEntitlements(updatedInfo.entitlements.active));
      },
    );
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'initSubscription' });
  }
}

export async function identifyUser(userId: string): Promise<void> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    await Purchases.logIn(userId);
    const info = await Purchases.getCustomerInfo();
    await cacheTier(tierFromEntitlements(info.entitlements.active));
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'identifyUser' });
  }
}

export async function resetUser(): Promise<void> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    try {
      await Purchases.logOut();
    } catch (e) {
      // RevenueCat throws LOG_OUT_ANONYMOUS_USER_ERROR (code 22) when the
      // current user was never identified via logIn. Harmless — they have no
      // entitlements to clear — but it floods Sentry on every data reset.
      const err = e as { code?: string | number; message?: string } | null;
      const isAnonErr = String(err?.code) === '22'
        || /anonymous/i.test(err?.message ?? '');
      if (!isAnonErr) throw e;
    }
    await cacheTier('free');
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'resetUser' });
  }
}

export async function purchaseMonthly(): Promise<boolean> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    const offerings = await Purchases.getOfferings();
    const monthly = offerings.current?.monthly;
    if (!monthly) return false;

    const { customerInfo } = await Purchases.purchasePackage(monthly);
    const tier = tierFromEntitlements(customerInfo.entitlements.active);
    await cacheTier(tier);
    return tier !== 'free';
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'purchaseMonthly' });
    return false;
  }
}

export async function purchaseAnnual(): Promise<boolean> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    const offerings = await Purchases.getOfferings();
    const annual = offerings.current?.annual;
    if (!annual) return false;

    const { customerInfo } = await Purchases.purchasePackage(annual);
    const tier = tierFromEntitlements(customerInfo.entitlements.active);
    await cacheTier(tier);
    return tier !== 'free';
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'purchaseAnnual' });
    return false;
  }
}

/**
 * Tier-aware purchase. Looks up the named offering ('plus' / 'pro') configured
 * in RevenueCat dashboard, then purchases its monthly or annual package.
 * Convention: each tier has its own RC offering with `monthly` and `annual`
 * package types (e.g., "plus" offering → plus_monthly + plus_annual products).
 * Falls back to `current` offering when no tier-named offering exists — useful
 * during pre-launch before Pro products are configured.
 */
export async function purchaseTier(
  tier: 'plus' | 'pro',
  cycle: 'monthly' | 'annual',
): Promise<boolean> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    const offerings = await Purchases.getOfferings();
    const named = offerings.all?.[tier] ?? offerings.current;
    const pkg = cycle === 'annual' ? named?.annual : named?.monthly;
    if (!pkg) return false;

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const newTier = tierFromEntitlements(customerInfo.entitlements.active);
    await cacheTier(newTier);
    return newTier !== 'free';
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'purchaseTier', tier, cycle });
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    const info = await Purchases.restorePurchases();
    const tier = tierFromEntitlements(info.entitlements.active);
    await cacheTier(tier);
    return tier !== 'free';
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'restorePurchases' });
    return false;
  }
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
  try {
    const { default: Purchases } = require('react-native-purchases');
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;

    return {
      monthly: current.monthly
        ? {
            priceString: current.monthly.product.priceString,
            price: current.monthly.product.price,
            currencyCode: current.monthly.product.currencyCode,
            identifier: current.monthly.identifier,
          }
        : null,
      annual: current.annual
        ? {
            priceString: current.annual.product.priceString,
            price: current.annual.product.price,
            currencyCode: current.annual.product.currencyCode,
            identifier: current.annual.identifier,
          }
        : null,
    };
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'getOfferings' });
    return null;
  }
}

export type TierOfferings = {
  plus: { monthly: OfferingInfo | null; annual: OfferingInfo | null };
  pro: { monthly: OfferingInfo | null; annual: OfferingInfo | null };
};

/**
 * Pull offerings for both Plus and Pro tiers. Looks up named offerings
 * ('plus' / 'pro') in the RC dashboard, falling back to `current` for plus
 * during the pre-launch window where only legacy offerings may be configured.
 */
export async function getTierOfferings(): Promise<TierOfferings | null> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    const offerings = await Purchases.getOfferings();
    if (!offerings) return null;

    const extract = (off: { monthly?: { product: { priceString: string; price: number; currencyCode: string; }; identifier: string; } | null; annual?: { product: { priceString: string; price: number; currencyCode: string; }; identifier: string; } | null; } | null | undefined) => ({
      monthly: off?.monthly
        ? {
            priceString: off.monthly.product.priceString,
            price: off.monthly.product.price,
            currencyCode: off.monthly.product.currencyCode,
            identifier: off.monthly.identifier,
          }
        : null,
      annual: off?.annual
        ? {
            priceString: off.annual.product.priceString,
            price: off.annual.product.price,
            currencyCode: off.annual.product.currencyCode,
            identifier: off.annual.identifier,
          }
        : null,
    });

    const plusOffering = offerings.all?.['plus'] ?? offerings.current;
    const proOffering = offerings.all?.['pro'] ?? null;
    return { plus: extract(plusOffering), pro: extract(proOffering) };
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'getTierOfferings' });
    return null;
  }
}
