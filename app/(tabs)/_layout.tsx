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

// Tab-bar visibility — read by the layout to derive `tabBarStyle.display`.
// Screens (e.g. review.tsx during an active session) flip this via the
// setter so the layout-owned tabBarStyle keeps its custom height /
// padding / background even when the bar is hidden.
const TabBarVisibleContext = React.createContext<{
  setHidden: (hidden: boolean) => void;
}>({ setHidden: () => {} });
export const useTabBarVisibility = () => useContext(TabBarVisibleContext);

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
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const insets = useSafeAreaInsets();

  const tabBarVisibility = useMemo(
    () => ({ setHidden: setTabBarHidden }),
    [],
  );

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
    // Light mode: subtle gray (iOS systemGray6) so the tab bar is visually
    // distinct from the white content area. Dark mode keeps the platform
    // default, which already has nice separation from #1A1A1A content bg.
    ...(colorScheme === 'dark' ? {} : { backgroundColor: '#EEEEEE' }),
    ...(tabBarHidden ? { display: 'none' as const } : null),
  }), [insets.bottom, colorScheme, tabBarHidden]);

  return (
    <ReviewBadgeContext.Provider value={refreshReviewBadge}>
    <TabBarVisibleContext.Provider value={tabBarVisibility}>
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
          title: t('tabs.wordlists'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="books.vertical.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: t('tabs.review'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="rectangle.on.rectangle.angled.fill" color={color} />,
          tabBarBadge: reviewCount > 99 ? '99+' : reviewCount > 0 ? reviewCount : undefined,
          tabBarBadgeStyle: { minWidth: 22, paddingHorizontal: 6, fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="square.grid.2x2.fill" color={color} />,
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
    </TabBarVisibleContext.Provider>
    </ReviewBadgeContext.Provider>
  );
}
