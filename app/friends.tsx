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
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AvatarCircle } from '@/components/avatar-circle';
import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';
import { AddFriendByUsernameModal } from '@/components/add-friend-by-username-modal';
import { TargetReportModal } from '@/components/target-report-modal';
import { useRefreshNotificationBadge } from '@/app/(tabs)/_layout';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCachedDashboard, refreshDashboard, subscribeDashboard } from '@src/services/dashboardCache';
import { haptic } from '@src/services/hapticService';
import { getLevel } from '@src/services/xpService';
import {
  addFriendByCode,
  applyReferral,
  blockUser,
  ensureFriendCode,
  FriendsError,
  listIncomingRequests,
  removeFriend,
  sendPoke,
  type FriendRow,
  type MyProfile,
} from '@src/services/friendsService';
import { refreshBonusPremium } from '@src/services/subscriptionService';

const INVITE_BASE_URL = 'https://moavoca.com/app/invite/';

export default function FriendsScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const dark = colorScheme === 'dark';

  const initialSnap = getCachedDashboard();
  const [profile, setProfile] = useState<MyProfile | null>(initialSnap?.profile ?? null);
  const [friends, setFriends] = useState<FriendRow[]>(initialSnap?.friends ?? []);
  const [loading, setLoading] = useState(!initialSnap);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState<FriendRow | null>(null);
  const [reportTarget, setReportTarget] = useState<FriendRow | null>(null);
  const [showEnterCode, setShowEnterCode] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'error') => {
    setToast({ msg, type });
  }, []);

  const refreshTabBadge = useRefreshNotificationBadge();
  const reloadUnread = useCallback(async () => {
    try {
      const { countUnseenPokes } = await import('@src/services/friendsService');
      const [reqs, unseen] = await Promise.all([listIncomingRequests(), countUnseenPokes()]);
      // Keep the global notification-tab badge in sync (incoming requests +
      // unseen pokes); this page doesn't render its own bell.
      void reqs; void unseen;
    } catch {
      /* silent */
    }
    refreshTabBadge();
  }, [refreshTabBadge]);

  useEffect(() => {
    return subscribeDashboard((snap) => {
      setProfile(snap.profile);
      setFriends(snap.friends);
      setLoading(false);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    refreshDashboard().finally(() => setLoading(false));
    reloadUnread();
  }, [reloadUnread]));

  // Foreground push → refresh friends list (e.g. someone accepted)
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        sub = Notifications.addNotificationReceivedListener(() => {
          reloadUnread();
          refreshDashboard().catch(() => { /* silent */ });
        });
      } catch { /* silent */ }
    })();
    return () => { sub?.remove(); };
  }, [reloadUnread]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshDashboard().catch(() => { /* silent */ });
        reloadUnread();
      }
    });
    return () => sub.remove();
  }, [reloadUnread]);

  // Realtime: catch the "they accepted" / "they poked you" cases the push
  // listener misses on iOS.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let unsubPokes: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const { supabase } = await import('@src/api/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || session?.user?.is_anonymous || cancelled) return;
      const { subscribeFriendshipsForUser, subscribePokesForUser } = await import('@src/services/friendsService');
      unsub = subscribeFriendshipsForUser(uid, () => {
        refreshDashboard().catch(() => { /* silent */ });
        reloadUnread();
      });
      unsubPokes = subscribePokesForUser(uid, () => {
        reloadUnread();
      });
    })();
    return () => { cancelled = true; unsub?.(); unsubPokes?.(); };
  }, [reloadUnread]);

  const isAnon = profile?.isAnonymous ?? true;
  const hasUsername = !!profile?.username;
  const friendCode = profile?.friendCode ?? null;
  const displayName = profile?.displayName ?? null;

  // Lazy-ensure a friend_code once the screen mounts with a signed-up user
  // who doesn't have one yet (legacy accounts predate ensure-on-signup, and
  // OAuth signups that didn't pass through the nickname step also start
  // without one). RPC only requires non-anonymous — display name is not a
  // prerequisite for code issuance.
  useEffect(() => {
    if (isAnon || friendCode) return;
    if (profile === null) return; // still loading
    let cancelled = false;
    (async () => {
      try {
        await ensureFriendCode();
        if (!cancelled) refreshDashboard().catch(() => { /* silent */ });
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [isAnon, friendCode, profile]);

  const inviteLink = friendCode ? `${INVITE_BASE_URL}${friendCode}` : '';
  const copyInviteCode = useCallback(async () => {
    if (!friendCode) return;
    haptic.tap();
    await Clipboard.setStringAsync(friendCode);
    showToast(t('dashboard.code_copied'), 'success');
  }, [friendCode, showToast, t]);
  const shareInvite = useCallback(async () => {
    if (!friendCode) return;
    haptic.tap();
    const message = t('dashboard.invite_message', {
      name: displayName ?? '',
      code: friendCode,
      link: inviteLink,
    });
    try {
      await Share.share({ message });
    } catch { /* user cancelled */ }
  }, [friendCode, displayName, inviteLink, t]);

  // Manual invite-code redemption: user pastes a code they received out of
  // band (the invite link wasn't tapped, or the deferred deep-link path
  // didn't fire). Mirrors invite/[code].tsx processFriendAndBonus.
  const submitInviteCode = useCallback(async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code || codeSubmitting) return;
    setCodeSubmitting(true);
    try {
      try {
        await addFriendByCode(code);
      } catch (e) {
        if (e instanceof FriendsError && (e.code === 'self' || e.code === 'not_found')) {
          throw e;
        }
        // already_friends / blocked / unknown — bonus claim still attempted.
      }
      const result = await applyReferral(code);
      await refreshBonusPremium();
      setShowEnterCode(false);
      setCodeInput('');
      refreshDashboard();
      if (result.granted) {
        showToast(t('invite.bonus_message', { days: result.bonusDays ?? 7 }), 'success');
      } else {
        showToast(t('invite.added_already_claimed'), 'success');
      }
    } catch (e) {
      let msg = t('invite.error_unknown');
      if (e instanceof FriendsError) {
        if (e.code === 'self') msg = t('invite.error_self');
        else if (e.code === 'not_found') msg = t('invite.error_not_found');
      }
      showToast(msg, 'error');
    } finally {
      setCodeSubmitting(false);
    }
  }, [codeInput, codeSubmitting, showToast, t]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <ActivityIndicator color="#2EC4A5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'bottom', 'left', 'right']}>
      <TabletContainer>
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
          <View className="h-11 flex-row items-center">
            <Pressable
              onPress={() => { haptic.tap(); router.back(); }}
              className="mr-2 p-1"
              accessibilityLabel={t('common.back')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
            </Pressable>
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">
              {t('friends.title')}
            </Text>
            <View className="flex-1" />
            {!isAnon ? (
              <Pressable
                onPress={() => setShowAddModal(true)}
                className="rounded-full bg-ink p-3 dark:bg-ink-dark"
                disabled={!hasUsername}
                accessibilityLabel={t('dashboard.add_friend')}
                accessibilityRole="button"
              >
                <MaterialIcons name="add" size={20} color={dark ? '#15130E' : '#F4F1EA'} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <FlatList
          data={isAnon ? [] : friends}
          keyExtractor={(f) => f.friendId}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                haptic.tap();
                setRefreshing(true);
                try {
                  await Promise.all([refreshDashboard(), reloadUnread()]);
                } finally {
                  setRefreshing(false);
                }
              }}
              tintColor="#2EC4A5"
              colors={['#2EC4A5']}
            />
          }
          ListHeaderComponent={
            <View className="px-6 pt-2">
              {!isAnon && friendCode ? (
                <View className="mb-5 rounded-[20px] border border-line bg-surface p-5 dark:border-line-dark dark:bg-surface-dark">
                  <View className="flex-row items-center">
                    <View className="rounded-full bg-accent-soft p-2 dark:bg-accent-soft-dark">
                      <MaterialIcons name="card-giftcard" size={20} color="#2EC4A5" />
                    </View>
                    <Text className="ml-3 flex-1 text-base font-semibold text-ink dark:text-ink-dark">
                      {t('dashboard.invite_card_title')}
                    </Text>
                  </View>
                  <Text className="mt-3 text-sm text-muted">
                    {t('dashboard.invite_card_hint')}
                  </Text>
                  <Pressable
                    onPress={copyInviteCode}
                    className="mt-4 items-center rounded-xl border border-line bg-canvas py-3 dark:border-line-dark dark:bg-canvas-dark"
                    accessibilityRole="button"
                    accessibilityLabel={t('common.copy')}
                  >
                    <Text className="text-xs text-muted">
                      {t('dashboard.my_code_label')}
                    </Text>
                    <Text className="mt-1 text-2xl font-bold tracking-[4px] text-ink dark:text-ink-dark">
                      {friendCode}
                    </Text>
                  </Pressable>
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      onPress={copyInviteCode}
                      className="flex-1 flex-row items-center justify-center rounded-xl border border-line py-3 dark:border-line-dark"
                      accessibilityRole="button"
                    >
                      <MaterialIcons name="content-copy" size={16} color="#7B7366" />
                      <Text className="ml-1.5 text-sm font-semibold text-ink dark:text-ink-dark">
                        {t('common.copy')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={shareInvite}
                      className="flex-1 flex-row items-center justify-center rounded-xl bg-ink py-3 dark:bg-ink-dark"
                      accessibilityRole="button"
                    >
                      <MaterialIcons name="share" size={16} color={dark ? '#15130E' : '#F4F1EA'} />
                      <Text className="ml-1.5 text-sm font-semibold text-canvas dark:text-canvas-dark">
                        {t('common.share')}
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => { haptic.tap(); setCodeInput(''); setShowEnterCode(true); }}
                    className="mt-3 items-center py-1"
                    accessibilityRole="button"
                  >
                    <Text className="text-xs text-muted underline">
                      {t('dashboard.have_invite_code')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <Text className="text-xl font-semibold text-ink dark:text-ink-dark">
                {t('dashboard.friends_count', { count: friends.length })}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => setShowActionMenu(item)}
              className="mx-6 mt-3 rounded-[20px] border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
            >
              <View className="flex-row items-center">
                <AvatarCircle
                  name={item.displayName}
                  backgroundId={item.equippedBackgroundId}
                  size={40}
                />
                <View className="ml-3 flex-1">
                  <Text className="text-base font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  {item.username ? (
                    <Text className="text-xs text-muted" numberOfLines={1}>
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
                  <MaterialIcons name="more-vert" size={22} color="#A79E90" />
                </Pressable>
              </View>
              {item.statsPublic ? (
                <View className="mt-3 flex-row items-center gap-2">
                  <StatChip icon="🔥" value={item.streakCurrent ?? 0} label={t('dashboard.stat_streak_short')} />
                  <StatChip icon="⭐" value={getLevel(item.xpTotal ?? 0).level} label="Lv" />
                </View>
              ) : (
                <Text className="mt-2 text-xs text-faint">{t('dashboard.stats_hidden')}</Text>
              )}
              <PokeButton
                friend={item}
                onSent={(name) => showToast(t('dashboard.poke_sent_toast', { name }), 'success')}
                onError={(msg) => showToast(msg, 'error')}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            isAnon ? (
              <View className="mt-8 mx-6 items-center rounded-[20px] border border-dashed border-line p-6 dark:border-line-dark">
                <MaterialIcons name="people-outline" size={40} color="#A79E90" />
                <Text className="mt-3 text-center text-base font-semibold text-ink dark:text-ink-dark">
                  {t('dashboard.signup_title')}
                </Text>
                <Text className="mt-1 text-center text-sm text-muted">
                  {t('dashboard.signup_message')}
                </Text>
                <Pressable
                  onPress={() => router.push('/auth')}
                  className="mt-4 rounded-xl bg-ink px-6 py-3 dark:bg-ink-dark"
                >
                  <Text className="text-sm font-semibold text-white dark:text-black">
                    {t('dashboard.signup_cta')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="mt-12 items-center px-8">
                <MaterialIcons name="people-outline" size={48} color="#A79E90" />
                <Text className="mt-3 text-center text-sm text-muted">
                  {t('dashboard.empty')}
                </Text>
              </View>
            )
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

      <Modal
        visible={showEnterCode}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEnterCode(false)}
      >
        <Pressable
          onPress={() => setShowEnterCode(false)}
          className="flex-1 items-center justify-center bg-black/50 px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="w-full max-w-md rounded-2xl bg-surface p-5 dark:bg-surface-dark"
          >
            <Text className="text-lg font-bold text-ink dark:text-ink-dark">
              {t('dashboard.enter_invite_code_cta')}
            </Text>
            <Text className="mt-1 text-sm text-muted">
              {t('dashboard.enter_invite_code_hint')}
            </Text>
            <TextInput
              value={codeInput}
              onChangeText={(v) => setCodeInput(v.toUpperCase())}
              placeholder={t('dashboard.enter_invite_code_placeholder')}
              placeholderTextColor="#A79E90"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              maxLength={12}
              className="mt-4 rounded-xl border border-line px-4 py-3 text-center text-xl font-bold tracking-[4px] text-ink dark:border-line-dark dark:text-ink-dark"
            />
            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => setShowEnterCode(false)}
                className="flex-1 items-center rounded-xl border border-line py-3 dark:border-line-dark"
              >
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={submitInviteCode}
                disabled={!codeInput.trim() || codeSubmitting}
                className={`flex-1 items-center rounded-xl py-3 ${
                  !codeInput.trim() || codeSubmitting ? 'bg-clay dark:bg-clay-dark' : 'bg-ink dark:bg-ink-dark'
                }`}
              >
                {codeSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className={`text-sm font-semibold ${
                    codeInput.trim() ? 'text-canvas dark:text-canvas-dark' : 'text-faint'
                  }`}>
                    {t('dashboard.add')}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
    haptic.tap();
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
      className="mt-3 flex-row items-center justify-center rounded-lg bg-ink px-3 py-2 dark:bg-ink-dark"
      accessibilityLabel={t('dashboard.poke')}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator size="small" color="#A79E90" />
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
                  backgroundColor: dark ? '#1E1B15' : '#FCFBF7',
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
                  <View className="h-1 w-10 rounded-full bg-line dark:bg-line-dark" />
                </View>
                <Text className="text-lg font-bold text-ink dark:text-ink-dark">
                  {friend.displayName}
                </Text>
                <Pressable onPress={() => onUnfriend(friend.friendId)} className="mt-4 flex-row items-center py-3">
                  <MaterialIcons name="person-remove" size={22} color="#7B7366" />
                  <Text className="ml-3 text-base text-ink dark:text-ink-dark">{t('dashboard.unfriend')}</Text>
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
                  <Text className="text-sm text-muted">{t('common.cancel')}</Text>
                </Pressable>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
