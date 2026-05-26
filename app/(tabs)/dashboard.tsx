import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletContainer } from '@/components/tablet-container';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Toast } from '@/components/toast';
import { NicknameModal } from '@/components/nickname-modal';
import { ProfileSetupModal } from '@/components/profile-setup-modal';
import { AddFriendByUsernameModal } from '@/components/add-friend-by-username-modal';
import { TargetReportModal } from '@/components/target-report-modal';
import { useRefreshNotificationBadge } from '@/app/(tabs)/_layout';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCachedDashboard, refreshDashboard, subscribeDashboard } from '@src/services/dashboardCache';
import { getTodayStreakDate, type StreakInfo } from '@src/services/streakService';
import { getLevel, getTotalXP, subscribeXP } from '@src/services/xpService';
import {
  blockUser,
  FriendsError,
  listIncomingRequests,
  removeFriend,
  sendPoke,
  type FriendRow,
  type MyProfile,
} from '@src/services/friendsService';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const dark = colorScheme === 'dark';

  // Seed from the module-level prefetch cache. _layout.tsx kicks off
  // refreshDashboard() right after the session is ready, so by the time
  // the user first taps this tab the cache is usually populated and the
  // page renders without a loading flash.
  const initialSnap = getCachedDashboard();
  const [profile, setProfile] = useState<MyProfile | null>(initialSnap?.profile ?? null);
  const [streak, setStreak] = useState<StreakInfo | null>(initialSnap?.streak ?? null);
  const [studiedDates, setStudiedDates] = useState<Set<string>>(initialSnap?.studiedDates ?? new Set());
  const [frozenDates, setFrozenDates] = useState<Set<string>>(initialSnap?.frozenDates ?? new Set());
  const [friends, setFriends] = useState<FriendRow[]>(initialSnap?.friends ?? []);
  const [totalXP, setTotalXP] = useState<number>(getTotalXP());

  useEffect(() => {
    const unsub = subscribeXP(setTotalXP);
    return unsub;
  }, []);
  const [loading, setLoading] = useState(!initialSnap);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'error') => {
    setToast({ msg, type });
  }, []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState<FriendRow | null>(null);
  const [reportTarget, setReportTarget] = useState<FriendRow | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refreshTabBadge = useRefreshNotificationBadge();
  const reloadUnread = useCallback(async () => {
    try {
      const { countUnseenPokes } = await import('@src/services/friendsService');
      const [reqs, unseenPokeCount] = await Promise.all([listIncomingRequests(), countUnseenPokes()]);
      setUnreadCount(reqs.length + unseenPokeCount);
    } catch {
      setUnreadCount(0);
    }
    // Keep the bottom-tab badge in lockstep with the in-page bell badge.
    refreshTabBadge();
  }, [refreshTabBadge]);

  // Subscribe to the module-level cache so any refresh (boot prefetch,
  // tab focus, or outside this screen) flows in via setState here.
  useEffect(() => {
    return subscribeDashboard((snap) => {
      setProfile(snap.profile);
      setStreak(snap.streak);
      setStudiedDates(snap.studiedDates);
      setFrozenDates(snap.frozenDates);
      setFriends(snap.friends);
      setLoading(false);
    });
  }, []);

  // Refetch on focus so data stays current. The cache layer handles
  // dedupe — if a prefetch is mid-flight, this awaits the same promise.
  useFocusEffect(useCallback(() => {
    refreshDashboard().finally(() => setLoading(false));
    reloadUnread();
  }, [reloadUnread]));

  // Foreground push: when any push notification arrives while the dashboard
  // is open, useFocusEffect won't re-fire (already focused) so badge + lists
  // would stay stale. Refresh unconditionally — both refresh fns are cheap
  // and deduped, and iOS data-shape quirks made type-based gating unreliable.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        sub = Notifications.addNotificationReceivedListener(() => {
          reloadUnread();
          refreshDashboard().catch(() => { /* silent */ });
        });
      } catch { /* expo-notifications unavailable — silent */ }
    })();
    return () => { sub?.remove(); };
  }, [reloadUnread]);

  // Background → foreground transition. iOS in particular: when the user
  // backgrounds the app (e.g. to accept on another device), useFocusEffect
  // doesn't re-fire on return since dashboard never lost navigation focus.
  // Refresh on AppState 'active' so the friends list catches up even when
  // the push listener missed (push delivered while backgrounded).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshDashboard().catch(() => { /* silent */ });
        reloadUnread();
      }
    });
    return () => sub.remove();
  }, [reloadUnread]);

  // Realtime subscription: drive friends-list refresh from Postgres
  // INSERT events on the friendships table. This is the primary signal
  // for "the other side accepted my request" — more reliable than push
  // notifications, which iOS does not deliver to the foreground listener
  // consistently. Subscribes once after auth is ready.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const { supabase } = await import('@src/api/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || session?.user?.is_anonymous || cancelled) return;
      const { subscribeFriendshipsForUser } = await import('@src/services/friendsService');
      unsub = subscribeFriendshipsForUser(uid, () => {
        refreshDashboard().catch(() => { /* silent */ });
        reloadUnread();
      });
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [reloadUnread]);


  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator color="#6b7280" />
      </SafeAreaView>
    );
  }

  const isAnon = profile?.isAnonymous ?? true;
  const hasUsername = !!profile?.username;
  const displayName = profile?.displayName || t('dashboard.unnamed');
  const avatarLetter = hasUsername
    ? displayName.charAt(0).toUpperCase()
    : isAnon
      ? t('dashboard.guest').charAt(0).toUpperCase()
      : '?';

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top', 'left', 'right']}>
      <TabletContainer>
      <FlatList
        data={isAnon ? [] : friends}
        keyExtractor={(f) => f.friendId}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await Promise.all([refreshDashboard(), reloadUnread()]);
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor="#10b981"
            colors={['#10b981']}
          />
        }
        ListHeaderComponent={
          <View className="px-6">
            <View className="flex-row items-center justify-between pt-6">
              <View>
                <Text className="text-3xl font-bold text-black dark:text-white">
                  {t('dashboard.title')}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                {!isAnon ? (
                  <Pressable
                    onPress={() => router.push('/store')}
                    className="rounded-xl bg-black p-3 dark:bg-white"
                    accessibilityLabel={t('store.title')}
                    accessibilityRole="button"
                  >
                    <MaterialIcons
                      name="storefront"
                      size={20}
                      color={dark ? '#000' : '#fff'}
                    />
                  </Pressable>
                ) : null}
                {!isAnon ? (
                  <Pressable
                    onPress={() => router.push('/notifications')}
                    className="rounded-xl bg-black p-3 dark:bg-white"
                    accessibilityLabel={t('notifications.title')}
                    accessibilityRole="button"
                  >
                    <View>
                      <MaterialIcons
                        name="notifications"
                        size={20}
                        color={dark ? '#000' : '#fff'}
                      />
                      {unreadCount > 0 ? (
                        <View
                          className="absolute -right-2 -top-2 h-4 min-w-4 items-center justify-center rounded-full bg-red-500"
                          style={{ paddingHorizontal: 3 }}
                        >
                          <Text className="text-[10px] font-bold text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* My Profile Card */}
            <View className="mt-6 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
              <View className="flex-row items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: hasUsername ? '#2EC4A5' : '#9ca3af' }}>
                  <Text className="text-2xl font-bold text-white">
                    {avatarLetter}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  {isAnon ? (
                    <Text className="text-lg font-bold text-black dark:text-white">
                      {t('dashboard.guest')}
                    </Text>
                  ) : hasUsername ? (
                    <>
                      <Pressable onPress={() => setShowNameModal(true)} className="flex-row items-center">
                        <Text className="text-lg font-bold text-black dark:text-white" numberOfLines={1}>
                          {displayName}
                        </Text>
                        <MaterialIcons name="edit" size={14} color="#9ca3af" style={{ marginLeft: 6 }} />
                      </Pressable>
                      <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={1}>
                        @{profile?.username}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-sm text-gray-500">
                      {t('dashboard.tap_to_setup_profile')}
                    </Text>
                  )}
                </View>
                {!isAnon && !hasUsername ? (
                  <Pressable onPress={() => setShowProfileSetup(true)} className="rounded-lg bg-black px-3 py-2 dark:bg-white">
                    <Text className="text-xs font-semibold text-white dark:text-black">
                      {t('dashboard.setup_profile')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Stats row */}
              <View className="mt-4 flex-row flex-wrap gap-2">
                <StatChip icon="🔥" value={streak?.current ?? 0} label={t('dashboard.stat_streak_short')} />
                <StatChip icon="⭐" value={getLevel(totalXP).level} label="Lv" />
              </View>
              {/* Level progress bar */}
              {(() => {
                const info = getLevel(totalXP);
                return (
                  <View className="mt-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-gray-500">
                        {totalXP.toLocaleString()} XP
                      </Text>
                      <Text className="text-xs text-gray-400">
                        {(totalXP + info.nextLevelXP - info.currentLevelXP).toLocaleString()} XP
                      </Text>
                    </View>
                    <View className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
                      <View
                        className="h-1.5 rounded-full bg-[#2EC4A5]"
                        style={{ width: `${Math.round(info.progress * 100)}%` }}
                      />
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Monthly study calendar. Studied days are mint-filled; today
                gets a mint ring. Tap < > to scroll through past/future
                months — past data covers ~2 years (see getStudiedDates). */}
            <View className="mt-6 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
              <Text className="text-sm font-semibold text-black dark:text-white">
                {t('dashboard.activity_title')}
              </Text>
              <ActivityCalendar studiedDates={studiedDates} frozenDates={frozenDates} dark={dark} />
            </View>

            {/* Friends section — gated for anonymous users */}
            {isAnon ? (
              <View className="mt-6 items-center rounded-2xl border border-dashed border-gray-300 p-6 dark:border-gray-700">
                <MaterialIcons name="people-outline" size={40} color="#9ca3af" />
                <Text className="mt-3 text-center text-base font-semibold text-black dark:text-white">
                  {t('dashboard.signup_title')}
                </Text>
                <Text className="mt-1 text-center text-sm text-gray-500">
                  {t('dashboard.signup_message')}
                </Text>
                <Pressable
                  onPress={() => router.push('/auth')}
                  className="mt-4 rounded-xl bg-black px-6 py-3 dark:bg-white"
                >
                  <Text className="text-sm font-semibold text-white dark:text-black">
                    {t('dashboard.signup_cta')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View className="mt-6 flex-row items-center justify-between">
                  <Text className="text-xl font-semibold text-black dark:text-white">
                    {t('dashboard.friends_count', { count: friends.length })}
                  </Text>
                  <Pressable
                    onPress={() => setShowAddModal(true)}
                    className="rounded-xl bg-black p-3 dark:bg-white"
                    disabled={!hasUsername}
                    accessibilityLabel={t('dashboard.add_friend')}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="add" size={20} color={dark ? '#000' : '#fff'} />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => setShowActionMenu(item)}
            className="mx-6 mt-3 rounded-2xl border border-gray-300 p-4 dark:border-gray-700"
          >
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800">
                <Text className="text-base font-bold text-gray-600 dark:text-gray-300">
                  {item.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={1}>
                  {item.displayName}
                </Text>
                {item.username ? (
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    @{item.username}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setShowActionMenu(item)}
                className="-mr-2 p-2"
                accessibilityLabel={t('common.more')}
                accessibilityRole="button"
                hitSlop={8}
              >
                <MaterialIcons name="more-vert" size={22} color="#9ca3af" />
              </Pressable>
            </View>
            {item.statsPublic ? (
              <View className="mt-3 flex-row items-center gap-2">
                <StatChip icon="🔥" value={item.streakCurrent ?? 0} label={t('dashboard.stat_streak_short')} />
                <StatChip icon="⭐" value={getLevel(item.xpTotal ?? 0).level} label="Lv" />
              </View>
            ) : (
              <Text className="mt-2 text-xs text-gray-400">{t('dashboard.stats_hidden')}</Text>
            )}
            <PokeButton
              friend={item}
              onSent={(name) => showToast(t('dashboard.poke_sent_toast', { name }), 'success')}
              onError={(msg) => showToast(msg, 'error')}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          !isAnon && friends.length === 0 ? (
            <View className="mt-8 items-center px-8">
              <MaterialIcons name="people-outline" size={48} color="#9ca3af" />
              <Text className="mt-3 text-center text-sm text-gray-500">
                {t('dashboard.empty')}
              </Text>
            </View>
          ) : null
        }
      />
      </TabletContainer>

      <Toast
        visible={!!toast}
        message={toast?.msg ?? ''}
        type={toast?.type ?? 'error'}
        onHide={() => setToast(null)}
        style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }}
      />

      <AddFriendByUsernameModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onRequestSent={(uname) => {
          setShowAddModal(false);
          showToast(t('dashboard.request_sent_toast', { username: uname }), 'success');
          reloadUnread();
        }}
        onAutoAccepted={(uname) => {
          setShowAddModal(false);
          showToast(t('dashboard.added', { name: `@${uname}` }), 'success');
          refreshDashboard();
        }}
        onError={(message) => showToast(message, 'error')}
      />

      <NicknameModal
        visible={showNameModal}
        initialName={profile?.displayName ?? ''}
        onSaved={() => {
          setShowNameModal(false);
          refreshDashboard();
        }}
        onCancel={() => setShowNameModal(false)}
      />

      <ProfileSetupModal
        visible={showProfileSetup}
        initialDisplayName={profile?.displayName ?? ''}
        initialUsername={profile?.username ?? ''}
        cancellable
        onSaved={() => {
          setShowProfileSetup(false);
          showToast(t('dashboard.profile_saved'), 'success');
          refreshDashboard();
        }}
        onCancel={() => setShowProfileSetup(false)}
      />

      <ActionMenu
        friend={showActionMenu}
        onClose={() => setShowActionMenu(null)}
        onUnfriend={async (id) => {
          await removeFriend(id);
          setShowActionMenu(null);
          showToast(t('dashboard.unfriended'), 'success');
          refreshDashboard();
        }}
        onBlock={async (id) => {
          await blockUser(id);
          setShowActionMenu(null);
          showToast(t('dashboard.blocked'), 'success');
          refreshDashboard();
        }}
        onReport={(id) => {
          const f = showActionMenu;
          setShowActionMenu(null);
          if (f && f.friendId === id) setReportTarget(f);
        }}
      />

      <TargetReportModal
        visible={!!reportTarget}
        target={reportTarget ? { kind: 'user', id: reportTarget.friendId, label: reportTarget.displayName } : null}
        onClose={() => setReportTarget(null)}
        onSubmitted={() => {
          setReportTarget(null);
          showToast(t('report.submitted'), 'success');
        }}
      />

    </SafeAreaView>
  );
}

/**
 * Monthly calendar showing which days the user studied. Standard
 * weekday-grid layout (Sun-first) with prev/next month navigation. Studied
 * days are filled mint; today has a mint ring; days outside the displayed
 * month are dimmed.
 */
function ActivityCalendar({ studiedDates, frozenDates, dark }: { studiedDates: Set<string>; frozenDates: Set<string>; dark: boolean }) {
  const { i18n } = useTranslation();
  const today = getTodayStreakDate();
  const todayDate = new Date(`${today}T00:00:00`);

  const [cursor, setCursor] = useState(() => ({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(), // 0-indexed
  }));

  const lang = i18n.language || 'en';
  const monthLabel = useMemo(() => {
    const d = new Date(cursor.year, cursor.month, 1);
    return d.toLocaleDateString(lang, { year: 'numeric', month: 'long' });
  }, [cursor, lang]);

  const weekdayLabels = useMemo(() => {
    // Sunday-first; render localized narrow weekday names.
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 7 + i); // Jan 7 2024 = Sunday
      return d.toLocaleDateString(lang, { weekday: 'narrow' });
    });
  }, [lang]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startOffset = first.getDay(); // 0 = Sunday, 6 = Saturday
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, idx) => {
      const dayNum = idx - startOffset + 1;
      const d = new Date(cursor.year, cursor.month, dayNum);
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dd}`;
      return {
        dateStr,
        dayNum: d.getDate(),
        inMonth,
        studied: inMonth && studiedDates.has(dateStr),
        frozen: inMonth && frozenDates.has(dateStr),
        isToday: dateStr === today,
        isFuture: d.getTime() > todayDate.getTime(),
      };
    });
  }, [cursor, studiedDates, frozenDates, today, todayDate]);

  const goPrev = () => setCursor((c) => {
    const m = c.month - 1;
    return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m };
  });
  const goNext = () => setCursor((c) => {
    const m = c.month + 1;
    return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m };
  });

  const studiedBg = '#2EC4A5';
  const frozenBorder = '#EF4444';
  const cellBg = dark ? '#1f2937' : '#f3f4f6';

  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={goPrev} hitSlop={10} className="p-1">
          <MaterialIcons name="chevron-left" size={22} color="#6b7280" />
        </Pressable>
        <Text className="text-sm font-semibold text-black dark:text-white">
          {monthLabel}
        </Text>
        <Pressable onPress={goNext} hitSlop={10} className="p-1">
          <MaterialIcons name="chevron-right" size={22} color="#6b7280" />
        </Pressable>
      </View>

      <View className="mt-2 flex-row">
        {weekdayLabels.map((w, i) => (
          <View key={i} className="flex-1 items-center py-1">
            <Text className="text-xs font-medium text-gray-400">{w}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((cell, idx) => {
          if (!cell.inMonth) {
            return <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          }
          const filled = cell.studied;
          // Border precedence: today (mint) > frozen (red) > none. Today
          // also being a frozen day is impossible by construction (today's
          // freeze hasn't been consumed yet), so no further tiebreak needed.
          const hasBorder = cell.isToday || cell.frozen;
          const borderColor = cell.isToday ? studiedBg : cell.frozen ? frozenBorder : 'transparent';
          return (
            <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <View
                className="flex-1 items-center justify-center rounded-full"
                style={{
                  backgroundColor: filled ? studiedBg : cell.isFuture ? 'transparent' : cellBg,
                  borderWidth: hasBorder ? 2 : 0,
                  borderColor,
                  opacity: cell.isFuture ? 0.4 : 1,
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: filled ? '#ffffff' : dark ? '#e5e7eb' : '#374151' }}
                >
                  {cell.dayNum}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatChip({ icon, label, value, dimmed }: {
  icon: string;
  label?: string;
  value: number | string | null;
  dimmed?: boolean;
}) {
  return (
    <View className={`shrink flex-row items-center rounded-lg bg-gray-100 px-3 py-1.5 dark:bg-gray-800 ${dimmed ? 'opacity-50' : ''}`}>
      <Text className="text-base">{icon}</Text>
      <Text className="ml-1 text-sm font-semibold text-black dark:text-white" numberOfLines={1}>
        {value ?? '—'}
      </Text>
      {label ? (
        <Text className="ml-1 shrink text-xs text-gray-500" numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function PokeButton({
  friend,
  onSent,
  onError,
}: {
  friend: FriendRow;
  onSent: (name: string) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await sendPoke(friend.friendId);
      onSent(friend.displayName || friend.username || 'friend');
    } catch (e) {
      if (e instanceof FriendsError) {
        if (e.code === 'not_friends') onError(t('dashboard.poke_not_friends'));
        else if (e.code === 'must_sign_up') onError(t('dashboard.signup_required'));
        else onError(t('error.title'));
      } else {
        onError(t('error.title'));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      onPress={submit}
      disabled={busy}
      className="mt-3 flex-row items-center justify-center rounded-lg bg-black px-3 py-2 dark:bg-white"
      accessibilityLabel={t('dashboard.poke')}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator size="small" color="#9ca3af" />
      ) : (
        <>
          <Text className="text-base">👉</Text>
          <Text className="ml-2 text-sm font-semibold text-white dark:text-black">
            {t('dashboard.poke')}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function ActionMenu({ friend, onClose, onUnfriend, onBlock, onReport }: {
  friend: FriendRow | null;
  onClose: () => void;
  onUnfriend: (id: string) => void;
  onBlock: (id: string) => void;
  onReport: (id: string) => void;
}) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const visible = !!friend;
  const translateY = useSharedValue(1000);

  useEffect(() => {
    if (visible) {
      translateY.value = 1000;
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 300 });
      });
    }
  }, [visible, translateY]);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(1000, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [onClose, translateY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationY > 0) translateY.value = e.translationY;
        })
        .onEnd((e) => {
          if (e.translationY > 120 || e.velocityY > 800) {
            translateY.value = withTiming(1000, { duration: 200 }, (finished) => {
              if (finished) runOnJS(onClose)();
            });
          } else {
            translateY.value = withTiming(0, { duration: 220 });
          }
        }),
    [onClose, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!friend) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable
          onPress={dismiss}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                {
                  backgroundColor: dark ? '#1a1a2e' : '#fff',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 24,
                  paddingBottom: 32,
                },
                sheetStyle,
              ]}
            >
              <Pressable onPress={() => {}}>
                <View className="mb-3 items-center">
                  <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                </View>
                <Text className="text-lg font-bold text-black dark:text-white">
                  {friend.displayName}
                </Text>
                <Pressable onPress={() => onUnfriend(friend.friendId)} className="mt-4 flex-row items-center py-3">
                  <MaterialIcons name="person-remove" size={22} color="#6b7280" />
                  <Text className="ml-3 text-base text-black dark:text-white">{t('dashboard.unfriend')}</Text>
                </Pressable>
                <Pressable onPress={() => onBlock(friend.friendId)} className="flex-row items-center py-3">
                  <MaterialIcons name="block" size={22} color="#ef4444" />
                  <Text className="ml-3 text-base text-red-500">{t('dashboard.block')}</Text>
                </Pressable>
                <Pressable onPress={() => onReport(friend.friendId)} className="flex-row items-center py-3">
                  <MaterialIcons name="flag" size={22} color="#ef4444" />
                  <Text className="ml-3 text-base text-red-500">{t('dashboard.report')}</Text>
                </Pressable>
                <Pressable onPress={dismiss} className="mt-3 items-center py-3">
                  <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
                </Pressable>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
