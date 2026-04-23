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

  if (premium || adFree || !AdModule) return null;

  const { BannerAd, BannerAdSize, TestIds } = AdModule;
  const bg = scheme === 'dark' ? '#1A1A1A' : '#ECECEC';

  return (
    <View style={loaded ? { backgroundColor: bg, paddingBottom: 8 } : { height: 0, overflow: 'hidden' }}>
      <BannerAd
        unitId={BANNER_AD_UNIT_ID ?? TestIds.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
}
