import { Platform } from 'react-native';

// Google official test Ad Unit IDs
const TEST_BANNER_ANDROID = 'ca-app-pub-3940256099942544/6300978111';
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_BANNER_IOS = 'ca-app-pub-3940256099942544/2934735716';
const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';

// Production Ad Unit IDs from AdMob dashboard
const PROD_BANNER_ANDROID = 'ca-app-pub-2786267266321015/8732225117';
const PROD_REWARDED_ANDROID = 'ca-app-pub-2786267266321015/9129549041';

// iOS: the app has NOT been registered in AdMob yet (audit C-2 2026-05-26).
// Shipping the documented Google sample iOS IDs to production would be an
// AdMob policy violation AND cause Apple reviewers to see the demo "Test Ad"
// banner. Until real iOS unit IDs are issued, hard-disable iOS ads — the
// useAds hook below treats null IDs as "no ad component rendered". When iOS
// AdMob registration completes:
//   1) Register the app in AdMob console → get App ID + Banner + Rewarded.
//   2) Replace PROD_BANNER_IOS / PROD_REWARDED_IOS below.
//   3) Replace the iOS App ID in app.json -> plugins ->
//      react-native-google-mobile-ads -> iosAppId (currently the Google
//      sample). Rebuild iOS.
const PROD_BANNER_IOS: string | null = null;
const PROD_REWARDED_IOS: string | null = null;

// Pre-launch flag — keep TRUE while distributing to family/internal testers
// before the public store launch. AdMob policy treats real-ad impressions
// from pre-launch testing as invalid traffic, and a single accidental click
// on a real ad by an account-linked device can flag the AdMob account.
//
// Wired to env so the launch-day cutover is a build-arg flip rather than a
// code edit (audit H-1 2026-05-26). Default behaviour is conservative:
//   - dev builds: always test ads
//   - prod builds without env set: test ads (safe default)
//   - prod builds with EXPO_PUBLIC_ADS_LIVE === 'true': real ads
const ADS_LIVE = process.env.EXPO_PUBLIC_ADS_LIVE === 'true';
const useTestAds = (): boolean => __DEV__ || !ADS_LIVE;

export const BANNER_AD_UNIT_ID: string | null = Platform.select({
  android: useTestAds() ? TEST_BANNER_ANDROID : PROD_BANNER_ANDROID,
  ios: useTestAds() ? TEST_BANNER_IOS : PROD_BANNER_IOS,
  default: useTestAds() ? TEST_BANNER_ANDROID : PROD_BANNER_ANDROID,
}) ?? null;

export const REWARDED_AD_UNIT_ID: string | null = Platform.select({
  android: useTestAds() ? TEST_REWARDED_ANDROID : PROD_REWARDED_ANDROID,
  ios: useTestAds() ? TEST_REWARDED_IOS : PROD_REWARDED_IOS,
  default: useTestAds() ? TEST_REWARDED_ANDROID : PROD_REWARDED_ANDROID,
}) ?? null;
