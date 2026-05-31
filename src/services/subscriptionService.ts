import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@src/api/supabase';
import { captureError } from './sentry';

const TIER_CACHE_KEY = 'typeword.tier';
const PREMIUM_CACHE_KEY = 'typeword.premium'; // legacy — read for migration only
const BONUS_UNTIL_CACHE_KEY = 'typeword.bonus_premium_until';
const SERVER_TIER_CACHE_KEY = 'typeword.serverTier'; // reflects profiles.plan (Web Paddle + cross-channel)

// 2-tier 시스템: free / premium 단일 paid tier.
// Internal canonical: 'premium'. Legacy values ('pro', 'plus') still accepted
// for backward compatibility with cached AsyncStorage + legacy entitlements.
export type Tier = 'free' | 'premium';

type Listener = (tier: Tier) => void;
const listeners = new Set<Listener>();

let _rcTier: Tier = 'free';
let _serverTier: Tier = 'free'; // profiles.plan — captures web Paddle subs that RC doesn't see
let _bonusUntilMs = 0; // epoch ms; treated as premium when now() <= this (referral bonus)
let _subscriptionSource: string | null = null; // profiles.subscription_source — drives manage/cancel routing
let _initialized = false;

function notify() {
  const t = _computeTier();
  for (const l of listeners) l(t);
}

function _computeTier(): Tier {
  if (_rcTier === 'premium') return 'premium';
  // Server profile (reconcile_plan_from_sources ORs RC + Web + Bonus). Mobile
  // reads this so a user who paid via web Paddle sees premium even before any
  // RC event fires.
  if (_serverTier === 'premium') return 'premium';
  if (Date.now() <= _bonusUntilMs) return 'premium';
  return 'free';
}

export function subscribeTier(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTier(): Tier {
  return _computeTier();
}

/** Convenience: any paid tier. */
export function isPaid(): boolean {
  return _computeTier() === 'premium';
}

/** Convenience: alias for isPaid (single paid tier in 2-tier system). */
export function isPremium(): boolean {
  return isPaid();
}

/** Legacy alias retained for callers from pre-rename era. Same as isPaid. */
export function isPro(): boolean {
  return isPaid();
}

/** Backward-compatible subscription wrapper. */
export function subscribePremium(listener: (premium: boolean) => void): () => void {
  return subscribeTier((t) => listener(t === 'premium'));
}

/**
 * Returns the URL that the "Manage / Cancel subscription" buttons should
 * open, routed to the channel the user actually paid through. Mobile-IAP
 * subscribers go to App Store / Play Store; web-Paddle (or other future
 * web providers) go to support email until a customer portal is wired.
 *
 * Falls back to Apple/Google Store URLs when source is unknown — legacy
 * users predating subscription_source still need a sensible default.
 */
export function getSubscriptionManagementUrl(): string {
  switch (_subscriptionSource) {
    case 'web_paddle':
    case 'web_toss':
    case 'web_stripe':
      return 'mailto:support@moavoca.com?subject=Subscription%20Management';
    case 'rc':
    case 'bonus':
    case null:
    default:
      return Platform.select({
        ios: 'https://apps.apple.com/account/subscriptions',
        android: 'https://play.google.com/store/account/subscriptions',
        default: 'https://play.google.com/store/account/subscriptions',
      }) as string;
  }
}

/** Raw subscription source for callers that need to render channel-aware UI. */
export function getSubscriptionSource(): string | null {
  return _subscriptionSource;
}

async function cacheTier(tier: Tier) {
  _rcTier = tier;
  await AsyncStorage.setItem(TIER_CACHE_KEY, tier);
  notify();
}

// 'MoaVoca premium' is the canonical entitlement (post-rebrand 2026-05-28).
// 'TypeWord pro/plus/premium' kept for users who subscribed before the rebrand.
// Must stay in sync with revenuecat-webhook PRO_ENTITLEMENT_IDS and RevenueCat
// dashboard.
const PRO_ENTITLEMENT_IDS = [
  'MoaVoca premium',  // canonical
  'TypeWord pro',     // legacy (2-tier post-rollback 2026-05-25)
  'TypeWord plus',    // legacy
  'TypeWord premium', // legacy
];

function tierFromEntitlements(active: Record<string, unknown>): Tier {
  return PRO_ENTITLEMENT_IDS.some((id) => active[id] !== undefined) ? 'premium' : 'free';
}

/**
 * Sync server-derived entitlement state in one roundtrip:
 *   - profiles.plan       — reconciled OR of (RC, Web Paddle, Bonus). Lets a
 *                           user who paid on the web see premium on mobile
 *                           without waiting for an RC event.
 *   - profiles.bonus_premium_until — referral bonus window. Independent of
 *                           RC and Web; the longer of the three wins via
 *                           _computeTier()'s OR.
 */
export async function refreshBonusPremium(): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user?.id;
    if (!uid) {
      _serverTier = 'free';
      _bonusUntilMs = 0;
      await AsyncStorage.removeItem(SERVER_TIER_CACHE_KEY);
      await AsyncStorage.removeItem(BONUS_UNTIL_CACHE_KEY);
      notify();
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, bonus_premium_until, subscription_source')
      .eq('user_id', uid)
      .maybeSingle();

    const planRaw = (profile as { plan?: string | null } | null)?.plan;
    const serverTier: Tier = planRaw === 'premium' || planRaw === 'pro' || planRaw === 'plus'
      ? 'premium'
      : 'free';
    _serverTier = serverTier;
    await AsyncStorage.setItem(SERVER_TIER_CACHE_KEY, serverTier);
    _subscriptionSource = (profile as { subscription_source?: string | null } | null)?.subscription_source ?? null;

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
  // Legacy 'pro'/'plus' values still map to 'premium' for users upgraded before
  // the 2026-05-28 canonical rename.
  const cachedTier = (await AsyncStorage.getItem(TIER_CACHE_KEY)) as Tier | 'pro' | 'plus' | null;
  if (cachedTier === 'premium' || cachedTier === 'pro' || cachedTier === 'plus') {
    _rcTier = 'premium';
  } else if (cachedTier === 'free') {
    _rcTier = 'free';
  } else {
    const legacy = await AsyncStorage.getItem(PREMIUM_CACHE_KEY);
    _rcTier = legacy === '1' ? 'premium' : 'free';
  }
  const cachedBonus = await AsyncStorage.getItem(BONUS_UNTIL_CACHE_KEY);
  const cachedMs = cachedBonus ? Number(cachedBonus) : 0;
  _bonusUntilMs = Number.isFinite(cachedMs) ? cachedMs : 0;
  const cachedServer = (await AsyncStorage.getItem(SERVER_TIER_CACHE_KEY)) as Tier | null;
  _serverTier = cachedServer === 'premium' ? 'premium' : 'free';

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
      // current user was never identified via logIn. Harmless.
      const err = e as { code?: string | number; message?: string } | null;
      const isAnonErr = String(err?.code) === '22'
        || /anonymous/i.test(err?.message ?? '');
      if (!isAnonErr) throw e;
    }
    await cacheTier('free');
    _serverTier = 'free';
    _bonusUntilMs = 0;
    await AsyncStorage.removeItem(SERVER_TIER_CACHE_KEY);
    await AsyncStorage.removeItem(BONUS_UNTIL_CACHE_KEY);
    notify();
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
    return tier === 'premium';
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
    return tier === 'premium';
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'purchaseAnnual' });
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    const info = await Purchases.restorePurchases();
    const tier = tierFromEntitlements(info.entitlements.active);
    await cacheTier(tier);
    return tier === 'premium';
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
