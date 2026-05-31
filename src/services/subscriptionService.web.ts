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
import i18n from '@src/i18n';
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
 *   'paddle'       → opens Paddle Checkout overlay
 *   'toss'         → opens Toss checkout (TBD)
 *
 * Returns true once the provider checkout overlay is open. The
 * web-subscription-webhook attributes the resulting subscription via
 * custom_data.user_id and updates profiles.plan on its own; the paywall
 * does not need to await purchase completion here.
 */

const PADDLE_SDK_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js';
let _paddleInitialized = false;

async function loadPaddleSdk(): Promise<unknown | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const win = window as unknown as { Paddle?: unknown };
  if (win.Paddle) return win.Paddle;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = PADDLE_SDK_URL;
    script.async = true;
    script.onload = () => resolve(win.Paddle ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function paddleEnvironment(): 'sandbox' | 'production' {
  const env = (process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT ?? 'sandbox').toLowerCase();
  return env === 'production' ? 'production' : 'sandbox';
}

interface PaddleSdk {
  Environment: { set(env: 'sandbox' | 'production'): void };
  Initialize(opts: { token: string; eventCallback?: (data: unknown) => void }): void;
  Checkout: {
    open(opts: {
      items: { priceId: string; quantity: number }[];
      customer?: { email?: string };
      customData?: Record<string, string>;
      settings?: { displayMode?: 'overlay' | 'inline'; locale?: string; successUrl?: string };
    }): void;
    close(): void;
  };
}

// Auto-close the Checkout overlay after a successful payment so the user
// returns to the paywall without manually clicking ✕. The webhook updates
// the server (profiles.plan) independently; we also kick a local refresh
// so the "Premium active" badge surfaces on the next render. Refresh is
// scheduled with a small delay because the webhook fires async — querying
// profiles.plan immediately can read the old value before the server
// reconcile RPC commits.
function handlePaddleEvent(Paddle: PaddleSdk, data: unknown): void {
  const name = (data as { name?: string } | null)?.name;
  if (name !== 'checkout.completed') return;
  setTimeout(() => {
    try { Paddle.Checkout.close(); } catch { /* noop */ }
  }, 2000);
  // Webhook race buffer — give reconcile_plan_from_sources ~3s to commit
  // before reading profiles.plan locally. Multiple refreshes catch the
  // common case (1-2s) and the slow case (5s+) without a tight poll loop.
  setTimeout(() => { refreshBonusPremium().catch(() => {}); }, 3000);
  setTimeout(() => { refreshBonusPremium().catch(() => {}); }, 8000);
}

// Map our 8 UI languages to Paddle's locale codes. Paddle uses zh-Hans for
// Simplified Chinese (we ship zh-CN). Anything outside the supported set
// returns undefined → Paddle falls back to English, matching their default.
function paddleLocaleFromAppLang(lang: string | undefined): string | undefined {
  switch ((lang || '').toLowerCase()) {
    case 'en': return 'en';
    case 'ko': return 'ko';
    case 'ja': return 'ja';
    case 'zh-cn':
    case 'zh': return 'zh-Hans';
    case 'es': return 'es';
    case 'fr': return 'fr';
    case 'de': return 'de';
    case 'it': return 'it';
    default:   return undefined;
  }
}

async function ensurePaddleReady(): Promise<PaddleSdk | null> {
  const sdk = await loadPaddleSdk();
  if (!sdk) return null;
  const Paddle = sdk as PaddleSdk;

  if (_paddleInitialized) return Paddle;

  const token = process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!token) return null;

  try {
    Paddle.Environment.set(paddleEnvironment());
    Paddle.Initialize({
      token,
      eventCallback: (data) => handlePaddleEvent(Paddle, data),
    });
    _paddleInitialized = true;
    return Paddle;
  } catch (e) {
    captureError(e, { service: 'subscriptionService.web', fn: 'ensurePaddleReady' });
    return null;
  }
}

async function startWebCheckout(plan: 'monthly' | 'annual'): Promise<boolean> {
  const provider = process.env.EXPO_PUBLIC_WEB_CHECKOUT_PROVIDER ?? 'none';
  if (provider !== 'paddle') return false;

  try {
    const Paddle = await ensurePaddleReady();
    if (!Paddle) return false;

    const priceId = plan === 'annual'
      ? process.env.EXPO_PUBLIC_PADDLE_PRICE_ANNUAL
      : process.env.EXPO_PUBLIC_PADDLE_PRICE_MONTHLY;
    if (!priceId) return false;

    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user?.id;
    if (!userId) return false;
    const email = session.session?.user?.email;

    const locale = paddleLocaleFromAppLang(i18n.language);
    Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: email ? { email } : undefined,
      customData: { user_id: userId },
      settings: locale
        ? { displayMode: 'overlay', locale }
        : { displayMode: 'overlay' },
    });
    return true;
  } catch (e) {
    captureError(e, { service: 'subscriptionService.web', fn: 'startWebCheckout', plan });
    return false;
  }
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
