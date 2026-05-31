import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { NATIVE_AD_UNIT_ID } from '@src/constants/ads';
import { usePremium } from '@src/hooks/usePremium';
import { captureError } from '@src/services/sentry';

const isExpoGo = Constants.appOwnership === 'expo';

type LoadedAd = {
  headline: string;
  body: string;
  callToAction: string;
  advertiser: string | null;
  iconUri: string | null;
  ad: unknown; // NativeAd instance — kept opaque so the web bundle doesn't pull the native module
};

/**
 * Inline native ad card. Renders nothing for premium users, on web, or in
 * Expo Go (where the native module isn't linked). On load failure renders
 * nothing rather than a visible error — list flow shouldn't break.
 *
 * AdMob policy requires the "광고" disclosure label and a visible CTA — both
 * are baked in. Tapping anywhere on the card registers a click impression
 * via NativeAdView's wrapping; the explicit CTA button only emphasizes the
 * action affordance.
 */
/** Optional outer margin. When the ad is not loaded the component returns
 * null and the margin disappears with it — useful for slots where an
 * empty wrapper would otherwise leave visible whitespace. */
export function NativeAdCard({ marginTop = 0 }: { marginTop?: number }) {
  const premium = usePremium();
  const [loaded, setLoaded] = useState<LoadedAd | null>(null);
  const [adModules, setAdModules] = useState<{
    NativeAdView: React.ComponentType<{ nativeAd: unknown; children: React.ReactNode; style?: object }>;
    NativeAsset: React.ComponentType<{ assetType: string; children: React.ReactElement }>;
    NativeAssetType: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (isExpoGo || premium || !NATIVE_AD_UNIT_ID) return;

    let cancelled = false;
    let adInstance: { destroy: () => void } | null = null;

    (async () => {
      try {
        const { NativeAd, NativeAdView, NativeAsset, NativeAssetType } = require('react-native-google-mobile-ads');
        const ad = await NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID);
        if (cancelled) {
          ad.destroy();
          return;
        }
        adInstance = ad;
        setAdModules({ NativeAdView, NativeAsset, NativeAssetType });
        setLoaded({
          headline: ad.headline ?? '',
          body: ad.body ?? '',
          callToAction: ad.callToAction ?? '',
          advertiser: ad.advertiser ?? null,
          iconUri: ad.icon?.url ?? null,
          ad,
        });
      } catch (e) {
        captureError(e, { service: 'nativeAdCard', fn: 'load' });
      }
    })();

    return () => {
      cancelled = true;
      if (adInstance) {
        try { adInstance.destroy(); } catch { /* noop */ }
      }
    };
  }, [premium]);

  if (premium || !loaded || !adModules || !NATIVE_AD_UNIT_ID) return null;

  const { NativeAdView: Wrapper, NativeAsset, NativeAssetType } = adModules;

  return (
    <Wrapper nativeAd={loaded.ad} style={{ width: '100%', marginTop }}>
      <View className="rounded-2xl border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-faint">광고</Text>
          {loaded.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text className="text-[10px] text-faint" numberOfLines={1}>{loaded.advertiser}</Text>
            </NativeAsset>
          ) : null}
        </View>
        <View className="flex-row items-center gap-3">
          {loaded.iconUri ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image
                source={{ uri: loaded.iconUri }}
                style={{ width: 44, height: 44, borderRadius: 10 }}
              />
            </NativeAsset>
          ) : null}
          <View className="flex-1">
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={2}>
                {loaded.headline}
              </Text>
            </NativeAsset>
            {loaded.body ? (
              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text className="mt-0.5 text-xs text-muted" numberOfLines={2}>{loaded.body}</Text>
              </NativeAsset>
            ) : null}
          </View>
        </View>
        {loaded.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Pressable className="mt-3 self-start rounded-lg bg-accent px-3 py-1.5">
              <Text className="text-xs font-bold text-white">{loaded.callToAction}</Text>
            </Pressable>
          </NativeAsset>
        ) : null}
      </View>
    </Wrapper>
  );
}
