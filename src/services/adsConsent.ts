import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import i18n from '@src/i18n';

const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Show a localized pre-prompt explaining why we ask for tracking, then defer
 * to the system ATT prompt. Apple Guideline 5.1.1(i) effectively requires
 * context for the ATT prompt — showing a contextual explanation immediately
 * before the system dialog reduces "denied without reading" rates AND
 * documents intent for App Review. Native Alert.alert is acceptable; the
 * pre-prompt may not contain "Allow" / "Don't Allow" wording verbatim
 * (Apple bans pre-prompts that mimic the system dialog).
 */
function showAttPrePrompt(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      i18n.t('ads.att_prompt_title', { defaultValue: 'Personalized ads' }),
      i18n.t('ads.att_prompt_body', {
        defaultValue:
          "MoaVoca can show ads more relevant to you by sharing a non-identifying advertising ID with our ad partner. You'll see ads either way — choosing to share keeps them more useful. On the next screen iOS will ask for your decision.",
      }),
      [
        {
          text: i18n.t('common.continue', { defaultValue: 'Continue' }),
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false },
    );
  });
}

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
      const tt = require('expo-tracking-transparency');
      // Only show the pre-prompt + ATT dialog if the user hasn't decided yet.
      // Querying first avoids re-prompting on every cold start.
      const current = await tt.getTrackingPermissionsAsync?.();
      if (current?.status === 'undetermined' || current?.canAskAgain === true) {
        await showAttPrePrompt();
        await tt.requestTrackingPermissionsAsync();
      }
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
