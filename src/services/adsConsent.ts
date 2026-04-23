import Constants from 'expo-constants';
import { Platform } from 'react-native';

const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Request UMP consent then ATT permission on app boot.
 * Order matters: UMP (GDPR/CCPA) first, then ATT (iOS IDFA).
 * Safe to call every launch — each SDK only shows its prompt when needed.
 */
export async function requestAdsConsent(): Promise<void> {
  if (isExpoGo) return;
  try {
    const { AdsConsent } = require('react-native-google-mobile-ads');
    await AdsConsent.gatherConsent();
  } catch {
    // native module unavailable or consent request failed — non-blocking
  }

  if (Platform.OS === 'ios') {
    try {
      const { requestTrackingPermissionsAsync } =
        require('expo-tracking-transparency');
      await requestTrackingPermissionsAsync();
    } catch {
      // tracking transparency module unavailable — non-blocking
    }
  }
}

/**
 * Show the privacy options form so the user can change ad consent later.
 * Returns true if the form was shown, false otherwise.
 */
export async function showAdsPrivacyOptions(): Promise<boolean> {
  if (isExpoGo) return false;
  try {
    const { AdsConsent } = require('react-native-google-mobile-ads');
    await AdsConsent.showPrivacyOptionsForm();
    return true;
  } catch {
    return false;
  }
}
