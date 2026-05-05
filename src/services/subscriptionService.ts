import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@src/api/supabase';
import { captureError } from './sentry';

const PREMIUM_CACHE_KEY = 'typeword.premium';
const BONUS_UNTIL_CACHE_KEY = 'typeword.bonus_premium_until';

type Listener = (isPremium: boolean) => void;
const listeners = new Set<Listener>();

let _rcPremium = false;
let _bonusUntilMs = 0; // epoch ms; treated as premium when now() <= this
let _initialized = false;

function notify() {
  for (const l of listeners) l(_computePremium());
}

function _computePremium(): boolean {
  return _rcPremium || Date.now() <= _bonusUntilMs;
}

export function subscribePremium(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isPremium(): boolean {
  return _computePremium();
}

async function cacheStatus(premium: boolean) {
  _rcPremium = premium;
  await AsyncStorage.setItem(PREMIUM_CACHE_KEY, premium ? '1' : '0');
  notify();
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

  const cached = await AsyncStorage.getItem(PREMIUM_CACHE_KEY);
  _rcPremium = cached === '1';
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
    const active = info.entitlements.active['TypeWord premium'] !== undefined;
    await cacheStatus(active);

    Purchases.addCustomerInfoUpdateListener(
      (updatedInfo: { entitlements: { active: Record<string, unknown> } }) => {
        const nowActive = updatedInfo.entitlements.active['TypeWord premium'] !== undefined;
        cacheStatus(nowActive);
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
    const active = info.entitlements.active['TypeWord premium'] !== undefined;
    await cacheStatus(active);
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
    await cacheStatus(false);
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
    const active = customerInfo.entitlements.active['TypeWord premium'] !== undefined;
    await cacheStatus(active);
    return active;
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
    const active = customerInfo.entitlements.active['TypeWord premium'] !== undefined;
    await cacheStatus(active);
    return active;
  } catch (e) {
    captureError(e, { service: 'subscriptionService', fn: 'purchaseAnnual' });
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const { default: Purchases } = require('react-native-purchases');
    const info = await Purchases.restorePurchases();
    const active = info.entitlements.active['TypeWord premium'] !== undefined;
    await cacheStatus(active);
    return active;
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
