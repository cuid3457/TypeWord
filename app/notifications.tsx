import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  acceptFriendRequest,
  cancelFriendRequest,
  deletePoke,
  listIncomingRequests,
  listOutgoingRequests,
  listRecentPokes,
  markPokesSeen,
  rejectFriendRequest,
  type FriendRequest,
} from '@src/services/friendsService';

type Notification =
  | { kind: 'friend_request_incoming'; userId: string; username: string; displayName: string; createdAt: string }
  | { kind: 'friend_request_outgoing'; userId: string; username: string; displayName: string; createdAt: string }
  | { kind: 'poke_received'; userId: string; username: string; displayName: string; createdAt: string; seenAt: string | null };

/**
 * Aggregated notifications inbox — friend requests (incoming + outgoing
 * pending) and pokes (kept visible for 7 days, manually deletable).
 * Previously a modal; converted to a stack page so iOS doesn't show the
 * parent peeking out from behind the pageSheet sheet style.
 */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
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
        ...pokes.map((r): Notification => ({ kind: 'poke_received', ...r })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(merged);
      // Mark all received pokes as seen so the bell badge clears, but keep
      // the items themselves visible until the user deletes them or the
      // 7-day server retention sweeps them.
      if (hasUnseenPokes) {
        markPokesSeen().catch(() => { /* silent */ });
      }
    } catch {
      setItems([]);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setItems(null);
    reload();
  }, [reload]));

  const accept = async (item: FriendRequest) => {
    if (busyId) return;
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
    setBusyId(item.userId + '_c');
    try {
      await cancelFriendRequest(item.userId);
      setItems((prev) => (prev ?? []).filter((n) => !(n.kind === 'friend_request_outgoing' && n.userId === item.userId)));
    } finally {
      setBusyId(null);
    }
  };

  const removePoke = async (userId: string) => {
    if (busyId) return;
    setBusyId(userId + '_d');
    try {
      await deletePoke(userId);
      setItems((prev) => (prev ?? []).filter((n) => !(n.kind === 'poke_received' && n.userId === userId)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
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
          <Text className="mt-2 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('notifications.empty_hint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.kind}_${it.userId}`}
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          renderItem={({ item }) => {
            const isSeenPoke = item.kind === 'poke_received' && item.seenAt !== null;
            return (
              <View className={`mb-3 flex-row items-center rounded-2xl border p-3 ${isSeenPoke ? 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40' : 'border-gray-300 dark:border-gray-700'}`}>
                <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800">
                  <Text className={`text-base font-bold ${isSeenPoke ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>
                    {(item.displayName || item.username).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  {item.displayName ? (
                    <Text className={`text-sm font-semibold ${isSeenPoke ? 'text-gray-500 dark:text-gray-400' : 'text-black dark:text-white'}`} numberOfLines={1}>
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
                  <Pressable
                    onPress={() => removePoke(item.userId)}
                    disabled={busyId !== null}
                    className="rounded-lg bg-gray-300 p-2 dark:bg-gray-700"
                    accessibilityLabel={t('common.delete')}
                    accessibilityRole="button"
                  >
                    {busyId === item.userId + '_d' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons name="close" size={18} color="#fff" />
                    )}
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
