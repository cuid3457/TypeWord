import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Platform, Pressable, Text, View } from 'react-native';
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

/**
 * Aggregated notifications inbox — friend requests (incoming + outgoing
 * pending) and pokes (kept visible for 7 days, manually deletable).
 * Previously a modal; converted to a stack page so iOS doesn't show the
 * parent peeking out from behind the pageSheet sheet style.
 */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

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
      // Mark seen only when the user actually opens the inbox (focus). The
      // Realtime path must NOT mark seen — otherwise concurrent pokes get
      // marked seen between sends and poke-notify's unseen-count drops to 1
      // each time, freezing the launcher badge at 1.
      if (markSeen && hasUnseenPokes) {
        markPokesSeen().catch(() => { /* silent */ });
        // Optimistic local update so the badge useEffect drops immediately —
        // server seen state is set, but the merged array above still holds
        // the pre-mark seenAt values.
        const nowIso = new Date().toISOString();
        setItems((prev) => prev?.map((it) =>
          it.kind === 'poke_received' && it.seenAt === null
            ? { ...it, seenAt: nowIso }
            : it
        ) ?? null);
      }
    } catch {
      setItems([]);
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
  // iOS foreground push delivery proved unreliable, so we lean on
  // postgres_changes (mirrors the friendships subscription pattern).
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

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <View className="px-6 pt-6">
        <View className="h-11 flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="mr-2 p-1"
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>
          <Text className="text-base font-semibold text-black dark:text-white">
            {t('notifications.title')}
          </Text>
        </View>
      </View>

      {items === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6b7280" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="notifications-none" size={64} color="#9ca3af" />
          <Text className="mt-4 text-center text-base font-semibold text-gray-500 dark:text-gray-400">
            {t('notifications.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.kind === 'poke_received' ? `poke_${it.pokeId}` : `${it.kind}_${it.userId}`}
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          renderItem={({ item }) => {
            const isNewPoke = item.kind === 'poke_received' && item.seenAt === null;
            return (
              <View
                className={
                  isNewPoke
                    ? 'mb-3 flex-row items-center rounded-2xl p-3'
                    : 'mb-3 flex-row items-center rounded-2xl border border-gray-300 p-3 dark:border-gray-700'
                }
                style={isNewPoke ? { borderWidth: 1, borderColor: '#2EC4A5', backgroundColor: '#2EC4A510' } : undefined}
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800">
                  <Text className="text-base font-bold text-gray-600 dark:text-gray-300">
                    {(item.displayName || item.username).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  {item.displayName ? (
                    <Text className="text-sm font-semibold text-black dark:text-white" numberOfLines={1}>
                      {item.displayName}
                    </Text>
                  ) : null}
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    @{item.username}
                  </Text>
                  <Text className="mt-0.5 text-xs text-gray-400" numberOfLines={1}>
                    {item.kind === 'friend_request_incoming'
                      ? t('notifications.incoming_label')
                      : item.kind === 'friend_request_outgoing'
                        ? t('notifications.outgoing_label')
                        : t('notifications.poke_label')}
                  </Text>
                </View>
                {item.kind === 'friend_request_incoming' ? (
                  <View className="flex-row gap-1.5">
                    <Pressable
                      onPress={() => accept(item)}
                      disabled={busyId !== null}
                      className="rounded-lg p-2"
                      style={{ backgroundColor: '#2EC4A5' }}
                      accessibilityLabel={t('dashboard.accept')}
                      accessibilityRole="button"
                    >
                      {busyId === item.userId + '_a' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <MaterialIcons name="check" size={18} color="#fff" />
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => reject(item)}
                      disabled={busyId !== null}
                      className="rounded-lg bg-red-500 p-2"
                      accessibilityLabel={t('dashboard.cancel_request')}
                      accessibilityRole="button"
                    >
                      <MaterialIcons name="close" size={18} color="#fff" />
                    </Pressable>
                  </View>
                ) : item.kind === 'friend_request_outgoing' ? (
                  <Pressable
                    onPress={() => cancel(item)}
                    disabled={busyId !== null}
                    className="rounded-lg bg-red-500 p-2"
                    accessibilityLabel={t('dashboard.cancel_request')}
                    accessibilityRole="button"
                  >
                    {busyId === item.userId + '_c' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons name="close" size={18} color="#fff" />
                    )}
                  </Pressable>
                ) : (
                  <View className="flex-row gap-1.5">
                    <Pressable
                      onPress={() => pokeBack(item.pokeId, item.userId, item.displayName || item.username)}
                      disabled={busyId !== null}
                      className="rounded-lg bg-black p-2 dark:bg-white"
                      accessibilityLabel={t('dashboard.poke')}
                      accessibilityRole="button"
                    >
                      {busyId === `p_${item.pokeId}_p` ? (
                        <ActivityIndicator size="small" color="#9ca3af" />
                      ) : (
                        <Text className="text-base leading-[18px]">👉</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => removePoke(item.pokeId)}
                      disabled={busyId !== null}
                      className="rounded-lg bg-red-500 p-2"
                      accessibilityLabel={t('common.delete')}
                      accessibilityRole="button"
                    >
                      {busyId === `p_${item.pokeId}_d` ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <MaterialIcons name="delete-outline" size={18} color="#fff" />
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
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
