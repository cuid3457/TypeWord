// Web stub for adsConsent. AdMob doesn't render on web and UMP / ATT
// consent flows are native-only, so both entry points are no-ops.

export async function requestAdsConsent(): Promise<void> {
  // no-op
}

export async function showAdsPrivacyOptions(): Promise<boolean> {
  return false;
}
