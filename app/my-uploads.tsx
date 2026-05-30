import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { AppModal } from '@/components/app-modal';
import {
  deleteCommunityWordlist,
  listMyUploads,
  type CommunityWordlistMeta,
} from '@src/services/communityWordlistService';
import { haptic } from '@src/services/hapticService';

/**
 * "My uploaded community wordlists" inbox — previously a pageSheet modal,
 * converted to a stack page so iOS doesn't leak the parent library tab
 * behind the sheet edge.
 */
export default function MyUploadsScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CommunityWordlistMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunityWordlistMeta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(() => {
    listMyUploads()
      .then((data) => {
        setItems(data);
        setLoadError(false);
      })
      .catch(() => {
        setItems([]);
        setLoadError(true);
      });
  }, []);

  const handlePullRefresh = useCallback(async () => {
    haptic.tap();
    setRefreshing(true);
    try {
      const data = await listMyUploads();
      setItems(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setItems(null);
    setLoadError(false);
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
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top']}>
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
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            {t('library_tab.my_uploads')}
          </Text>
        </View>
      </View>

      {items === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7B7366" />
        </View>
      ) : loadError && items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <MaterialIcons name="error-outline" size={48} color="#A79E90" />
          <Text className="mt-4 text-xl font-bold text-ink dark:text-ink-dark">
            {t('error.title')}
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            {t('error.message')}
          </Text>
          <Pressable
            onPress={() => {
              haptic.tap();
              setItems(null);
              setLoadError(false);
              reload();
            }}
            className="mt-8 items-center rounded-xl bg-ink px-8 py-4 dark:bg-ink-dark"
            accessibilityRole="button"
            accessibilityLabel={t('error.retry')}
          >
            <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
              {t('error.retry')}
            </Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="cloud-upload" size={64} color="#A79E90" />
          <Text className="mt-4 text-center text-base font-semibold text-muted">
            {t('library_tab.my_uploads_empty')}
          </Text>
          <Text className="mt-2 text-center text-sm text-faint">
            {t('library_tab.my_uploads_empty_hint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} tintColor="#1E9E84" colors={['#1E9E84']} />
          }
          renderItem={({ item }) => (
            <View className="mb-2 rounded-xl border border-line px-4 py-4 dark:border-line-dark">
              <Pressable onPress={() => router.push(`/community-detail/${item.id}`)}>
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-base font-medium text-ink dark:text-ink-dark" numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <View className="ml-3 rounded-full bg-clay px-3 py-1 dark:bg-clay-dark">
                    <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                      {t('home.word_count', { count: item.wordCount })}
                    </Text>
                  </View>
                </View>
              </Pressable>
              <View className="mt-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => router.push(`/community-detail/${item.id}?edit=1`)}
                    className="rounded-lg bg-clay p-2 dark:bg-clay-dark"
                    accessibilityLabel={t('library_tab.edit_action')}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="edit" size={18} color="#7B7366" />
                  </Pressable>
                  <Pressable
                    onPress={() => setDeleteTarget(item)}
                    className="rounded-lg bg-danger p-2"
                    accessibilityLabel={t('library_tab.delete_action')}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="delete-outline" size={18} color="#fff" />
                  </Pressable>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center">
                    <MaterialIcons name="favorite" size={12} color="#E0654F" />
                    <Text className="ml-1 text-xs text-muted">{item.likesCount}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <MaterialIcons name="download" size={12} color="#7B7366" />
                    <Text className="ml-1 text-xs text-muted">{item.downloadsCount}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}
      </TabletContainer>

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
