import Constants from 'expo-constants';
import { REWARDED_AD_UNIT_ID } from '@src/constants/ads';
import { isAdFree } from '@src/services/streakMilestone';
import { captureError } from './sentry';

const isExpoGo = Constants.appOwnership === 'expo';

const AD_LOAD_TIMEOUT_MS = 10_000;

export async function showRewardedAd(): Promise<boolean> {
  if (isExpoGo) return false;
  if (await isAdFree()) return false;

  try {
    const { RewardedAd, RewardedAdEventType, AdEventType } =
      require('react-native-google-mobile-ads');
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID);

    return new Promise<boolean>((resolve) => {
      let rewarded = false;

      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, AD_LOAD_TIMEOUT_MS);

      const unsubLoad = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        clearTimeout(timeout);
        ad.show();
      });
      const unsubEarned = ad.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => { rewarded = true; },
      );
      const unsubClose = ad.addAdEventListener(AdEventType.CLOSED, () => {
        clearTimeout(timeout);
        cleanup();
        resolve(rewarded);
      });
      const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      });

      function cleanup() {
        unsubLoad();
        unsubEarned();
        unsubClose();
        unsubError();
      }

      ad.load();
    });
  } catch (e) {
    captureError(e, { service: 'rewardedAd', fn: 'showRewardedAd' });
    return false;
  }
}
