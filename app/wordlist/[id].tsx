import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
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
import { ReportModal } from '@/components/report-modal';
import { Toast } from '@/components/toast';
import { getTtsText, speakWord } from '@src/utils/ttsLocale';
import { translatePOS } from '@src/utils/normalizeResult';
import { ReadingDisplay } from '@/components/reading-display';
import { findLanguage } from '@src/constants/languages';
import {
  deleteWords,
  getBook,
  getReviewableCount,
  listWordsByBook,
  updateBookTitle,
  updateWordResult,
  type StoredWord,
} from '@src/db/queries';
import { lookupWord, checkWordFreshness } from '@src/services/wordService';
import type { Book } from '@src/types/book';

import { useFocusEffect } from 'expo-router';

const AD_INTERVAL = 30;
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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!id) return;
        try {
          const [b, ws, rc] = await Promise.all([getBook(id), listWordsByBook(id), getReviewableCount(id)]);
          if (!cancelled) {
            setBook(b);
            setWords(ws);
            setReviewCount(rc);
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

  const toggleEditMode = () => {
    if (editMode) {
      setSelectedIds(new Set());
    }
    setEditMode(!editMode);
    setExpandedId(null);
  };

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
                <Text className="text-3xl font-bold text-black dark:text-white" numberOfLines={1}>
                  {book.title}
                </Text>
                <MaterialIcons name="edit" size={20} color="#9ca3af" style={{ marginLeft: 8 }} />
              </Pressable>
            </View>
          </View>
        )}
        {src && tgt ? (
          <Text className="mt-1 text-sm text-gray-500">
            {src.flag} {t(`languages.${src.code}`)} → {tgt.flag} {t(`languages.${tgt.code}`)}
          </Text>
        ) : null}
        <Text className="mt-1 text-sm text-gray-500">
          {t('wordlist.word_count', { count: words.length })}
        </Text>

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
  t: (key: string) => string;
}) {
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
      {/* Header */}
      <View className="flex-row items-center">
        {editMode ? (
          <View className="mr-3">
            <MaterialIcons
              name={selected ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={selected ? '#ef4444' : '#9ca3af'}
            />
          </View>
        ) : null}

        <View className="flex-row items-center flex-1">
          {!editMode && word.reviewCount > 0 ? (
            <ReviewStatusIcon intervalDays={word.intervalDays} />
          ) : null}
          <Text className="text-lg font-semibold text-black dark:text-white">
            {word.word}
          </Text>
          {word.result.reading ? (
            <ReadingDisplay reading={word.result.reading} sourceLang={book.sourceLang} compact />
          ) : null}
          {!editMode ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                speakWord(getTtsText(word.word, book.sourceLang, word.result.reading), book.sourceLang);
              }}
              className="ml-2 rounded-full bg-gray-100 p-1.5 dark:bg-gray-800"
              accessibilityLabel={t('common.speak')}
              accessibilityRole="button"
            >
              <MaterialIcons name="volume-up" size={16} color="#6b7280" />
            </Pressable>
          ) : null}
        </View>

        {!editMode ? (
          <View className="flex-row items-center">
            <Text className="text-xs text-gray-400">{expanded ? '▲' : '▼'}</Text>
          </View>
        ) : null}
      </View>

      {/* Meanings — show 1 when collapsed, all when expanded */}
      {!editMode ? (
        <>
          {(expanded ? meanings : meanings.slice(0, 1)).map((m, i) => (
            <Text key={i} className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {meanings.length > 1 ? `${i + 1}. ` : ''}
              {m.partOfSpeech ? `(${translatePOS(m.partOfSpeech, i18n.language)}) ` : ''}
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
                        <Text className="flex-1 text-sm italic text-black dark:text-white">
                          {e.sentence.includes('**')
                            ? e.sentence.split('**').map((seg, si) =>
                                si % 2 === 1
                                  ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
                                  : <Text key={si}>{seg}</Text>
                              )
                            : e.sentence}
                        </Text>
                        <Pressable
                          onPress={() => speakWord(e.sentence.replace(/\*\*/g, ''), book.sourceLang)}
                          className="ml-2 rounded-full bg-gray-200 p-1 dark:bg-gray-700"
                          accessibilityLabel={t('common.speak')}
                          accessibilityRole="button"
                        >
                          <MaterialIcons name="volume-up" size={14} color="#6b7280" />
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
                  <Text className="mt-1 text-sm text-black dark:text-white">
                    {synonyms.join(', ')}
                  </Text>
                </View>
              ) : null}

              {antonyms && antonyms.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t('add_word.antonyms')}
                  </Text>
                  <Text className="mt-1 text-sm text-black dark:text-white">
                    {antonyms.join(', ')}
                  </Text>
                </View>
              ) : null}

              <Pressable onPress={onReport} className="mt-1 flex-row items-center self-end">
                <MaterialIcons name="flag" size={14} color="#9ca3af" />
                <Text className="ml-1 text-xs text-gray-400">{t('report.title')}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

function ReviewStatusIcon({ intervalDays }: { intervalDays: number }) {
  if (intervalDays >= 3) {
    return <MaterialIcons name="check" size={14} color="#2EC4A5" style={{ marginRight: 4 }} />;
  }
  if (intervalDays >= 1) {
    return <MaterialIcons name="change-history" size={14} color="#9ca3af" style={{ marginRight: 4 }} />;
  }
  return <MaterialIcons name="close" size={14} color="#ef4444" style={{ marginRight: 4 }} />;
}
