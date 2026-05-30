// Web stub for interstitialAd. AdMob has no web SDK — session-end ad gating
// is a no-op on web (free web users see banners + AdSense plan).

export function preloadInterstitial(): void {
  // no-op
}

export async function showInterstitial(): Promise<boolean> {
  return false;
}
