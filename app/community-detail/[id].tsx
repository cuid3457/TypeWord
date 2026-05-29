import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Card } from '@/components/ui/card';
import { TargetReportModal } from '@/components/target-report-modal';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Toast } from '@/components/toast';
import { findLanguage } from '@src/constants/languages';
import { supabase } from '@src/api/supabase';
import { blockUser } from '@src/services/friendsService';
import { haptic } from '@src/services/hapticService';
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
    haptic.tap();
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
    haptic.tap();
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
      haptic.success();
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
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top']}>
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
            <MaterialIcons name={editing ? 'close' : 'arrow-back'} size={24} color="#7B7366" />
          </Pressable>
          {!editing && data && !isOwner ? (
            <Pressable
              onPress={() => setShowMenu(true)}
              className="p-2"
              accessibilityLabel={t('common.more')}
              accessibilityRole="button"
            >
              <MaterialIcons name="more-vert" size={22} color="#7B7366" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!data ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7B7366" />
        </View>
      ) : editing ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm font-semibold text-muted">
            {t('library_tab.title_label')}
          </Text>
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            maxLength={80}
            className="mt-1 rounded-xl border border-line px-3 py-2 text-base text-ink dark:border-line-dark dark:text-ink-dark"
          />
          <Text className="mt-4 text-sm font-semibold text-muted">
            {t('library_tab.description_label')}
          </Text>
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
            maxLength={300}
            className="mt-1 rounded-xl border border-line px-3 py-2 text-sm text-ink dark:border-line-dark dark:text-ink-dark"
            style={{ minHeight: 60 }}
          />
        </ScrollView>
      ) : (
        <>
          <View className="px-6 pt-2">
            <Card className="p-5">
              <View className="flex-row gap-3.5">
                <View className="h-[52px] w-[52px] items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
                  <Text className="text-xl font-extrabold text-accent-deep">
                    {(data.uploaderName || data.title || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-extrabold leading-7 text-ink dark:text-ink-dark" numberOfLines={3}>
                    {data.title}
                  </Text>
                  {data.uploaderName ? (
                    <Text className="mt-1 text-sm text-muted">@{data.uploaderName}</Text>
                  ) : null}
                </View>
              </View>
              <View className="mt-3.5 flex-row flex-wrap items-center gap-2">
                {sourceLang && targetLang ? (
                  <View className="rounded-full bg-accent-soft px-3 py-1 dark:bg-accent-soft-dark">
                    <Text className="text-xs font-semibold text-accent-deep">
                      {t(`languages.${data.sourceLang}`)} → {t(`languages.${data.targetLang}`)}
                    </Text>
                  </View>
                ) : null}
                <View className="rounded-full bg-clay px-3 py-1 dark:bg-clay-dark">
                  <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
                    {data.wordCount}{t('library.words_suffix')}
                  </Text>
                </View>
                <Pressable onPress={handleLike} disabled={busyLike} className="flex-row items-center rounded-full bg-clay px-3 py-1 dark:bg-clay-dark">
                  <MaterialIcons name={liked ? 'favorite' : 'favorite-border'} size={14} color={liked ? '#E0654F' : '#7B7366'} />
                  <Text className="ml-1 text-xs font-semibold text-ink dark:text-ink-dark">{data.likesCount}</Text>
                </Pressable>
                <View className="flex-row items-center rounded-full bg-clay px-3 py-1 dark:bg-clay-dark">
                  <MaterialIcons name="download" size={14} color="#7B7366" />
                  <Text className="ml-1 text-xs font-semibold text-ink dark:text-ink-dark">{data.downloadsCount}</Text>
                </View>
              </View>
              {data.description ? (
                <Text className="mt-3.5 text-sm leading-[21px] text-muted">{data.description}</Text>
              ) : null}
            </Card>
          </View>

          <View className="px-6 pt-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t('library.preview')}
            </Text>
          </View>

          <FlatList
            className="flex-1"
            data={data.words.slice(0, 20)}
            keyExtractor={(w, i) => `${w.word}-${w.readingKey ?? ''}-${i}`}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} tintColor="#1E9E84" colors={['#1E9E84']} />
            }
            renderItem={({ item }) => {
              const definition = item.result?.meanings?.[0]?.definition ?? '';
              const reading = item.result?.reading;
              const readingDisplay = Array.isArray(reading) ? reading.join(', ') : reading;
              return (
                <View className="border-b border-line py-3 dark:border-line-dark">
                  <View className="flex-row items-baseline">
                    <Text className="text-base font-semibold text-ink dark:text-ink-dark">{item.word}</Text>
                    {readingDisplay ? (
                      <Text className="ml-2 text-xs text-faint">{readingDisplay}</Text>
                    ) : null}
                    {item.result?.ipa && data && ipaSupported(data.sourceLang) ? (
                      <Text className="ml-2 text-xs text-faint">{item.result.ipa}</Text>
                    ) : null}
                  </View>
                  {definition ? (
                    <Text className="mt-1 text-sm text-muted" numberOfLines={2}>
                      {definition}
                    </Text>
                  ) : null}
                </View>
              );
            }}
            ListFooterComponent={
              data.words.length > 20 ? (
                <Text className="mt-4 text-center text-sm text-faint">
                  {t('library.preview_more', { count: data.words.length - 20 })}
                </Text>
              ) : null
            }
          />
        </>
      )}

      {data && !editing ? (
        <View
          className="border-t border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
          <View className="px-6 pt-4">
            <Pressable
              onPress={handleDownload}
              disabled={downloading}
              className="items-center rounded-xl bg-ink py-4 dark:bg-ink-dark"
            >
              {downloading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
                    {downloadProgress
                      ? t('library.adding_progress', { current: downloadProgress.current, total: downloadProgress.total })
                      : t('library.adding')}
                  </Text>
                </View>
              ) : (
                <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
                  {t('library_tab.download_button')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {data && editing ? (
        <View
          className="border-t border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
          <View className="px-6 pt-4">
            <Pressable
              onPress={handleSaveEdit}
              disabled={savingEdit || !editTitle.trim()}
              className={`items-center rounded-xl py-4 ${savingEdit || !editTitle.trim() ? 'bg-clay dark:bg-clay-dark' : 'bg-ink dark:bg-ink-dark'}`}
            >
              {savingEdit ? (
                <ActivityIndicator color="#7B7366" />
              ) : (
                <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
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
                  backgroundColor: dark ? '#1E1B15' : '#fff',
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
                <Text className="text-lg font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
                  {title}
                </Text>
                <Pressable onPress={onReportWordlist} className="mt-4 flex-row items-center py-3">
                  <MaterialIcons name="flag" size={22} color="#7B7366" />
                  <Text className="ml-3 text-base text-ink dark:text-ink-dark">
                    {t('report.title_wordlist')}
                  </Text>
                </Pressable>
                <Pressable onPress={onReportUser} className="flex-row items-center py-3">
                  <MaterialIcons name="flag" size={22} color="#E0654F" />
                  <Text className="ml-3 text-base text-danger">{t('report.title_user')}</Text>
                </Pressable>
                <Pressable onPress={onBlock} className="flex-row items-center py-3">
                  <MaterialIcons name="block" size={22} color="#E0654F" />
                  <Text className="ml-3 text-base text-danger">{t('dashboard.block')}</Text>
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
