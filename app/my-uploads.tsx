import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppModal } from '@/components/app-modal';
import {
  deleteCommunityWordlist,
  listMyUploads,
  type CommunityWordlistMeta,
} from '@src/services/communityWordlistService';

/**
 * "My uploaded community wordlists" inbox — previously a pageSheet modal,
 * converted to a stack page so iOS doesn't leak the parent library tab
 * behind the sheet edge.
 */
export default function MyUploadsScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CommunityWordlistMeta[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityWordlistMeta | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(() => {
    listMyUploads().then(setItems).catch(() => setItems([]));
  }, []);

  useFocusEffect(useCallback(() => {
    setItems(null);
    reload();
  }, [reload]));

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteCommunityWordlist(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } finally {
      setDeleting(false);
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
            {t('library_tab.my_uploads')}
          </Text>
        </View>
      </View>

      {items === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6b7280" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="cloud-upload" size={64} color="#9ca3af" />
          <Text className="mt-4 text-center text-base font-semibold text-gray-500 dark:text-gray-400">
            {t('library_tab.my_uploads_empty')}
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('library_tab.my_uploads_empty_hint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          renderItem={({ item }) => (
            <View className="mb-2 rounded-xl border border-gray-300 px-4 py-4 dark:border-gray-700">
              <Pressable onPress={() => router.push(`/community-detail/${item.id}`)}>
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-base font-medium text-black dark:text-white" numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <View className="ml-3 rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                    <Text className="text-sm font-semibold text-black dark:text-white">
                      {t('home.word_count', { count: item.wordCount })}
                    </Text>
                  </View>
                </View>
              </Pressable>
              <View className="mt-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => router.push(`/community-detail/${item.id}?edit=1`)}
                    className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800"
                    accessibilityLabel={t('library_tab.edit_action')}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="edit" size={18} color="#6b7280" />
                  </Pressable>
                  <Pressable
                    onPress={() => setDeleteTarget(item)}
                    className="rounded-lg bg-red-500 p-2"
                    accessibilityLabel={t('library_tab.delete_action')}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="delete-outline" size={18} color="#fff" />
                  </Pressable>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center">
                    <MaterialIcons name="favorite" size={12} color="#ef4444" />
                    <Text className="ml-1 text-xs text-gray-500">{item.likesCount}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <MaterialIcons name="download" size={12} color="#6b7280" />
                    <Text className="ml-1 text-xs text-gray-500">{item.downloadsCount}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <AppModal
        visible={!!deleteTarget}
        title={t('library_tab.delete_confirm_title')}
        message={t('library_tab.delete_confirm_message')}
        buttonText={t('settings.cancel')}
        confirmText={t('library_tab.delete_action')}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
        destructive
      />
    </SafeAreaView>
  );
}
