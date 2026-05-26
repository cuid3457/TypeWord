// Web stub for rewardedAd. AdMob has no web SDK; rewarded ad gating
// flows on web should treat the reward path as unavailable.

export async function showRewardedAd(): Promise<boolean> {
  return false;
}
