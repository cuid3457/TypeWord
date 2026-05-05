import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AdBanner } from '@/components/ad-banner';
import { AppModal } from '@/components/app-modal';
import { ExportFormatModal } from '@/components/export-format-modal';
import { ReportModal } from '@/components/report-modal';
import { Toast } from '@/components/toast';
import { VoiceToggle } from '@/components/voice-toggle';
import * as Clipboard from 'expo-clipboard';
import { TextActionPopover, type PopoverPosition } from '@/components/text-action-popover';
import { getTtsText, speakWord, phonemeForChinese } from '@src/utils/ttsLocale';
import { formatPOS } from '@src/utils/normalizeResult';
import { ReadingDisplay } from '@/components/reading-display';
import { findLanguage } from '@src/constants/languages';
import {
  deleteWords,
  getBook,
  getReviewableCount,
  listWordsByBook,
  updateBookNotif,
  updateBookTitle,
  updateWordResult,
  type StoredWord,
} from '@src/db/queries';
import { lookupWord, checkWordFreshness } from '@src/services/wordService';
import { exportWordlistCsv, exportWordlistPdf } from '@src/services/exportService';
import { usePremium } from '@src/hooks/usePremium';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { Paywall } from '@/components/paywall';
import { WordlistNotifModal } from '@/components/wordlist-notif-modal';
import { getNotificationTranslations, isNotificationAvailable, requestNotificationPermission, rescheduleNotifications } from '@src/services/notificationService';
import { getPreferredNotificationHour } from '@src/services/streakService';
import type { Book } from '@src/types/book';

import { useFocusEffect } from 'expo-router';

const AD_INTERVAL = 30;
const MAX_TITLE_LENGTH = 40;
type ListItem = { type: 'word'; data: StoredWord } | { type: 'ad'; key: string };

function buildListWithAds(words: StoredWord[]): ListItem[] {
  const items: ListItem[] = [];
  for (let i = 0; i < words.length; i++) {
    items.push({ type: 'word', data: words[i] });
    if ((i + 1) % AD_INTERVAL === 0 && i + 1 < words.length) {
      items.push({ type: 'ad', key: `ad-${i}` });
    }
  }
  return items;
}

export default function WordlistDetailScreen() {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [book, setBook] = useState<Omit<Book, 'userId'> | null>(null);
  const [words, setWords] = useState<StoredWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [sortMode, setSortMode] = useState<'recent' | 'alpha' | 'review'>('recent');
  const [sortReversed, setSortReversed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [error, setError] = useState(false);

  // Edit mode for bulk word delete
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const longPressedRef = useRef(false);
  const [reportWord, setReportWord] = useState<StoredWord | null>(null);
  const [reportToast, setReportToast] = useState('');
  const [popover, setPopover] = useState<PopoverPosition | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportToast, setExportToast] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [defaultHour, setDefaultHour] = useState(21);
  const premium = usePremium();
  const { settings, save: saveSettings } = useUserSettings();
  const globalNotifEnabled = !!settings?.notificationsEnabled;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!id) return;
        try {
          const [b, ws, rc, hour] = await Promise.all([
            getBook(id),
            listWordsByBook(id),
            getReviewableCount(id),
            getPreferredNotificationHour(),
          ]);
          if (!cancelled) {
            setBook(b);
            setWords(ws);
            setReviewCount(rc);
            setDefaultHour(hour);
          }
        } catch (err) {
          console.error('Failed to load wordlist:', err);
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const runExport = useCallback(
    async (format: 'csv' | 'pdf') => {
      if (!book) return;
      if (words.length === 0) {
        setExportToast(t('wordlist.export_empty'));
        return;
      }
      setExporting(true);
      try {
        if (format === 'csv') {
          await exportWordlistCsv(book.title, words);
        } else {
          await exportWordlistPdf(book.title, words, {
            synonyms: t('add_word.synonyms'),
            antonyms: t('add_word.antonyms'),
            wordsSuffix: t('wordlist.pdf_words_suffix'),
          });
        }
      } catch (err) {
        console.error('Export failed:', err);
        setExportToast(t('wordlist.export_failed'));
      } finally {
        setExporting(false);
      }
    },
    [book, words, t],
  );

  const handleExport = useCallback(() => {
    if (!book) return;
    setExportModalOpen(true);
  }, [book]);

  const handleNotifSave = useCallback(
    async (enabled: boolean, hour: number, minute: number, days: number) => {
      if (!book) return;

      // Enabling per-list notifications: ensure OS permission + global app
      // toggle are both on. This is the contextual permission request that
      // Apple HIG / Google's runtime permission guidance recommend.
      if (enabled) {
        if (!isNotificationAvailable()) {
          setExportToast(t('settings.notifications_unavailable'));
          return;
        }
        const granted = await requestNotificationPermission();
        if (!granted) {
          setExportToast(t('wordlist.notif_perm_denied'));
          return;
        }
        if (settings && !settings.notificationsEnabled) {
          await saveSettings({ ...settings, notificationsEnabled: true });
        }
      }

      await updateBookNotif(book.id, enabled, hour, minute, days);
      setBook({
        ...book,
        notifEnabled: enabled,
        notifHour: hour,
        notifMinute: minute,
        notifDays: days,
      });

      if (isNotificationAvailable()) {
        await rescheduleNotifications(getNotificationTranslations(t));
      }
    },
    [book, settings, saveSettings, t],
  );

  const toggleEditMode = () => {
    if (editMode) {
      setSelectedIds(new Set());
    }
    setEditMode(!editMode);
    setExpandedId(null);
  };

  useEffect(() => {
    if (!editMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedIds(new Set());
      setEditMode(false);
      return true;
    });
    return () => sub.remove();
  }, [editMode]);

  const toggleSelect = (wordId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    try {
      const ids = Array.from(selectedIds);
      await deleteWords(ids);
      setWords((prev) => prev.filter((w) => !selectedIds.has(w.id)));
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      setEditMode(false);
    } catch {
      setShowDeleteConfirm(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-10 dark:bg-black">
        <MaterialIcons name="error-outline" size={48} color="#9ca3af" />
        <Text className="mt-4 text-xl font-bold text-black dark:text-white">
          {t('error.title')}
        </Text>
        <Text className="mt-2 text-center text-sm text-gray-500">
          {t('error.message')}
        </Text>
        <Pressable
          onPress={() => {
            setError(false);
            setLoading(true);
          }}
          className="mt-8 items-center rounded-xl bg-black px-8 py-4 dark:bg-white"
        >
          <Text className="text-base font-semibold text-white dark:text-black">
            {t('error.retry')}
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Text className="text-sm text-gray-400">{t('wordlist.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (!book) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Text className="text-base text-gray-500">{t('wordlist.not_found')}</Text>
      </SafeAreaView>
    );
  }

  const src = findLanguage(book.sourceLang);
  const tgt = book.targetLang ? findLanguage(book.targetLang) : null;

  const handleSortChange = (mode: 'recent' | 'alpha' | 'review') => {
    if (sortMode === mode) {
      setSortReversed((r) => !r);
    } else {
      setSortMode(mode);
      setSortReversed(false);
    }
  };

  const sortedWords = (() => {
    const dir = sortReversed ? -1 : 1;
    switch (sortMode) {
      case 'alpha':
        return [...words].sort((a, b) => dir * a.word.localeCompare(b.word));
      case 'review':
        return [...words].sort((a, b) => {
          const aNext = a.nextReview ? new Date(a.nextReview).getTime() : Infinity;
          const bNext = b.nextReview ? new Date(b.nextReview).getTime() : Infinity;
          return dir * (aNext - bNext);
        });
      default:
        return sortReversed ? [...words].reverse() : words;
    }
  })();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="px-6 pt-6">
        {editing ? (
          <View className="flex-row items-center gap-2">
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              autoFocus
              selectTextOnFocus
              maxLength={MAX_TITLE_LENGTH}
              onSubmitEditing={async () => {
                const trimmed = editTitle.trim();
                if (trimmed && trimmed !== book.title) {
                  await updateBookTitle(book.id, trimmed);
                  setBook({ ...book, title: trimmed });
                }
                setEditing(false);
              }}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-2xl font-bold text-black dark:border-gray-700 dark:text-white"
            />
            <Pressable
              onPress={async () => {
                const trimmed = editTitle.trim();
                if (trimmed && trimmed !== book.title) {
                  await updateBookTitle(book.id, trimmed);
                  setBook({ ...book, title: trimmed });
                }
                setEditing(false);
              }}
              className="rounded-xl bg-black px-4 py-2.5 dark:bg-white"
            >
              <Text className="text-sm font-semibold text-white dark:text-black">
                {t('wordlist.rename_save')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-center">
            <View className="flex-row items-center flex-1">
              <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button">
                <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditTitle(book.title);
                  setEditing(true);
                }}
                className="flex-row items-center flex-1"
                accessibilityLabel={t('common.edit')}
                accessibilityRole="button"
              >
                <Text className="flex-1 text-3xl font-bold text-black dark:text-white">
                  {book.title}
                </Text>
                <MaterialIcons name="edit" size={20} color="#9ca3af" style={{ marginLeft: 8 }} />
              </Pressable>
            </View>
          </View>
        )}
        <View className="mt-1 flex-row items-start justify-between">
          <View className="flex-1">
            {src && tgt ? (
              <Text className="text-sm text-gray-500">
                {src.flag} {t(`languages.${src.code}`)} → {tgt.flag} {t(`languages.${tgt.code}`)}
              </Text>
            ) : null}
            <Text className="mt-1 text-sm text-gray-500">
              {t('wordlist.word_count', { count: words.length })}
            </Text>
          </View>
          <View className="ml-3 flex-row items-start gap-2">
            <View className="rounded-full bg-gray-100 p-2.5 dark:bg-gray-800">
              <VoiceToggle iconSize={22} iconColor="#2EC4A5" />
            </View>
            <Pressable
              onPress={() => setNotifModalOpen(true)}
              className="rounded-full bg-gray-100 p-2.5 dark:bg-gray-800"
              accessibilityLabel={t('wordlist.notif_settings')}
              accessibilityRole="button"
            >
              <MaterialIcons
                name={
                  !globalNotifEnabled
                    ? 'notifications-off'
                    : book.notifEnabled
                    ? 'notifications-active'
                    : 'notifications-none'
                }
                size={22}
                color={
                  !globalNotifEnabled
                    ? '#9ca3af'
                    : book.notifEnabled
                    ? '#2EC4A5'
                    : '#6b7280'
                }
              />
            </Pressable>
            <View className="items-center">
              <Pressable
                onPress={handleExport}
                disabled={exporting}
                className="rounded-full bg-gray-100 p-2.5 dark:bg-gray-800"
                accessibilityLabel={t('wordlist.export_csv')}
                accessibilityRole="button"
              >
                <MaterialIcons
                  name="ios-share"
                  size={22}
                  color={exporting ? '#9ca3af' : '#2EC4A5'}
                />
              </Pressable>
              {!premium ? (
                <Text className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Pro
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {!editMode ? (
          <>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/wordlist/add/[id]',
                  params: { id: book.id },
                })
              }
              className="mt-4 items-center rounded-xl bg-black py-4 dark:bg-white"
            >
              <Text className="text-base font-semibold text-white dark:text-black">
                {t('wordlist.add_word')}
              </Text>
            </Pressable>

            {reviewCount > 0 ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/review',
                    params: { bookId: book.id },
                  })
                }
                className="mt-2 items-center rounded-xl border border-black py-3 dark:border-white"
              >
                <Text className="text-base font-semibold text-black dark:text-white">
                  {t('wordlist.review_button', { count: reviewCount })}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <View className="mt-4 mb-2 flex-row items-center justify-between">
          <View className="flex-row gap-2">
            {(['recent', 'alpha', 'review'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => handleSortChange(mode)}
                className={`flex-row items-center rounded-lg px-3 py-1.5 ${
                  sortMode === mode
                    ? 'bg-black dark:bg-white'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    sortMode === mode
                      ? 'text-white dark:text-black'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {t(`wordlist.sort_${mode}`)}
                </Text>
                {sortMode === mode ? (
                  <MaterialIcons
                    name={sortReversed ? 'arrow-upward' : 'arrow-downward'}
                    size={12}
                    color={colorScheme === 'dark' ? '#000' : '#fff'}
                    style={{ marginLeft: 2 }}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
          <Pressable onPress={toggleEditMode} className="p-1" accessibilityLabel={editMode ? t('common.done') : t('common.edit')} accessibilityRole="button">
            <MaterialIcons
              name={editMode ? 'check' : 'edit'}
              size={20}
              color={editMode ? '#2EC4A5' : '#6b7280'}
            />
          </Pressable>
        </View>
      </View>

      {words.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <MaterialIcons name="translate" size={48} color="#9ca3af" />
          <Text className="mt-4 text-center text-sm text-gray-500">
            {t('wordlist.empty')}
          </Text>
        </View>
      ) : (
        <FlatList<ListItem>
          data={buildListWithAds(sortedWords)}
          keyExtractor={(item) => (item.type === 'ad' ? item.key : item.data.id)}
          contentContainerStyle={{ padding: 24, paddingBottom: editMode ? 100 : 80 }}
          renderItem={({ item }) => {
            if (item.type === 'ad') {
              return (
                <View className="my-2" style={{ marginHorizontal: -24 }}>
                  <AdBanner />
                </View>
              );
            }
            const w = item.data;
            return (
              <WordRow
                word={w}
                book={book}
                expanded={!editMode && w.id === expandedId}
                editMode={editMode}
                selected={selectedIds.has(w.id)}
                onPress={() => {
                  if (longPressedRef.current) {
                    longPressedRef.current = false;
                    return;
                  }
                  if (editMode) {
                    toggleSelect(w.id);
                  } else {
                    setExpandedId(w.id === expandedId ? null : w.id);
                  }
                }}
                onLongPress={() => {
                  if (!editMode) {
                    longPressedRef.current = true;
                    setEditMode(true);
                    setSelectedIds(new Set([w.id]));
                    setExpandedId(null);
                  }
                }}
                onEnriched={(updated) =>
                  setWords((prev) =>
                    prev.map((x) => (x.id === w.id ? { ...x, result: updated } : x)),
                  )
                }
                onReport={() => setReportWord(w)}
                onShowTextActions={(text, e, onSearch) => {
                  const buttons: { label: string; onPress: () => void }[] = [];
                  if (onSearch) buttons.push({ label: t('common.search'), onPress: onSearch });
                  buttons.push({
                    label: t('common.copy'),
                    onPress: async () => {
                      try {
                        await Clipboard.setStringAsync(text);
                        setReportToast(t('common.copied'));
                      } catch {
                        /* clipboard rarely fails — silent */
                      }
                    },
                  });
                  setPopover({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, buttons });
                }}
                t={t}
              />
            );
          }}
        />
      )}

      {/* Bottom bar in edit mode */}
      {editMode ? (
        <View className="mx-6 mb-2 flex-row items-center justify-between rounded-2xl bg-gray-800 px-5 py-4 dark:bg-gray-200">
          <Pressable
            onPress={() => {
              if (selectedIds.size === words.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(words.map((w) => w.id)));
              }
            }}
            className="flex-row items-center"
            hitSlop={8}
          >
            <MaterialIcons
              name={selectedIds.size === words.length && words.length > 0 ? 'check-box' : 'check-box-outline-blank'}
              size={20}
              color={selectedIds.size === words.length && words.length > 0 ? '#2EC4A5' : '#9ca3af'}
            />
            <Text className="ml-2 text-sm font-medium text-white dark:text-black">
              {selectedIds.size > 0 ? t('wordlist.selected_count', { count: selectedIds.size }) : t('wordlist.select_all')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            disabled={selectedIds.size === 0}
            className={`rounded-xl px-5 py-2.5 ${selectedIds.size > 0 ? 'bg-red-500' : 'bg-gray-600'}`}
          >
            <Text className={`text-sm font-semibold ${selectedIds.size > 0 ? 'text-white' : 'text-gray-400'}`}>
              {t('wordlist.delete_selected')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <AdBanner />

      <AppModal
        visible={showDeleteConfirm}
        title={t('wordlist.confirm_delete_words_title')}
        message={t('wordlist.confirm_delete_words_message', { count: selectedIds.size })}
        buttonText={t('wordlist.cancel')}
        confirmText={t('wordlist.confirm_delete')}
        destructive
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteSelected}
      />

      {reportWord && book ? (
        <ReportModal
          visible={!!reportWord}
          onClose={() => setReportWord(null)}
          word={reportWord.word}
          wordId={reportWord.id}
          context="detail"
          onSubmitted={(msg) => setReportToast(msg)}
        />
      ) : null}
      <Toast visible={!!reportToast} message={reportToast} type="success" onHide={() => setReportToast('')} style={{ position: 'absolute', bottom: 132, left: 0, right: 0 }} />
      <Toast visible={!!exportToast} message={exportToast} type="error" onHide={() => setExportToast('')} style={{ position: 'absolute', bottom: 80, left: 0, right: 0 }} />

      {book ? (
        <WordlistNotifModal
          visible={notifModalOpen}
          bookTitle={book.title}
          initialEnabled={book.notifEnabled}
          initialHour={book.notifHour}
          initialMinute={book.notifMinute}
          initialDays={book.notifDays}
          defaultHour={defaultHour}
          onClose={() => setNotifModalOpen(false)}
          onSave={handleNotifSave}
        />
      ) : null}

      <Paywall visible={paywallVisible} onClose={() => setPaywallVisible(false)} />

      <TextActionPopover state={popover} onDismiss={() => setPopover(null)} />

      <ExportFormatModal
        visible={exportModalOpen}
        premium={!!premium}
        title={t('wordlist.export_choose_title')}
        subtitle={t('wordlist.export_choose_body')}
        csvTitle={t('wordlist.export_csv')}
        csvDescription={t('wordlist.export_csv_description')}
        pdfTitle={t('wordlist.export_pdf')}
        pdfDescription={t('wordlist.export_pdf_description')}
        pdfLockedHint={t('wordlist.export_pdf_premium_badge')}
        cancelText={t('common.cancel')}
        onPickCsv={() => {
          setExportModalOpen(false);
          runExport('csv');
        }}
        onPickPdf={() => {
          setExportModalOpen(false);
          if (premium) {
            runExport('pdf');
          } else {
            setPaywallVisible(true);
          }
        }}
        onClose={() => setExportModalOpen(false)}
      />
    </SafeAreaView>
  );
}

function WordRow({
  word,
  book,
  expanded,
  editMode,
  selected,
  onPress,
  onLongPress,
  onEnriched,
  onReport,
  onShowTextActions,
  t,
}: {
  word: StoredWord;
  book: Omit<Book, 'userId'>;
  expanded: boolean;
  editMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onEnriched: (result: import('@src/types/word').WordLookupResult) => void;
  onReport: () => void;
  onShowTextActions: (
    text: string,
    e: { nativeEvent: { pageX: number; pageY: number } },
    onSearch?: () => void,
  ) => void;
  t: (key: string) => string;
}) {
  const navigateAndSearch = (q: string) => {
    router.push({ pathname: '/wordlist/add/[id]', params: { id: book.id, q } });
  };
  const { i18n } = useTranslation();
  const [enriching, setEnriching] = useState(false);
  const meanings = word.result.meanings ?? [];
  const { examples, synonyms, antonyms } = word.result;
  const hasDetails = !!(examples?.length || synonyms?.length || antonyms?.length);

  const handlePress = async () => {
    if (editMode) {
      onPress();
      return;
    }
    onPress();
    if (!expanded) {
      checkWordFreshness(
        word.id, word.word,
        book.sourceLang, book.targetLang ?? 'en',
        word.cacheSyncedAt,
      ).then((updated) => { if (updated) onEnriched(updated); }).catch(() => {});
    }
    if (!expanded && !hasDetails && !enriching) {
      setEnriching(true);
      try {
        const res = await lookupWord({
          word: word.word,
          sourceLang: book.sourceLang,
          targetLang: book.targetLang ?? 'en',
          bookId: book.id,
          mode: 'enrich',
          meanings: word.result.meanings?.map((m) => ({
            definition: m.definition,
            partOfSpeech: m.partOfSpeech,
          })),
        });
        await updateWordResult(word.id, res.result);
        onEnriched(res.result);
      } catch {
        // silently fail
      } finally {
        setEnriching(false);
      }
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={editMode ? undefined : onLongPress}
      className="mb-2 rounded-xl border border-gray-300 p-4 dark:border-gray-800"
    >
      {/* Header — word + reading share the bounded left column (icons take the
          right edge), but IPA renders on its OWN row below the header so it
          can use the card's full width before wrapping. IPA's left edge
          aligns with the word's because both start at the card's content
          padding origin. */}
      <View className="flex-row items-start">
        {editMode ? (
          <View className="mr-3 mt-1">
            <MaterialIcons
              name={selected ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={selected ? '#ef4444' : '#9ca3af'}
            />
          </View>
        ) : null}

        <View className="flex-1" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 4 }}>
          <Pressable
            onLongPress={(e) => onShowTextActions(word.word, e)}
            delayLongPress={350}
            className="shrink"
          >
            <Text className="shrink text-lg font-semibold text-black dark:text-white">
              {word.word}
            </Text>
          </Pressable>
          {word.result.reading ? (
            <ReadingDisplay reading={word.result.reading} sourceLang={book.sourceLang} word={word.word} compact />
          ) : null}
        </View>

        {!editMode ? (
          <View className="flex-row items-center shrink-0 ml-2 mt-1">
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                speakWord(
                  getTtsText(word.word, book.sourceLang, word.result.reading),
                  book.sourceLang,
                  // Phoneme override only for polysemy-disambiguated entries
                  // (readingKey set during curated-list add). Non-polysemy words
                  // pronounce correctly via Azure's default — overriding them
                  // breaks playback entirely for single-char hanzi.
                  word.readingKey
                    ? phonemeForChinese(book.sourceLang, word.result.reading, word.word) ?? undefined
                    : undefined,
                );
              }}
              className="mr-3 rounded-full bg-gray-100 p-1.5 dark:bg-gray-800"
              accessibilityLabel={t('common.speak')}
              accessibilityRole="button"
            >
              <MaterialIcons name="volume-up" size={16} color="#10b981" />
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onReport();
              }}
              className="mr-3 p-1"
              accessibilityLabel={t('report.title')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialIcons name="flag" size={16} color="#9ca3af" />
            </Pressable>
            <Text className="text-xs text-gray-400">{expanded ? '▲' : '▼'}</Text>
          </View>
        ) : null}
      </View>

      {word.result.ipa ? (
        <Text className="mt-1 text-sm text-gray-400">{word.result.ipa}</Text>
      ) : null}

      {/* Meanings — show 1 when collapsed, all when expanded */}
      {!editMode ? (
        <>
          {(expanded ? meanings : meanings.slice(0, 1)).map((m, i) => (
            <Text key={i} className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {meanings.length > 1 ? `${i + 1}. ` : ''}
              {m.partOfSpeech ? `(${formatPOS(m.partOfSpeech, m.gender, i18n.language)}) ` : ''}
              {m.definition}
            </Text>
          ))}
          {!expanded && meanings.length > 1 ? (
            <Text className="mt-1 text-xs text-gray-400">+{meanings.length - 1}</Text>
          ) : null}
        </>
      ) : meanings.length > 0 ? (
        <Text className="mt-1 text-sm text-gray-500" numberOfLines={1}>
          {meanings[0].definition}
        </Text>
      ) : null}

      {/* Expanded details */}
      {expanded && !editMode ? (
        <View className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          {enriching ? (
            <View className="items-center py-4">
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <>
              {examples && examples.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t('add_word.examples')}
                  </Text>
                  {examples.map((e, i) => (
                    <View key={i} className="mt-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                      <View className="flex-row items-start">
                        <Pressable
                          onLongPress={(evt) => onShowTextActions(e.sentence.replace(/\*\*/g, ''), evt)}
                          delayLongPress={350}
                          style={{ flex: 1 }}
                        >
                          <Text className="text-sm italic text-black dark:text-white">
                            {e.sentence.includes('**')
                              ? e.sentence.split('**').map((seg, si) =>
                                  si % 2 === 1
                                    ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
                                    : <Text key={si}>{seg}</Text>
                                )
                              : e.sentence}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => speakWord(e.sentence.replace(/\*\*/g, ''), book.sourceLang)}
                          className="ml-2 rounded-full bg-gray-200 p-1 dark:bg-gray-700"
                          accessibilityLabel={t('common.speak')}
                          accessibilityRole="button"
                        >
                          <MaterialIcons name="volume-up" size={14} color="#10b981" />
                        </Pressable>
                      </View>
                      {e.translation ? (
                        <Text className="mt-1 text-sm text-gray-500">
                          {e.translation.includes('**')
                            ? e.translation.split('**').map((seg, si) =>
                                si % 2 === 1
                                  ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
                                  : <Text key={si}>{seg}</Text>
                              )
                            : e.translation}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {synonyms && synonyms.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t('add_word.synonyms')}
                  </Text>
                  <View className="mt-1 flex-row flex-wrap">
                    {synonyms.map((s, i) => (
                      <Pressable
                        key={`syn-${i}`}
                        onPress={() => navigateAndSearch(s)}
                        onLongPress={(evt) => onShowTextActions(s, evt, () => navigateAndSearch(s))}
                        delayLongPress={350}
                      >
                        <Text className="text-sm text-black dark:text-white">
                          {s}{i < synonyms.length - 1 ? ', ' : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {antonyms && antonyms.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t('add_word.antonyms')}
                  </Text>
                  <View className="mt-1 flex-row flex-wrap">
                    {antonyms.map((a, i) => (
                      <Pressable
                        key={`ant-${i}`}
                        onPress={() => navigateAndSearch(a)}
                        onLongPress={(evt) => onShowTextActions(a, evt, () => navigateAndSearch(a))}
                        delayLongPress={350}
                      >
                        <Text className="text-sm text-black dark:text-white">
                          {a}{i < antonyms.length - 1 ? ', ' : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

            </>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

