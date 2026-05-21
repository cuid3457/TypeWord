import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs, useFocusEffect } from 'expo-router';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBanner } from '@/components/ad-banner';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getReviewableCount } from '@src/db/queries';
import { countUnseenPokes, listIncomingRequests } from '@src/services/friendsService';
import { BottomTabBar } from '@react-navigation/bottom-tabs';

const ReviewBadgeContext = React.createContext<() => void>(() => {});
export const useRefreshReviewBadge = () => useContext(ReviewBadgeContext);

const NotificationBadgeContext = React.createContext<() => void>(() => {});
export const useRefreshNotificationBadge = () => useContext(NotificationBadgeContext);

// Tab-bar visibility — read by the layout to derive `tabBarStyle.display`.
// Screens (e.g. review.tsx during an active session) flip this via the
// setter so the layout-owned tabBarStyle keeps its custom height /
// padding / background even when the bar is hidden.
const TabBarVisibleContext = React.createContext<{
  setHidden: (hidden: boolean) => void;
}>({ setHidden: () => {} });
export const useTabBarVisibility = () => useContext(TabBarVisibleContext);

function TabBarWithAd(props: BottomTabBarProps) {
  // Outer wrapper needs explicit width:'100%' for iPad landscape — React
  // Navigation's tabBar slot doesn't stretch a content-sized container,
  // which left the ad banner pinned to portrait-width on the left.
  return (
    <View style={{ width: '100%' }}>
      <AdBanner />
      <BottomTabBar {...props} />
    </View>
  );
}

/**
 * Tab icon with an optional unread-count badge anchored to the icon's
 * top-right corner. We bypass React Navigation's built-in tabBarBadge
 * because its default position assumes a visible label below the icon —
 * with labels hidden the icon is vertically centered, leaving the default
 * badge floating well above where the icon actually sits.
 */
function TabIconWithBadge({
  name,
  color,
  badge,
}: {
  name: Parameters<typeof IconSymbol>[0]['name'];
  color: string;
  badge?: number;
}) {
  return (
    <View>
      <IconSymbol size={32} name={name} color={color} />
      {badge !== undefined && badge > 0 ? (
        <View
          className="absolute -right-3 -top-2 h-4 min-w-4 items-center justify-center rounded-full bg-red-500"
          style={{ paddingHorizontal: 4 }}
        >
          <Text className="text-[10px] font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const TAB_HEIGHT = 60;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const [reviewCount, setReviewCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const insets = useSafeAreaInsets();

  const tabBarVisibility = useMemo(
    () => ({ setHidden: setTabBarHidden }),
    [],
  );

  const refreshReviewBadge = useCallback(() => {
    getReviewableCount().then(setReviewCount).catch(() => {});
  }, []);

  const refreshNotificationBadge = useCallback(() => {
    // Use UNSEEN count (matches the in-page bell badge in dashboard.tsx).
    // Previously listRecentPokes() returned seen+unseen, which left the
    // tab badge stuck after the user had already viewed the inbox.
    Promise.all([listIncomingRequests(), countUnseenPokes()])
      .then(([reqs, unseen]) => setNotificationCount(reqs.length + unseen))
      .catch(() => setNotificationCount(0));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshReviewBadge();
      refreshNotificationBadge();
    }, [refreshReviewBadge, refreshNotificationBadge]),
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
    <NotificationBadgeContext.Provider value={refreshNotificationBadge}>
    <TabBarVisibleContext.Provider value={tabBarVisibility}>
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        // Default RN bottom tab reserves vertical space for the label even
        // when hidden, pushing icons up. Collapse that space and re-center.
        tabBarLabelStyle: { display: 'none', height: 0, margin: 0 },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 0,
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarIconStyle: { marginTop: 0, marginBottom: 0, flex: 1, justifyContent: 'center' },
        tabBarStyle,
        lazy: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.wordlists'),
          tabBarIcon: ({ color }) => <IconSymbol size={32} name="books.vertical.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: t('tabs.review'),
          tabBarIcon: ({ color }) => (
            <TabIconWithBadge name="rectangle.on.rectangle.angled.fill" color={color} badge={reviewCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color }) => (
            <TabIconWithBadge name="square.grid.2x2.fill" color={color} badge={notificationCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color }) => <IconSymbol size={32} name="rectangle.stack.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <IconSymbol size={32} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
    </TabBarVisibleContext.Provider>
    </NotificationBadgeContext.Provider>
    </ReviewBadgeContext.Provider>
  );
}
