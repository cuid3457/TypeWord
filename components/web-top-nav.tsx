// Global top navigation bar for wide-viewport web. Rendered at the root
// layout so it persists across stack screens (terms, subscription,
// legal-policies, etc) — the (tabs)/_layout WebTopTabBar disappears the
// moment the user pushes onto a non-tab screen.
//
// Self-contained:
//   - Reads its own review / notification badge counts (small duplication
//     vs the in-tabs version is acceptable; sources are cheap)
//   - Active state derived from `usePathname()`
//   - Tab presses go through `router.replace` so stack screens above
//     /(tabs) get dismissed in the process
//
// Hidden on:
//   - native (Platform.OS !== 'web')
//   - phone web viewport (< 600px → falls back to (tabs) bottom bar)
//   - auth / onboarding flows where chrome would be wrong
//   - SSR / pre-hydration (matches the existing isWebTop hydration guard)

import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTablet } from '@src/hooks/useTablet';
import { getReviewableCount } from '@src/db/queries';
import { countUnseenPokes, listIncomingRequests } from '@src/services/friendsService';

const TAB_HEIGHT = 60;
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

interface NavIconProps {
  name: React.ComponentProps<typeof IconSymbol>['name'];
  badge?: number;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
}

function NavIcon({ name, badge, active, activeColor, inactiveColor, onPress }: NavIconProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: TAB_HEIGHT }}
      accessibilityRole="button"
    >
      <View>
        <IconSymbol size={32} name={name} color={active ? activeColor : inactiveColor} />
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
    </Pressable>
  );
}

export function WebTopNav() {
  const { isTablet, contentWidth, width } = useTablet();
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const [reviewCount, setReviewCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => { setIsHydrated(true); }, []);

  const refreshBadges = useCallback(() => {
    getReviewableCount().then(setReviewCount).catch(() => {});
    Promise.all([listIncomingRequests(), countUnseenPokes()])
      .then(([reqs, unseen]) => setNotificationCount(reqs.length + unseen))
      .catch(() => setNotificationCount(0));
  }, []);

  useEffect(() => {
    refreshBadges();
  }, [pathname, refreshBadges]);

  if (Platform.OS !== 'web') return null;
  if (!isHydrated) return null;
  if (!isTablet) return null;
  // Auth / onboarding own their own chrome; the tabs nav would be wrong here.
  if (pathname?.startsWith('/auth') || pathname?.startsWith('/onboarding')) return null;

  const barBg = colorScheme === 'dark' ? '#1E1B15' : '#FCFBF7';
  const activeColor = Colors[colorScheme ?? 'light'].tint;
  const inactiveColor = colorScheme === 'dark' ? '#6F675A' : '#A79E90';
  const clusterWidth = width < 760 ? 300 : WEB_NAV_CLUSTER_WIDTH;

  // Map current path back to a tab. Stack screens above (tabs) return null
  // so nothing gets highlighted while the user is on /subscription, /terms,
  // /legal-policies, etc.
  const activeTab = (() => {
    if (!pathname) return null;
    if (pathname === '/' || pathname === '/index') return 'index';
    if (pathname === '/review') return 'review';
    if (pathname === '/dashboard') return 'dashboard';
    if (pathname === '/library') return 'library';
    if (pathname === '/settings') return 'settings';
    return null;
  })();

  const tabs: Array<{
    key: string;
    href: string;
    icon: React.ComponentProps<typeof IconSymbol>['name'];
    badge?: number;
  }> = [
    { key: 'index', href: '/(tabs)', icon: 'books.vertical.fill' },
    { key: 'review', href: '/(tabs)/review', icon: 'rectangle.on.rectangle.angled.fill', badge: reviewCount },
    { key: 'dashboard', href: '/(tabs)/dashboard', icon: 'square.grid.2x2.fill', badge: notificationCount },
    { key: 'library', href: '/(tabs)/library', icon: 'rectangle.stack.fill' },
    { key: 'settings', href: '/(tabs)/settings', icon: 'gearshape.fill' },
  ];

  return (
    <View style={{ width: '100%', height: TAB_HEIGHT, backgroundColor: barBg }}>
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
        <Pressable onPress={() => router.replace('/(tabs)' as never)} accessibilityRole="button">
          <WebWordmark />
        </Pressable>
        <View style={{ flex: 1 }} />
        <View style={{ width: clusterWidth, flexDirection: 'row' }}>
          {tabs.map((tab) => (
            <NavIcon
              key={tab.key}
              name={tab.icon}
              badge={tab.badge}
              active={activeTab === tab.key}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
              onPress={() => router.replace(tab.href as never)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
