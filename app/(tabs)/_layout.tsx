import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs, useFocusEffect } from 'expo-router';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTablet } from '@src/hooks/useTablet';
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
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}>({ hidden: false, setHidden: () => {} });
export const useTabBarVisibility = () => useContext(TabBarVisibleContext);

const TAB_HEIGHT = 60;

// Web puts the tab bar at the top of the viewport (desktop convention).
// Layout: wordmark on the left + nav icons clustered on the right inside
// a centered contentWidth column. The full-width gutters carry the warm
// background and the bottom hairline. Mobile ad-banner slot is skipped.
const WEB_NAV_CLUSTER_WIDTH = 380;

function WebWordmark() {
  const colorScheme = useColorScheme();
  const ink = colorScheme === 'dark' ? '#F0EBDF' : '#2A2620';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: '800',
          letterSpacing: -0.5,
          color: ink,
          // @ts-expect-error — web-only font fallback chain
          fontFamily: Platform.OS === 'web' ? 'Pretendard Variable, Pretendard, system-ui, sans-serif' : undefined,
        }}
      >
        Moa<Text style={{ color: '#2EC4A5' }}>Voca</Text>
      </Text>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: '#2EC4A5',
          marginLeft: 4,
          marginTop: 10,
        }}
      />
    </View>
  );
}

function WebTopTabBar(props: BottomTabBarProps) {
  const { contentWidth } = useTablet();
  const colorScheme = useColorScheme();
  const barBackground = colorScheme === 'dark' ? '#1E1B15' : '#FCFBF7';
  const lineColor = colorScheme === 'dark' ? '#322D24' : '#E5DFD3';
  return (
    <View
      style={{
        width: '100%',
        backgroundColor: barBackground,
        borderBottomColor: lineColor,
        borderBottomWidth: 1,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: contentWidth,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          height: TAB_HEIGHT,
        }}
      >
        <WebWordmark />
        <View style={{ flex: 1 }} />
        <View style={{ width: WEB_NAV_CLUSTER_WIDTH }}>
          <BottomTabBar {...props} />
        </View>
      </View>
    </View>
  );
}

function TabBarWithAd(props: BottomTabBarProps) {
  // Outer wrapper needs explicit width:'100%' for iPad landscape — React
  // Navigation's tabBar slot doesn't stretch a content-sized container,
  // which left the ad banner pinned to portrait-width on the left.
  // When the tab bar is hidden (e.g. active review session), absorb the
  // system nav-bar inset here so the banner doesn't overlap the nav bar.
  // On tablet/wide-web the inner column is capped to contentWidth and
  // centered so the icons don't sprawl across an ultrawide monitor.
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { hidden } = useContext(TabBarVisibleContext);
  const { isTablet, contentWidth } = useTablet();
  const barBackground = colorScheme === 'dark' ? '#1E1B15' : '#FCFBF7';
  return (
    <View
      style={{
        width: '100%',
        paddingBottom: hidden ? insets.bottom : 0,
        backgroundColor: isTablet ? barBackground : undefined,
      }}
    >
      <View style={isTablet ? { width: '100%', maxWidth: contentWidth, alignSelf: 'center' } : undefined}>
        <BottomTabBar {...props} />
      </View>
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

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const [reviewCount, setReviewCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const insets = useSafeAreaInsets();
  // Hydration guard for viewport-dependent rendering — see isWebTop below.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => { setIsHydrated(true); }, []);

  const tabBarVisibility = useMemo(
    () => ({ hidden: tabBarHidden, setHidden: setTabBarHidden }),
    [tabBarHidden],
  );

  const refreshReviewBadge = useCallback(() => {
    getReviewableCount().then(setReviewCount).catch(() => {});
  }, []);

  const refreshNotificationBadge = useCallback(() => {
    Promise.all([listIncomingRequests(), countUnseenPokes()])
      .then(([reqs, unseen]) => {
        const count = reqs.length + unseen;
        setNotificationCount(count);
        // Mirror to the OS app icon — iOS only. Samsung One UI cannot keep
        // the launcher badge in sync reliably across sequential pushes, so
        // Android disables the launcher badge entirely (channel showBadge:
        // false in notificationService.ts). The in-app bell + tab dot still
        // reflect notificationCount above.
        if (Platform.OS !== 'android') {
          import('expo-notifications')
            .then((N) => N.setBadgeCountAsync(count).catch(() => {}))
            .catch(() => {});
        }
      })
      .catch(() => setNotificationCount(0));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshReviewBadge();
      refreshNotificationBadge();
    }, [refreshReviewBadge, refreshNotificationBadge]),
  );

  // Web has two layouts:
  //  - Tablet/desktop (>= 600px viewport): tab bar at top with wordmark
  //    on the left and clustered icons on the right (desktop convention).
  //  - Phone (< 600px viewport): keep the bar at the bottom for thumb
  //    reach — the native mobile pattern. Ad slot is still skipped.
  // Native always uses the bottom bar with the ad slot.
  const isWeb = Platform.OS === 'web';
  const { isTablet: isWideViewport } = useTablet();
  // SSR consideration: useTablet → useWindowDimensions has no real value
  // during expo static export, so isWideViewport is always false at SSR.
  // Without the isHydrated guard, the first client render on desktop would
  // swap renderTabBar from <BottomTabBar/> (SSR) to <WebTopTabBar/> →
  // React hydration mismatch (#418). Gate on isHydrated so the first
  // client render matches SSR; the useEffect then swaps in the desktop
  // top bar on the second render.
  const isWebTop = isHydrated && isWeb && isWideViewport;

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => {
      if (isWebTop) return <WebTopTabBar {...props} />;
      if (isWeb) return <BottomTabBar {...props} />;
      return <TabBarWithAd {...props} />;
    },
    [isWeb, isWebTop],
  );

  const tabBarStyle = useMemo(() => {
    const barBg = colorScheme === 'dark' ? '#1E1B15' : '#FCFBF7';
    const lineColor = colorScheme === 'dark' ? '#322D24' : '#E5DFD3';
    if (isWebTop) {
      // The WebTopTabBar wrapper owns the full-viewport-width bottom hairline
      // so the line spans the gutters; keep the inner bar borderless.
      // Desktop/tablet web ignores the `tabBarHidden` immersive flag —
      // big screens have room to keep persistent navigation visible, and
      // it matches browser-app convention. Phone-web + native still hide.
      return {
        height: TAB_HEIGHT,
        backgroundColor: barBg,
        borderTopWidth: 0,
      };
    }
    if (isWeb) {
      // Phone-browser bottom bar: respect iOS Safari home-indicator inset.
      return {
        height: TAB_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        backgroundColor: barBg,
        borderTopColor: lineColor,
        borderTopWidth: 1,
        ...(tabBarHidden ? { display: 'none' as const } : null),
      };
    }
    return {
      height: TAB_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
      backgroundColor: barBg,
      borderTopColor: lineColor,
      borderTopWidth: 1,
      ...(tabBarHidden ? { display: 'none' as const } : null),
    };
  }, [insets.bottom, colorScheme, tabBarHidden, isWeb, isWebTop]);

  return (
    <ReviewBadgeContext.Provider value={refreshReviewBadge}>
    <NotificationBadgeContext.Provider value={refreshNotificationBadge}>
    <TabBarVisibleContext.Provider value={tabBarVisibility}>
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: colorScheme === 'dark' ? '#6F675A' : '#A79E90',
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
        tabBarPosition: isWebTop ? 'top' : 'bottom',
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
