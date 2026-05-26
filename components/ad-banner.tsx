import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import Constants from 'expo-constants';

import { BANNER_AD_UNIT_ID } from '@src/constants/ads';
import { isAdFree } from '@src/services/streakMilestone';
import { usePremium } from '@src/hooks/usePremium';

const isExpoGo = Constants.appOwnership === 'expo';

export function AdBanner() {
  const scheme = useColorScheme();
  const premium = usePremium();
  const [AdModule, setAdModule] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [adFree, setAdFree] = useState(false);

  useEffect(() => {
    if (isExpoGo || premium) return;
    isAdFree().then(setAdFree);
    try {
      const ads = require('react-native-google-mobile-ads');
      setAdModule(ads);
    } catch {
      // native module unavailable
    }
  }, [premium]);

  // iOS has no real AdMob unit yet (audit 2026-05-26) → BANNER_AD_UNIT_ID is
  // null on iOS in production builds. Render nothing in that case rather than
  // falling back to TestIds.BANNER (which would be an AdMob policy violation).
  if (premium || adFree || !AdModule || !BANNER_AD_UNIT_ID) return null;

  const { BannerAd, BannerAdSize } = AdModule;
  const bg = scheme === 'dark' ? '#1A1A1A' : '#ECECEC';

  return (
    <View style={[
      { width: '100%', alignItems: 'center' },
      loaded ? { backgroundColor: bg, paddingBottom: 8 } : { height: 0, overflow: 'hidden' },
    ]}>
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
}
