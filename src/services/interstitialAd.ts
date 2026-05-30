import Constants from 'expo-constants';
import { INTERSTITIAL_AD_UNIT_ID } from '@src/constants/ads';
import { isPremium } from '@src/services/subscriptionService';
import { captureError } from './sentry';

const isExpoGo = Constants.appOwnership === 'expo';

const AD_LOAD_TIMEOUT_MS = 6_000;

type AdInstance = {
  ad: unknown;
  loaded: boolean;
  loading: boolean;
};

let cached: AdInstance | null = null;

function buildAd(): AdInstance | null {
  if (isExpoGo) return null;
  if (!INTERSTITIAL_AD_UNIT_ID) return null;
  try {
    const { InterstitialAd, AdEventType } =
      require('react-native-google-mobile-ads');
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID);
    const inst: AdInstance = { ad, loaded: false, loading: true };
    const unsubLoad = ad.addAdEventListener(AdEventType.LOADED, () => {
      inst.loaded = true;
      inst.loading = false;
    });
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      inst.loaded = false;
      inst.loading = false;
      cached = null;
      unsubLoad();
      unsubError();
    });
    ad.load();
    return inst;
  } catch (e) {
    captureError(e, { service: 'interstitialAd', fn: 'buildAd' });
    return null;
  }
}

/**
 * Preload the next interstitial so showInterstitial() can fire instantly.
 * Safe to call multiple times — no-op if one is already cached.
 */
export function preloadInterstitial(): void {
  if (isPremium()) return;
  if (cached) return;
  cached = buildAd();
}

/**
 * Show the cached interstitial. Resolves true if the ad was shown and
 * dismissed, false otherwise (premium, not loaded yet, error). Always
 * preloads the next one on completion.
 */
export async function showInterstitial(): Promise<boolean> {
  if (isExpoGo) return false;
  if (isPremium()) return false;
  if (!INTERSTITIAL_AD_UNIT_ID) return false;

  // If nothing cached, kick off a load and bail — caller proceeds without ad.
  if (!cached) {
    preloadInterstitial();
    return false;
  }

  const inst = cached;
  // If still loading, wait a short window for it to finish.
  if (!inst.loaded) {
    const ready = await new Promise<boolean>((resolve) => {
      const start = Date.now();
      const tick = setInterval(() => {
        if (inst.loaded) {
          clearInterval(tick);
          resolve(true);
        } else if (Date.now() - start > AD_LOAD_TIMEOUT_MS) {
          clearInterval(tick);
          resolve(false);
        }
      }, 200);
    });
    if (!ready) {
      cached = null;
      preloadInterstitial();
      return false;
    }
  }

  try {
    const { AdEventType } = require('react-native-google-mobile-ads');
    const ad = inst.ad as {
      show: () => void;
      addAdEventListener: (type: unknown, cb: () => void) => () => void;
    };
    return await new Promise<boolean>((resolve) => {
      const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        cleanup();
        cached = null;
        preloadInterstitial();
        resolve(true);
      });
      const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
        cleanup();
        cached = null;
        preloadInterstitial();
        resolve(false);
      });
      function cleanup() {
        unsubClosed();
        unsubError();
      }
      ad.show();
    });
  } catch (e) {
    captureError(e, { service: 'interstitialAd', fn: 'showInterstitial' });
    cached = null;
    return false;
  }
}
