import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarCircle } from '@/components/avatar-circle';
import { AvatarMenu } from '@/components/avatar-menu';
import { BackgroundPicker } from '@/components/background-picker';
import { TabletContainer } from '@/components/tablet-container';

import { Toast } from '@/components/toast';
import { Card } from '@/components/ui/card';
import { ProfileSetupModal } from '@/components/profile-setup-modal';
import { NativeAdCard } from '@/components/native-ad-card';
import { useRefreshNotificationBadge } from '@/app/(tabs)/_layout';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCachedDashboard, refreshDashboard, subscribeDashboard } from '@src/services/dashboardCache';
import { haptic } from '@src/services/hapticService';
import { getTodayStreakDate, type StreakInfo } from '@src/services/streakService';
import { getLevel, getTotalXP, subscribeXP } from '@src/services/xpService';
import {
  listIncomingRequests,
  type MyProfile,
} from '@src/services/friendsService';
import { getMysteryBoxState, refreshMysteryBoxState, subscribeMysteryBox } from '@src/services/mysteryBoxService';
import { getStatsSnapshot, type StatsSnapshot } from '@src/services/statsService';
import { getDormantCount } from '@src/db/queries';
import { isPearlCompletedToday } from '@src/services/pearlDailyService';

const PEARL_DAILY_CAP = 5;

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
  const [friendCount, setFriendCount] = useState<number>(initialSnap?.friends?.length ?? 0);
  const [totalXP, setTotalXP] = useState<number>(getTotalXP());
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [dormantCount, setDormantCount] = useState<number>(0);
  const [pearlDoneToday, setPearlDoneToday] = useState<boolean>(false);
  const [boxState, setBoxState] = useState(getMysteryBoxState());
  useEffect(() => subscribeMysteryBox(setBoxState), []);
  useEffect(() => { refreshMysteryBoxState().catch(() => {}); }, []);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);

  useEffect(() => {
    const unsub = subscribeXP(setTotalXP);
    return unsub;
  }, []);
  const [loading, setLoading] = useState(!initialSnap);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'error') => {
    setToast({ msg, type });
  }, []);
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

  const reloadStats = useCallback(async () => {
    try {
      setStats(await getStatsSnapshot());
    } catch {
      /* silent — dashboard mini-widget falls back to last value */
    }
  }, []);

  const reloadDormant = useCallback(async () => {
    try {
      const [count, done] = await Promise.all([
        getDormantCount(),
        isPearlCompletedToday(),
      ]);
      setDormantCount(count);
      setPearlDoneToday(done);
    } catch {
      /* silent — card just won't show if the count read fails */
    }
  }, []);

  // Subscribe to the module-level cache so any refresh (boot prefetch,
  // tab focus, or outside this screen) flows in via setState here.
  useEffect(() => {
    return subscribeDashboard((snap) => {
      setProfile(snap.profile);
      setStreak(snap.streak);
      setStudiedDates(snap.studiedDates);
      setFrozenDates(snap.frozenDates);
      setFriendCount(snap.friends.length);
      setLoading(false);
    });
  }, []);

  // Refetch on focus so data stays current. The cache layer handles
  // dedupe — if a prefetch is mid-flight, this awaits the same promise.
  useFocusEffect(useCallback(() => {
    refreshDashboard().finally(() => setLoading(false));
    reloadUnread();
    reloadStats();
    reloadDormant();
  }, [reloadUnread, reloadStats, reloadDormant]));

  // Foreground push: when any push notification arrives while the dashboard
  // is open, useFocusEffect won't re-fire (already focused) so badge would
  // stay stale. Refresh unconditionally — both refresh fns are cheap and
  // deduped.
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
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshDashboard().catch(() => { /* silent */ });
        reloadUnread();
        reloadStats();
      }
    });
    return () => sub.remove();
  }, [reloadUnread, reloadStats]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <ActivityIndicator color="#2EC4A5" />
      </SafeAreaView>
    );
  }

  const isAnon = profile?.isAnonymous ?? true;
  const hasUsername = !!profile?.username;
  const displayName = profile?.displayName || t('dashboard.unnamed');
  const avatarName = hasUsername ? displayName : isAnon ? t('dashboard.guest') : '?';

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <TabletContainer>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                haptic.tap();
                setRefreshing(true);
                try {
                  await Promise.all([refreshDashboard(), reloadUnread(), reloadStats()]);
                } finally {
                  setRefreshing(false);
                }
              }}
              tintColor="#2EC4A5"
              colors={['#2EC4A5']}
            />
          }
        >
          <View className="px-6">
            <View className="flex-row items-center justify-between pt-6">
              <View>
                <Text className="text-3xl font-extrabold tracking-tight text-ink dark:text-ink-dark">
                  {t('dashboard.title')}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                {!isAnon ? (
                  <Pressable
                    onPress={() => { haptic.tap(); router.push('/store'); }}
                    className="rounded-full bg-ink p-3 dark:bg-ink-dark"
                    accessibilityLabel={t('store.title')}
                    accessibilityRole="button"
                  >
                    <MaterialIcons
                      name="storefront"
                      size={20}
                      color={dark ? '#15130E' : '#F4F1EA'}
                    />
                  </Pressable>
                ) : null}
                {!isAnon ? (
                  <Pressable
                    onPress={() => { haptic.tap(); router.push('/notifications'); }}
                    className="rounded-full bg-ink p-3 dark:bg-ink-dark"
                    accessibilityLabel={t('notifications.title')}
                    accessibilityRole="button"
                  >
                    <View>
                      <MaterialIcons
                        name="notifications"
                        size={20}
                        color={dark ? '#15130E' : '#F4F1EA'}
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
            <Card className="mt-6 p-5">
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => { if (!isAnon) setShowAvatarMenu(true); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('avatar_menu.title')}
                  hitSlop={6}
                >
                  <AvatarCircle
                    name={avatarName}
                    backgroundId={hasUsername ? boxState.equippedBackgroundId : null}
                    size={56}
                  />
                </Pressable>

                <View className="ml-3 flex-1">
                  {isAnon ? (
                    <Text className="text-lg font-bold text-ink dark:text-ink-dark">
                      {t('dashboard.guest')}
                    </Text>
                  ) : hasUsername ? (
                    <>
                      <Pressable onPress={() => setShowProfileSetup(true)} className="flex-row items-center">
                        <Text className="text-lg font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
                          {displayName}
                        </Text>
                        <MaterialIcons name="edit" size={14} color="#A79E90" style={{ marginLeft: 6 }} />
                      </Pressable>
                      <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                        @{profile?.username}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-sm text-muted">
                      {t('dashboard.tap_to_setup_profile')}
                    </Text>
                  )}
                </View>
                {!isAnon && !hasUsername ? (
                  <Pressable onPress={() => setShowProfileSetup(true)} className="rounded-lg bg-ink px-3 py-2 dark:bg-ink-dark">
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
                      <Text className="text-xs text-muted">
                        {totalXP.toLocaleString()} XP
                      </Text>
                      <Text className="text-xs text-faint">
                        {(totalXP + info.nextLevelXP - info.currentLevelXP).toLocaleString()} XP
                      </Text>
                    </View>
                    <View className="mt-1 h-1.5 rounded-full bg-clay dark:bg-clay-dark">
                      <View
                        className="h-1.5 rounded-full bg-[#2EC4A5]"
                        style={{ width: `${Math.round(info.progress * 100)}%` }}
                      />
                    </View>
                  </View>
                );
              })()}

              {/* Friends entry — gated for anonymous users */}
              {!isAnon ? (
                <Pressable
                  onPress={() => { haptic.tap(); router.push('/friends'); }}
                  className="mt-4 flex-row items-center justify-between rounded-xl border border-line py-3 pl-4 pr-3 dark:border-line-dark"
                  accessibilityRole="button"
                  accessibilityLabel={t('friends.title')}
                >
                  <View className="flex-row items-center">
                    <MaterialIcons name="people-outline" size={20} color={dark ? '#F1ECE2' : '#2A2620'} />
                    <Text className="ml-2 text-sm font-semibold text-ink dark:text-ink-dark">
                      {t('friends.title')}
                    </Text>
                    <Text className="ml-2 text-sm text-muted">{friendCount}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#A79E90" />
                </Pressable>
              ) : null}
            </Card>

            {/* Native ad slot — placed between profile and calendar so it
                rides the natural pause after the user reads their headline
                stats, before the data-dense calendar/mastery widgets.
                marginTop on the component itself (not an outer wrapper)
                so an unloaded/null ad takes zero vertical space — keeps
                the profile→pearl gap consistent with the other cards. */}
            <NativeAdCard marginTop={24} />

            {/* Word Pearl entry — directly between the ad slot and the
                calendar so the surrounding mt-6 spacing matches every
                other learning card on the page. Daily-capped: once
                today's batch is done, the card hides until tomorrow so
                the feature stays scarce. */}
            {dormantCount > 0 && !pearlDoneToday ? (
              <Pressable
                onPress={() => { haptic.tap(); router.push('/word-pearl'); }}
                accessibilityRole="button"
                accessibilityLabel={t('pearl.title')}
              >
                <Card className="mt-6 p-5">
                  <View className="flex-row items-center">
                    <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: dark ? '#2A261E' : '#FFFFFF', borderWidth: 1, borderColor: dark ? '#3A352B' : '#ECE6DA' }}>
                      <Text style={{ fontSize: 24 }}>🦪</Text>
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                        {t('pearl.dashboard_title')}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted">
                        {t('pearl.dashboard_subtitle', { count: Math.min(PEARL_DAILY_CAP, dormantCount) })}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#A79E90" />
                  </View>
                </Card>
              </Pressable>
            ) : null}

            {/* Weekly recap card — surfaces Sun + Mon so the wrap-up
                moment doubles as a share hook AND users who missed it
                Sunday still see it Monday. Tue–Sat is heads-down
                learning, no recap noise. */}
            {(() => { const d = new Date().getDay(); return d === 0 || d === 1; })() ? (
              <Pressable
                onPress={() => { haptic.tap(); router.push('/weekly-recap'); }}
                accessibilityRole="button"
                accessibilityLabel={t('weekly.title')}
              >
                <Card className="mt-6 p-5">
                  <View className="flex-row items-center">
                    <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: '#2EC4A510', borderWidth: 1, borderColor: '#2EC4A5' }}>
                      <MaterialIcons name="insights" size={22} color="#2EC4A5" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                        {t('weekly.card_title')}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted">
                        {t('weekly.card_subtitle')}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#A79E90" />
                  </View>
                </Card>
              </Pressable>
            ) : null}

            {/* Monthly study calendar. Studied days are mint-filled; today
                gets a mint ring. Tap < > to scroll through past/future
                months — past data covers ~2 years (see getStudiedDates).
                Whole card is pressable → opens the full Stats page. */}
            <Pressable
              onPress={() => { haptic.tap(); router.push('/stats'); }}
              accessibilityRole="button"
              accessibilityLabel={t('stats.title')}
            >
              <Card className="mt-6 p-5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                    {t('dashboard.activity_title')}
                  </Text>
                  <View className="flex-row items-center">
                    <Text className="text-xs text-muted">{t('stats.view_more')}</Text>
                    <MaterialIcons name="chevron-right" size={18} color="#A79E90" />
                  </View>
                </View>
                <ActivityCalendar studiedDates={studiedDates} frozenDates={frozenDates} dark={dark} />
              </Card>
            </Pressable>

            {/* Stats summary card — small surface that previews mastery and
                deep-links into the full Stats page. Tap-through targets the
                same /stats route as the calendar card for symmetry. */}
            {!isAnon && stats && stats.srs.total > 0 ? (
              <Pressable
                onPress={() => { haptic.tap(); router.push('/stats'); }}
                accessibilityRole="button"
                accessibilityLabel={t('stats.title')}
              >
                <Card className="mt-6 p-5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                      {t('stats.mastery_title')}
                    </Text>
                    <View className="flex-row items-center">
                      <Text className="text-xs text-muted">{t('stats.view_more')}</Text>
                      <MaterialIcons name="chevron-right" size={18} color="#A79E90" />
                    </View>
                  </View>
                  <MasteryBar dist={stats.srs} dark={dark} />
                  <Text className="mt-2 text-xs text-muted">
                    {t('stats.total_cards', { count: stats.srs.total })}
                  </Text>
                </Card>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </TabletContainer>

      <Toast
        visible={!!toast}
        message={toast?.msg ?? ''}
        type={toast?.type ?? 'error'}
        onHide={() => setToast(null)}
        style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }}
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

      <AvatarMenu
        visible={showAvatarMenu}
        onClose={() => setShowAvatarMenu(false)}
        onPickBackground={() => setShowBgPicker(true)}
        onPickCharacter={() => router.push('/mystery-box')}
      />
      <BackgroundPicker visible={showBgPicker} onClose={() => setShowBgPicker(false)} />
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
  const cellBg = dark ? '#2A261E' : '#ECE6DA';

  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={goPrev} hitSlop={10} className="p-1">
          <MaterialIcons name="chevron-left" size={22} color="#7B7366" />
        </Pressable>
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
          {monthLabel}
        </Text>
        <Pressable onPress={goNext} hitSlop={10} className="p-1">
          <MaterialIcons name="chevron-right" size={22} color="#7B7366" />
        </Pressable>
      </View>

      <View className="mt-2 flex-row">
        {weekdayLabels.map((w, i) => (
          <View key={i} className="flex-1 items-center py-1">
            <Text className="text-xs font-medium text-faint">{w}</Text>
          </View>
        ))}
      </View>

      {/* Render as explicit week rows of 7 flex-1 cells. Using flex-1 (like
          the weekday header above) instead of width:100/7% + flex-wrap avoids
          sub-pixel rounding pushing the 7th column (Saturday) onto a new row /
          out of view at certain container widths. cells.length is always a
          multiple of 7. */}
      {Array.from({ length: cells.length / 7 }, (_, weekIdx) => (
        <View key={weekIdx} className="flex-row">
          {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((cell, dayIdx) => {
            if (!cell.inMonth) {
              return <View key={dayIdx} className="flex-1" style={{ aspectRatio: 1 }} />;
            }
            const filled = cell.studied;
            // Border precedence: today (mint) > frozen (red) > none. Today
            // also being a frozen day is impossible by construction (today's
            // freeze hasn't been consumed yet), so no further tiebreak needed.
            const hasBorder = cell.isToday || cell.frozen;
            const borderColor = cell.isToday ? studiedBg : cell.frozen ? frozenBorder : 'transparent';
            return (
              <View key={dayIdx} className="flex-1" style={{ aspectRatio: 1, padding: 2 }}>
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
                    style={{ color: filled ? '#ffffff' : dark ? '#F1ECE2' : '#2A2620' }}
                  >
                    {cell.dayNum}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
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
    <View className={`shrink flex-row items-center rounded-lg bg-clay px-3 py-1.5 dark:bg-clay-dark ${dimmed ? 'opacity-50' : ''}`}>
      <Text className="text-base">{icon}</Text>
      <Text className="ml-1 text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
        {value ?? '—'}
      </Text>
      {label ? (
        <Text className="ml-1 shrink text-xs text-muted" numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const STAGE_COLORS: Record<'new' | 'learning' | 'reviewing' | 'mastered', string> = {
  new: '#A79E90',
  learning: '#F59E0B',
  reviewing: '#3B82F6',
  mastered: '#2EC4A5',
};

/**
 * Single horizontal stacked bar showing the share of cards in each SRS
 * stage. Counts < 1% of the total are still rendered (1px min) so the
 * legend below stays honest, but they won't visually crowd the bar.
 */
function MasteryBar({
  dist,
  dark,
}: {
  dist: { new: number; learning: number; reviewing: number; mastered: number; total: number };
  dark: boolean;
}) {
  const { t } = useTranslation();
  if (dist.total <= 0) return null;
  const segments: { key: 'new' | 'learning' | 'reviewing' | 'mastered'; count: number }[] = [
    { key: 'new', count: dist.new },
    { key: 'learning', count: dist.learning },
    { key: 'reviewing', count: dist.reviewing },
    { key: 'mastered', count: dist.mastered },
  ];
  return (
    <View className="mt-3">
      <View
        className="h-2.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: dark ? '#2A261E' : '#ECE6DA', flexDirection: 'row' }}
      >
        {segments.map((s) =>
          s.count > 0 ? (
            <View
              key={s.key}
              style={{ flex: s.count, backgroundColor: STAGE_COLORS[s.key] }}
            />
          ) : null,
        )}
      </View>
      <View className="mt-2 flex-row flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <View key={s.key} className="flex-row items-center">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[s.key] }} />
            <Text className="ml-1.5 text-xs text-muted">
              {t(`stats.stage_${s.key}` as const)} {s.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
