import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureError } from './sentry';

const PREMIUM_CACHE_KEY = 'typeword.premium';

type Listener = (isPremium: boolean) => void;
const listeners = new Set<Listener>();

let _isPremium = false;
let _initialized = false;

function notify() {
  for (const l of listeners) l(_isPremium);
}

export function subscribePremium(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isPremium(): boolean {
  return _isPremium;
}

async function cacheStatus(premium: boolean) {
  _isPremium = premium;
  await AsyncStorage.setItem(PREMIUM_CACHE_KEY, premium ? '1' : '0');
  notify();
}

export async function initSubscription(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  const cached = await AsyncStorage.getItem(PREMIUM_CACHE_KEY);
  _isPremium = cached === '1';

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
    await Purchases.logOut();
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
