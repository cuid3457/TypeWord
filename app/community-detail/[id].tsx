import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { TargetReportModal } from '@/components/target-report-modal';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Toast } from '@/components/toast';
import { findLanguage } from '@src/constants/languages';
import { supabase } from '@src/api/supabase';
import { blockUser } from '@src/services/friendsService';
import {
  CommunityUploadError,
  UPLOAD_ERROR,
  downloadCommunityWordlist,
  editCommunityWordlist,
  getCommunityWordlist,
  isCommunityWordlistLiked,
  toggleCommunityWordlistLike,
  type CommunityWordlistFull,
} from '@src/services/communityWordlistService';
import { ipaSupported } from '@src/services/ipaService';

/**
 * Community wordlist detail — previously a pageSheet modal, now a stack
 * page so iOS doesn't leak the parent screen behind the sheet edge. The
 * route accepts `?edit=1` to land in edit mode (used by my-uploads).
 */
export default function CommunityDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; edit?: string }>();
  const wordlistId = params.id;
  const initialEditMode = params.edit === '1';

  const [data, setData] = useState<CommunityWordlistFull | null>(null);
  const [liked, setLiked] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [busyLike, setBusyLike] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Report / block menu — App Store Guideline 1.2 requires UGC apps to
  // expose both content reporting and user reporting/blocking. flag-only
  // wouldn't be enough since a viewer might not be friends with the
  // uploader and thus couldn't block them otherwise.
  const [showMenu, setShowMenu] = useState(false);
  const [reportKind, setReportKind] = useState<'wordlist' | 'user' | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const handlePullRefresh = async () => {
    if (!wordlistId) return;
    setRefreshing(true);
    try {
      const [w, l] = await Promise.all([
        getCommunityWordlist(wordlistId),
        isCommunityWordlistLiked(wordlistId),
      ]);
      if (w) setData(w);
      setLiked(l);
    } finally {
      setRefreshing(false);
    }
  };
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  useEffect(() => {
    if (!wordlistId) return;
    Promise.all([
      getCommunityWordlist(wordlistId),
      isCommunityWordlistLiked(wordlistId),
      supabase.auth.getSession().then((s) => s.data.session?.user?.id ?? null),
    ]).then(([w, l, uid]) => {
      setData(w);
      setLiked(l);
      setCurrentUserId(uid);
      if (w) {
        setEditTitle(w.title);
        setEditDescription(w.description ?? '');
        if (initialEditMode) setEditing(true);
      }
    });
  }, [wordlistId, initialEditMode]);

  const isOwner = !!(data && currentUserId && data.userId === currentUserId);
  const sourceLang = data ? findLanguage(data.sourceLang) : null;
  const targetLang = data ? findLanguage(data.targetLang) : null;

  const handleLike = async () => {
    if (!wordlistId || busyLike) return;
    setBusyLike(true);
    try {
      const newLiked = await toggleCommunityWordlistLike(wordlistId);
      setLiked(newLiked);
      if (data) {
        setData({
          ...data,
          likesCount: Math.max(0, data.likesCount + (newLiked ? 1 : -1)),
        });
      }
    } catch { /* ignore */ }
    finally { setBusyLike(false); }
  };

  const handleDownload = async () => {
    if (!wordlistId || downloading) return;
    setDownloading(true);
    setDownloadProgress({ current: 0, total: data?.wordCount ?? 0 });
    try {
      const { bookId } = await downloadCommunityWordlist(wordlistId, (p) => {
        setDownloadProgress(p);
      });
      // Replace this page with the downloaded wordlist so back returns to
      // the library tab (instead of this detail page).
      router.replace(`/wordlist/${bookId}`);
    } catch (e) {
      showToast((e as Error).message || t('library_tab.upload_error'));
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!wordlistId || !data || savingEdit) return;
    const title = editTitle.trim();
    if (!title) return;
    setSavingEdit(true);
    try {
      await editCommunityWordlist({
        id: wordlistId,
        title,
        description: editDescription.trim() || undefined,
      });
      setData({ ...data, title, description: editDescription.trim() || null });
      setEditing(false);
    } catch (e) {
      if (e instanceof CommunityUploadError) {
        switch (e.code) {
          case UPLOAD_ERROR.BLOCKLIST:
            showToast(t(e.field === 'description'
              ? 'library_tab.upload_blocked_description'
              : 'library_tab.upload_blocked_title'));
            break;
          case UPLOAD_ERROR.MODERATION:
            if (e.field === 'description') {
              showToast(t('library_tab.upload_blocked_description'));
            } else if (e.field === 'title') {
              showToast(t('library_tab.upload_blocked_title'));
            } else {
              showToast(t('library_tab.upload_blocked_moderation'));
            }
            break;
          default:
            showToast(e.message || t('library_tab.upload_error'));
        }
      } else {
        showToast((e as Error).message || t('library_tab.upload_error'));
      }
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <View className="px-6 pt-6">
        <View className="h-11 flex-row items-center justify-between">
          <Pressable
            onPress={editing ? () => setEditing(false) : () => router.back()}
            className="p-1"
            accessibilityLabel={editing ? t('settings.cancel') : t('common.back')}
            accessibilityRole="button"
          >
            <MaterialIcons name={editing ? 'close' : 'arrow-back'} size={24} color="#6b7280" />
          </Pressable>
          {!editing && data && !isOwner ? (
            <Pressable
              onPress={() => setShowMenu(true)}
              className="p-2"
              accessibilityLabel={t('common.more')}
              accessibilityRole="button"
            >
              <MaterialIcons name="more-vert" size={22} color="#6b7280" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!data ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6b7280" />
        </View>
      ) : editing ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            {t('library_tab.title_label')}
          </Text>
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            maxLength={80}
            className="mt-1 rounded-xl border border-gray-300 px-3 py-2 text-base text-black dark:border-gray-700 dark:text-white"
          />
          <Text className="mt-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
            {t('library_tab.description_label')}
          </Text>
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
            maxLength={300}
            className="mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-black dark:border-gray-700 dark:text-white"
            style={{ minHeight: 60 }}
          />
        </ScrollView>
      ) : (
        <>
          <View className="px-6 pt-2">
            <View className="flex-row items-center">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <MaterialIcons name="groups" size={22} color="#6b7280" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-2xl font-bold text-black dark:text-white" numberOfLines={2}>
                  {data.title}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  {data.uploaderName ? `@${data.uploaderName} · ` : ''}
                  {data.wordCount}{t('library.words_suffix')}
                </Text>
                {sourceLang && targetLang ? (
                  <Text className="mt-0.5 text-xs text-gray-500">
                    {t(`languages.${data.sourceLang}`)} {sourceLang.flag} → {t(`languages.${data.targetLang}`)} {targetLang.flag}
                  </Text>
                ) : null}
              </View>
            </View>

            {data.description ? (
              <Text className="mt-3 text-sm text-gray-500">{data.description}</Text>
            ) : null}

            <View className="mt-3 flex-row items-center gap-2">
              <Pressable
                onPress={handleLike}
                disabled={busyLike}
                className="flex-row items-center rounded-xl bg-gray-100 px-3 py-1.5 dark:bg-gray-800"
              >
                <MaterialIcons
                  name={liked ? 'favorite' : 'favorite-border'}
                  size={16}
                  color={liked ? '#ef4444' : '#6b7280'}
                />
                <Text className="ml-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  {data.likesCount}
                </Text>
              </Pressable>
              <View className="flex-row items-center rounded-xl bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
                <MaterialIcons name="download" size={16} color="#6b7280" />
                <Text className="ml-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  {data.downloadsCount}
                </Text>
              </View>
            </View>
          </View>

          <View className="px-6 pt-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('library.preview')}
            </Text>
          </View>

          <FlatList
            className="flex-1"
            data={data.words.slice(0, 20)}
            keyExtractor={(w, i) => `${w.word}-${w.readingKey ?? ''}-${i}`}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} tintColor="#10b981" colors={['#10b981']} />
            }
            renderItem={({ item }) => {
              const definition = item.result?.meanings?.[0]?.definition ?? '';
              const reading = item.result?.reading;
              const readingDisplay = Array.isArray(reading) ? reading.join(', ') : reading;
              return (
                <View className="border-b border-gray-100 py-3 dark:border-gray-800">
                  <View className="flex-row items-baseline">
                    <Text className="text-base font-semibold text-black dark:text-white">{item.word}</Text>
                    {readingDisplay ? (
                      <Text className="ml-2 text-xs text-gray-400">{readingDisplay}</Text>
                    ) : null}
                    {item.result?.ipa && data && ipaSupported(data.sourceLang) ? (
                      <Text className="ml-2 text-xs text-gray-400">{item.result.ipa}</Text>
                    ) : null}
                  </View>
                  {definition ? (
                    <Text className="mt-1 text-sm text-gray-500" numberOfLines={2}>
                      {definition}
                    </Text>
                  ) : null}
                </View>
              );
            }}
            ListFooterComponent={
              data.words.length > 20 ? (
                <Text className="mt-4 text-center text-sm text-gray-400">
                  {t('library.preview_more', { count: data.words.length - 20 })}
                </Text>
              ) : null
            }
          />
        </>
      )}

      {data && !editing ? (
        <View
          className="border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-black"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
          <View className="px-6 pt-4">
            <Pressable
              onPress={handleDownload}
              disabled={downloading}
              className="items-center rounded-xl bg-black py-4 dark:bg-white"
            >
              {downloading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text className="text-base font-semibold text-white dark:text-black">
                    {downloadProgress
                      ? t('library.adding_progress', { current: downloadProgress.current, total: downloadProgress.total })
                      : t('library.adding')}
                  </Text>
                </View>
              ) : (
                <Text className="text-base font-semibold text-white dark:text-black">
                  {t('library_tab.download_button')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {data && editing ? (
        <View
          className="border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-black"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
          <View className="px-6 pt-4">
            <Pressable
              onPress={handleSaveEdit}
              disabled={savingEdit || !editTitle.trim()}
              className={`items-center rounded-xl py-4 ${savingEdit || !editTitle.trim() ? 'bg-gray-300 dark:bg-gray-700' : 'bg-black dark:bg-white'}`}
            >
              {savingEdit ? (
                <ActivityIndicator color="#6b7280" />
              ) : (
                <Text className="text-base font-semibold text-white dark:text-black">
                  {t('library_tab.save_action')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
      </TabletContainer>

      <ReportBlockMenu
        visible={showMenu && !!data}
        title={data?.title ?? ''}
        onClose={() => setShowMenu(false)}
        onReportWordlist={() => { setShowMenu(false); setReportKind('wordlist'); }}
        onReportUser={() => { setShowMenu(false); setReportKind('user'); }}
        onBlock={async () => {
          setShowMenu(false);
          if (!data) return;
          try {
            await blockUser(data.userId);
            showToast(t('dashboard.blocked'));
            // RLS hides this uploader's content on next focus refresh;
            // bounce back so the user doesn't keep staring at the now-
            // blocked uploader's page.
            setTimeout(() => router.back(), 600);
          } catch { /* silent */ }
        }}
      />

      <TargetReportModal
        visible={reportKind !== null}
        target={
          data && reportKind === 'wordlist'
            ? { kind: 'wordlist', id: data.id, title: data.title }
            : data && reportKind === 'user'
              ? { kind: 'user', id: data.userId, label: data.uploaderName ?? '@' }
              : null
        }
        onClose={() => setReportKind(null)}
        onSubmitted={() => {
          setReportKind(null);
          showToast(t('report.submitted'));
        }}
      />


      <Toast
        message={toastMsg}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }}
      />
    </SafeAreaView>
  );
}

/**
 * Bottom-sheet action menu mirroring the dashboard's friend ActionMenu —
 * same drag-to-dismiss + slide-up animation. Three actions: report
 * wordlist (neutral), report user (red), block user (red).
 */
function ReportBlockMenu({
  visible,
  title,
  onClose,
  onReportWordlist,
  onReportUser,
  onBlock,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onReportWordlist: () => void;
  onReportUser: () => void;
  onBlock: () => void;
}) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
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

  if (!visible) return null;
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
                <Text className="text-lg font-bold text-black dark:text-white" numberOfLines={1}>
                  {title}
                </Text>
                <Pressable onPress={onReportWordlist} className="mt-4 flex-row items-center py-3">
                  <MaterialIcons name="flag" size={22} color="#6b7280" />
                  <Text className="ml-3 text-base text-black dark:text-white">
                    {t('report.title_wordlist')}
                  </Text>
                </Pressable>
                <Pressable onPress={onReportUser} className="flex-row items-center py-3">
                  <MaterialIcons name="flag" size={22} color="#ef4444" />
                  <Text className="ml-3 text-base text-red-500">{t('report.title_user')}</Text>
                </Pressable>
                <Pressable onPress={onBlock} className="flex-row items-center py-3">
                  <MaterialIcons name="block" size={22} color="#ef4444" />
                  <Text className="ml-3 text-base text-red-500">{t('dashboard.block')}</Text>
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
