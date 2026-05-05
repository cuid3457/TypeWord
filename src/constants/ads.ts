import { Platform } from 'react-native';

// Google official test Ad Unit IDs
const TEST_BANNER_ANDROID = 'ca-app-pub-3940256099942544/6300978111';
const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_BANNER_IOS = 'ca-app-pub-3940256099942544/2934735716';
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';
const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';

// Production Ad Unit IDs from AdMob dashboard
const PROD_BANNER_ANDROID = 'ca-app-pub-2786267266321015/8732225117';
const PROD_INTERSTITIAL_ANDROID = 'ca-app-pub-2786267266321015/1125197834';
const PROD_REWARDED_ANDROID = 'ca-app-pub-2786267266321015/9129549041';
// iOS production IDs — replace when iOS app is registered in AdMob
const PROD_BANNER_IOS = TEST_BANNER_IOS;
const PROD_INTERSTITIAL_IOS = TEST_INTERSTITIAL_IOS;
const PROD_REWARDED_IOS = TEST_REWARDED_IOS;

// Pre-launch flag — keep TRUE while distributing to family/internal testers
// before the public store launch. AdMob policy treats real-ad impressions
// from pre-launch testing as invalid traffic, and a single accidental click
// on a real ad by an account-linked device can flag the AdMob account. Flip
// to FALSE on the day of the public store launch and ship a build with
// production ad units.
const IS_PRELAUNCH = true;

const useTestAds = (): boolean => __DEV__ || IS_PRELAUNCH;

export const BANNER_AD_UNIT_ID = Platform.select({
  android: useTestAds() ? TEST_BANNER_ANDROID : PROD_BANNER_ANDROID,
  ios: useTestAds() ? TEST_BANNER_IOS : PROD_BANNER_IOS,
  default: useTestAds() ? TEST_BANNER_ANDROID : PROD_BANNER_ANDROID,
});

export const INTERSTITIAL_AD_UNIT_ID = Platform.select({
  android: useTestAds() ? TEST_INTERSTITIAL_ANDROID : PROD_INTERSTITIAL_ANDROID,
  ios: useTestAds() ? TEST_INTERSTITIAL_IOS : PROD_INTERSTITIAL_IOS,
  default: useTestAds() ? TEST_INTERSTITIAL_ANDROID : PROD_INTERSTITIAL_ANDROID,
});

export const REWARDED_AD_UNIT_ID = Platform.select({
  android: useTestAds() ? TEST_REWARDED_ANDROID : PROD_REWARDED_ANDROID,
  ios: useTestAds() ? TEST_REWARDED_IOS : PROD_REWARDED_IOS,
  default: useTestAds() ? TEST_REWARDED_ANDROID : PROD_REWARDED_ANDROID,
});
