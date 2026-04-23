import Constants from 'expo-constants';
import { INTERSTITIAL_AD_UNIT_ID } from '@src/constants/ads';
import { isAdFree } from '@src/services/streakMilestone';
import { captureError } from './sentry';

const isExpoGo = Constants.appOwnership === 'expo';

const COOLDOWN_MS = 30 * 60 * 1000;
const AD_LOAD_TIMEOUT_MS = 10_000;
let lastShownAt = 0;

export async function showInterstitialIfReady(): Promise<void> {
  if (isExpoGo) return;
  if (await isAdFree()) return;
  if (Date.now() - lastShownAt < COOLDOWN_MS) return;

  try {
    const { InterstitialAd, AdEventType } = require('react-native-google-mobile-ads');
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Ad load timeout'));
      }, AD_LOAD_TIMEOUT_MS);

      const unsubLoad = ad.addAdEventListener(AdEventType.LOADED, () => {
        clearTimeout(timeout);
        cleanup();
        ad.show();
        lastShownAt = Date.now();
        resolve();
      });
      const unsubClose = ad.addAdEventListener(AdEventType.CLOSED, () => {
        resolve();
      });
      const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error: unknown) => {
        clearTimeout(timeout);
        cleanup();
        reject(error);
      });

      function cleanup() {
        unsubLoad();
        unsubClose();
        unsubError();
      }

      ad.load();
    });
  } catch (e) {
    captureError(e, { service: 'interstitialAd', fn: 'showInterstitialIfReady' });
  }
}
