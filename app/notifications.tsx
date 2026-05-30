import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  deletePoke,
  FriendsError,
  listIncomingRequests,
  listOutgoingRequests,
  listRecentPokes,
  markPokesSeen,
  rejectFriendRequest,
  sendPoke,
  subscribePokesForUser,
  type FriendRequest,
} from '@src/services/friendsService';
import { haptic } from '@src/services/hapticService';
import { supabase } from '@src/api/supabase';

type Notification =
  | { kind: 'friend_request_incoming'; userId: string; username: string; displayName: string; createdAt: string }
  | { kind: 'friend_request_outgoing'; userId: string; username: string; displayName: string; createdAt: string }
  | { kind: 'poke_received'; pokeId: number; userId: string; username: string; displayName: string; createdAt: string; seenAt: string | null };

type PokeNotification = Extract<Notification, { kind: 'poke_received' }>;

/**
 * Aggregated notifications inbox — friend requests (incoming + outgoing
 * pending) and pokes (kept visible for 7 days, manually deletable).
 */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (markSeen: boolean) => {
    try {
      const [incoming, outgoing, pokes] = await Promise.all([
        listIncomingRequests(),
        listOutgoingRequests(),
        listRecentPokes(),
      ]);
      const hasUnseenPokes = pokes.some((p) => !p.seenAt);
      const merged: Notification[] = [
        ...incoming.map((r): Notification => ({ kind: 'friend_request_incoming', ...r })),
        ...outgoing.map((r): Notification => ({ kind: 'friend_request_outgoing', ...r })),
        ...pokes.map((r): Notification => ({
          kind: 'poke_received',
          pokeId: r.id,
          userId: r.userId,
          username: r.username,
          displayName: r.displayName,
          createdAt: r.createdAt,
          seenAt: r.seenAt,
        })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(merged);
      setError(null);
      // Mark seen only when the user actually opens the inbox (focus). The
      // Realtime path must NOT mark seen — otherwise concurrent pokes get
      // marked seen between sends and poke-notify's unseen-count drops to 1
      // each time, freezing the launcher badge at 1.
      if (markSeen && hasUnseenPokes) {
        markPokesSeen().catch(() => { /* silent */ });
        const nowIso = new Date().toISOString();
        setItems((prev) => prev?.map((it) =>
          it.kind === 'poke_received' && it.seenAt === null
            ? { ...it, seenAt: nowIso }
            : it
        ) ?? null);
      }
    } catch (e) {
      setItems([]);
      setError(e instanceof Error && e.message ? e.message : 'unknown');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setItems(null);
    reload(true);
  }, [reload]));

  // OS app icon badge — mirror inbox composition. iOS only; Android's
  // launcher badge is disabled at the channel level (see notificationService).
  useEffect(() => {
    if (items === null) return;
    if (Platform.OS === 'android') return;
    const count = items.filter((n) =>
      n.kind === 'friend_request_incoming'
      || (n.kind === 'poke_received' && n.seenAt === null)
    ).length;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        await Notifications.setBadgeCountAsync(count);
      } catch { /* silent */ }
    })();
  }, [items]);

  // Realtime: new pokes addressed to me pop in without a manual refresh.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || session?.user?.is_anonymous || cancelled) return;
      unsub = subscribePokesForUser(uid, () => { reload(false); });
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [reload]);

  const accept = async (item: FriendRequest) => {
    if (busyId) return;
    haptic.success();
    setBusyId(item.userId + '_a');
    try {
      await acceptFriendRequest(item.userId);
      setItems((prev) => (prev ?? []).filter((n) => !(n.kind === 'friend_request_incoming' && n.userId === item.userId)));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: FriendRequest) => {
    if (busyId) return;
    haptic.selection();
    setBusyId(item.userId + '_r');
    try {
      await rejectFriendRequest(item.userId);
      setItems((prev) => (prev ?? []).filter((n) => !(n.kind === 'friend_request_incoming' && n.userId === item.userId)));
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (item: FriendRequest) => {
    if (busyId) return;
    haptic.selection();
    setBusyId(item.userId + '_c');
    try {
      await cancelFriendRequest(item.userId);
      setItems((prev) => (prev ?? []).filter((n) => !(n.kind === 'friend_request_outgoing' && n.userId === item.userId)));
    } finally {
      setBusyId(null);
    }
  };

  const removePoke = async (pokeId: number) => {
    if (busyId) return;
    haptic.selection();
    setBusyId(`p_${pokeId}_d`);
    try {
      await deletePoke(pokeId);
      setItems((prev) => (prev ?? []).filter((n) => !(n.kind === 'poke_received' && n.pokeId === pokeId)));
    } finally {
      setBusyId(null);
    }
  };

  const pokeBack = async (pokeId: number, userId: string, name: string) => {
    if (busyId) return;
    haptic.tap();
    setBusyId(`p_${pokeId}_p`);
    try {
      await sendPoke(userId);
      deletePoke(pokeId).catch(() => { /* silent — UI already removed */ });
      setItems((prev) => (prev ?? []).filter((n) => !(n.kind === 'poke_received' && n.pokeId === pokeId)));
      setToast({ msg: t('dashboard.poke_sent_toast', { name }), type: 'success' });
    } catch (e) {
      if (e instanceof FriendsError) {
        if (e.code === 'cooldown') setToast({ msg: t('dashboard.poke_cooldown'), type: 'error' });
        else if (e.code === 'not_friends') setToast({ msg: t('dashboard.poke_not_friends'), type: 'error' });
        else setToast({ msg: t('error.title'), type: 'error' });
      } else {
        setToast({ msg: t('error.title'), type: 'error' });
      }
    } finally {
      setBusyId(null);
    }
  };

  const requests = (items ?? []).filter(
    (n) => n.kind === 'friend_request_incoming' || n.kind === 'friend_request_outgoing',
  );
  const pokes = (items ?? []).filter((n): n is PokeNotification => n.kind === 'poke_received');

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
        {/* App bar */}
        <View style={{ paddingTop: 24, paddingHorizontal: 24 }}>
          <View className="mb-4 h-11 flex-row items-center">
            <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button" hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
            </Pressable>
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">{t('notifications.title')}</Text>
          </View>
        </View>

        {items === null ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2EC4A5" />
          </View>
        ) : error && items.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10" style={{ paddingBottom: 64 }}>
            <MaterialIcons name="error-outline" size={48} color="#A79E90" />
            <Text className="mt-4 text-center text-xl font-bold text-ink dark:text-ink-dark">
              {t('error.title')}
            </Text>
            <Text className="mt-2 text-center text-sm text-muted">
              {t('error.message')}
            </Text>
            {error !== 'unknown' ? (
              <Text className="mt-2 text-center text-xs text-faint" numberOfLines={3}>
                {error}
              </Text>
            ) : null}
            <Pressable
              onPress={() => { setItems(null); reload(true); }}
              className="mt-8 items-center rounded-xl bg-ink px-8 py-4 dark:bg-ink-dark"
            >
              <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
                {t('error.retry')}
              </Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8" style={{ paddingBottom: 64 }}>
            <View className="h-36 w-36 items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
              <Image source={require('../assets/images/android-icon-foreground.png')} style={{ width: 108, height: 108 }} resizeMode="contain" />
            </View>
            <Text className="mt-5 text-lg font-bold text-ink dark:text-ink-dark">{t('notifications.empty')}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 80 }}>
            {requests.length > 0 ? (
              <>
                <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink dark:text-ink-dark">
                  {t('dashboard.incoming_requests')} {requests.length}
                </Text>
                <View className="gap-2.5">
                  {requests.map((item) => (
                    <View
                      key={`${item.kind}_${item.userId}`}
                      className="flex-row items-center gap-3 rounded-[16px] border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark"
                    >
                      <Avatar name={item.displayName || item.username} />
                      <View className="flex-1">
                        {item.displayName ? (
                          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>{item.displayName}</Text>
                        ) : null}
                        <Text className="text-xs text-muted" numberOfLines={1}>
                          @{item.username} · {item.kind === 'friend_request_incoming' ? t('notifications.incoming_label') : t('notifications.outgoing_label')}
                        </Text>
                      </View>
                      {item.kind === 'friend_request_incoming' ? (
                        <View className="flex-row items-center gap-2">
                          <Pressable onPress={() => accept(item)} disabled={busyId !== null} className="h-[38px] w-[38px] items-center justify-center rounded-full bg-accent" accessibilityLabel={t('dashboard.accept')} accessibilityRole="button">
                            {busyId === item.userId + '_a' ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="check" size={18} color="#fff" />}
                          </Pressable>
                          <Pressable onPress={() => reject(item)} disabled={busyId !== null} className="h-[38px] w-[38px] items-center justify-center rounded-full bg-clay dark:bg-clay-dark" accessibilityLabel={t('dashboard.cancel_request')} accessibilityRole="button">
                            <MaterialIcons name="close" size={18} color="#7B7366" />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable onPress={() => cancel(item)} disabled={busyId !== null} className="rounded-[12px] border border-line bg-surface px-3.5 py-2 dark:border-line-dark dark:bg-surface-dark" accessibilityRole="button">
                          {busyId === item.userId + '_c' ? <ActivityIndicator size="small" color="#7B7366" /> : <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{t('dashboard.cancel_request')}</Text>}
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {pokes.length > 0 ? (
              <>
                <Text className={`mb-2 text-[11px] font-bold uppercase tracking-wider text-ink dark:text-ink-dark ${requests.length > 0 ? 'mt-6' : ''}`}>
                  {t('dashboard.poke')} {pokes.length}
                </Text>
                <View className="gap-2.5">
                  {pokes.map((item) => {
                    const isNew = item.seenAt === null;
                    return (
                      <View
                        key={`poke_${item.pokeId}`}
                        className={`flex-row items-center gap-3 rounded-[16px] border p-3.5 ${isNew ? 'border-accent bg-accent-soft dark:border-accent dark:bg-accent-soft-dark' : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark'}`}
                      >
                        <Avatar name={item.displayName || item.username} />
                        <View className="flex-1">
                          {item.displayName ? (
                            <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>{item.displayName} 👉</Text>
                          ) : null}
                          <Text className={`text-xs ${isNew ? 'text-accent-deep' : 'text-muted'}`} numberOfLines={1}>
                            @{item.username} · {t('notifications.poke_label')}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <Pressable onPress={() => pokeBack(item.pokeId, item.userId, item.displayName || item.username)} disabled={busyId !== null} className="h-[38px] w-[38px] items-center justify-center rounded-full bg-ink dark:bg-ink-dark" accessibilityLabel={t('dashboard.poke')} accessibilityRole="button">
                            {busyId === `p_${item.pokeId}_p` ? <ActivityIndicator size="small" color="#A79E90" /> : <Text className="text-base leading-[18px]">👉</Text>}
                          </Pressable>
                          <Pressable onPress={() => removePoke(item.pokeId)} disabled={busyId !== null} className="h-[38px] w-[38px] items-center justify-center rounded-full bg-clay dark:bg-clay-dark" accessibilityLabel={t('common.delete')} accessibilityRole="button">
                            {busyId === `p_${item.pokeId}_d` ? <ActivityIndicator size="small" color="#7B7366" /> : <MaterialIcons name="delete-outline" size={18} color="#7B7366" />}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </TabletContainer>
      <Toast
        visible={!!toast}
        message={toast?.msg ?? ''}
        type={toast?.type ?? 'error'}
        onHide={() => setToast(null)}
        style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }}
      />
    </SafeAreaView>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-clay dark:bg-clay-dark">
      <Text className="text-base font-bold text-muted">{(name || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}
