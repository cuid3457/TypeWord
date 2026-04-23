import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs, useFocusEffect } from 'expo-router';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBanner } from '@/components/ad-banner';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getReviewableCount } from '@src/db/queries';
import { BottomTabBar } from '@react-navigation/bottom-tabs';

const ReviewBadgeContext = React.createContext<() => void>(() => {});
export const useRefreshReviewBadge = () => useContext(ReviewBadgeContext);

function TabBarWithAd(props: BottomTabBarProps) {
  return (
    <View>
      <AdBanner />
      <BottomTabBar {...props} />
    </View>
  );
}

const TAB_HEIGHT = 60;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const [reviewCount, setReviewCount] = useState(0);
  const insets = useSafeAreaInsets();

  const refreshReviewBadge = useCallback(() => {
    getReviewableCount().then(setReviewCount).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshReviewBadge();
    }, [refreshReviewBadge]),
  );

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <TabBarWithAd {...props} />,
    [],
  );

  const tabBarStyle = useMemo(() => ({
    height: TAB_HEIGHT + insets.bottom,
    paddingBottom: insets.bottom,
  }), [insets.bottom]);

  return (
    <ReviewBadgeContext.Provider value={refreshReviewBadge}>
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="books.vertical.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: t('tabs.review'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="rectangle.on.rectangle.angled.fill" color={color} />,
          tabBarBadge: reviewCount > 99 ? '99+' : reviewCount > 0 ? reviewCount : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
    </ReviewBadgeContext.Provider>
  );
}
