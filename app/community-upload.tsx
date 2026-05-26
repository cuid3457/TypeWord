import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';
import { NicknameModal } from '@/components/nickname-modal';
import { listOriginalBooks, type BookWithCount } from '@src/db/queries';
import { uploadWordlistToCommunity, CommunityUploadError, UPLOAD_ERROR } from '@src/services/communityWordlistService';
import { getMyProfile } from '@src/services/friendsService';

// Mirrors the review-tab MIN_SESSION threshold so the dimming + toast
// pattern feels consistent. Public community wordlists with fewer than
// this many words tend to be low-value for downloaders, so we gate it.
const MIN_UPLOAD_WORDS = 5;

type Book = BookWithCount;

/**
 * Community wordlist upload — previously a pageSheet modal, converted to
 * a stack page for consistent fullscreen presentation on both platforms.
 */
export default function CommunityUploadScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<Book[]>([]);
  const [picked, setPicked] = useState<Book | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  // Lazy nickname collection: when the user submits an upload but their
  // profile has no display_name yet, we open this modal first. After they
  // save a nickname, the upload retries automatically.
  const [showNickname, setShowNickname] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  useEffect(() => {
    listOriginalBooks().then((bs) => setBooks(bs.filter((b) => b.wordCount > 0)));
  }, []);

  useEffect(() => {
    if (picked) setTitle(picked.title);
  }, [picked]);

  const performUpload = async (uploaderName: string) => {
    if (!picked || !title.trim()) return;
    setSubmitting(true);
    try {
      await uploadWordlistToCommunity({
        bookId: picked.id,
        title: title.trim(),
        description: description.trim() || undefined,
        uploaderName,
      });
      router.back();
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
          case UPLOAD_ERROR.TOO_FEW:
            showToast(t('library_tab.min_upload_words', { count: 5 }));
            break;
          case UPLOAD_ERROR.TOO_MANY:
            showToast(t('library_tab.upload_too_many_words'));
            break;
          case UPLOAD_ERROR.ANONYMOUS:
            showToast(t('library_tab.upload_signin_required'));
            break;
          default:
            showToast(e.message || t('library_tab.upload_error'));
        }
      } else {
        showToast((e as Error).message || t('library_tab.upload_error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!picked || !title.trim() || submitting) return;
    // Gate behind nickname: required for the uploader_name attribution that
    // shows in the library list / wordlist detail. If absent, prompt once
    // and resume upload after save.
    setSubmitting(true);
    const profile = await getMyProfile().catch(() => null);
    setSubmitting(false);
    const nickname = profile?.displayName?.trim() ?? '';
    if (!nickname) {
      setShowNickname(true);
      return;
    }
    await performUpload(nickname);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <View className="flex-row items-center justify-between px-6 pt-6">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => {
              // Step 2 (form): back arrow returns to step 1 (wordlist picker).
              // Step 1 (picker): back arrow exits to the library tab.
              if (picked) setPicked(null);
              else router.back();
            }}
            className="mr-2 p-1"
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>
          <Text className="text-base font-semibold text-black dark:text-white">
            {t('library_tab.upload_title')}
          </Text>
        </View>
        <Pressable
          onPress={submit}
          disabled={!picked || !title.trim() || submitting}
          className="rounded-xl p-3"
          style={{
            backgroundColor: !picked || !title.trim() || submitting ? '#d1d5db' : '#2EC4A5',
          }}
          accessibilityLabel={t('library_tab.upload_button')}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="arrow-upward" size={20} color="#fff" />
          )}
        </Pressable>
      </View>

      <View className="p-4">
        {!picked ? (
          <>
            <Text className="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
              {t('library_tab.pick_wordlist')}
            </Text>
            {books.length === 0 ? (
              <Text className="mt-8 text-center text-sm text-gray-500">
                {t('library_tab.no_wordlists')}
              </Text>
            ) : (
              books.map((b) => {
                const canUpload = b.wordCount >= MIN_UPLOAD_WORDS;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      if (!canUpload) {
                        setToastMsg(t('library_tab.min_upload_words', { count: MIN_UPLOAD_WORDS }));
                        setToastVisible(true);
                        return;
                      }
                      setPicked(b);
                    }}
                    className="mb-2 flex-row items-center rounded-xl border border-gray-300 p-3 dark:border-gray-700"
                  >
                    <View className="flex-1" style={!canUpload ? { opacity: 0.4 } : undefined}>
                      <Text className="text-base text-black dark:text-white" numberOfLines={1}>
                        {b.title}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {b.wordCount}{t('library.words_suffix')} · {b.sourceLang}→{b.targetLang}
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color="#9ca3af"
                      style={!canUpload ? { opacity: 0.4 } : undefined}
                    />
                  </Pressable>
                );
              })
            )}
          </>
        ) : (
          <>
            <Text className="text-sm font-semibold text-gray-600 dark:text-gray-400">
              {t('library_tab.title_label')}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              className="mt-1 rounded-xl border border-gray-300 px-3 py-2 text-base text-black dark:border-gray-700 dark:text-white"
              maxLength={80}
            />
            <Text className="mt-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
              {t('library_tab.description_label')}
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              className="mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-black dark:border-gray-700 dark:text-white"
              style={{ minHeight: 60 }}
              maxLength={300}
            />
            <Text className="mt-4 text-xs text-gray-500">
              {picked.wordCount}{t('library.words_suffix')} · {picked.sourceLang}→{picked.targetLang}
            </Text>
            {submitting ? (
              <ActivityIndicator className="mt-4" color="#6b7280" />
            ) : null}
          </>
        )}
      </View>
      </TabletContainer>

      <Toast
        message={toastMsg}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }}
      />

      <NicknameModal
        visible={showNickname}
        onSaved={(saved) => {
          setShowNickname(false);
          performUpload(saved);
        }}
        onCancel={() => setShowNickname(false)}
      />
    </SafeAreaView>
  );
}
