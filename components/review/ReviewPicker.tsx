import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Toast } from '@/components/toast';
import { findLanguage } from '@src/constants/languages';
import {
  MAX_RELOAD,
  resetReviewSchedule,
  type BookReviewCount,
  type BookSortMode,
} from '@src/db/queries';
import type { StreakInfo } from '@src/services/streakService';

interface Props {
  totalDue: number;
  hasWords: boolean;
  bookCounts: BookReviewCount[];
  sortMode: BookSortMode;
  sortReversed: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  highlightedBookId: string | null;
  searchMatches: BookReviewCount[];
  handleSearchComplete: (book: BookReviewCount) => void;
  handleSortChange: (mode: BookSortMode) => void;
  handleStartRequest: (bookId?: string | null) => void;
  loadPickerData: (sort: BookSortMode, reversed: boolean) => Promise<void>;
  streak: StreakInfo | null;
  toastMsg: string;
  toastVisible: boolean;
  setToastVisible: (v: boolean) => void;
  onMinWordToast: () => void;
  pickerListRef: RefObject<FlatList<BookReviewCount> | null>;
  highlightTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  settingsModal: React.ReactNode;
}

const MIN_SESSION = 5;

export function ReviewPicker({
  totalDue,
  hasWords,
  bookCounts,
  sortMode,
  sortReversed,
  searchQuery,
  onSearchQueryChange,
  highlightedBookId,
  searchMatches,
  handleSearchComplete,
  handleSortChange,
  handleStartRequest,
  loadPickerData,
  streak,
  toastMsg,
  toastVisible,
  setToastVisible,
  onMinWordToast,
  pickerListRef,
  highlightTimerRef,
  settingsModal,
}: Props) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-white dark:bg-black">
      <View className="px-6 pt-6">
        <Text className="text-3xl font-bold text-black dark:text-white">
          {t('review.title')}
        </Text>
        <Text className="mt-1 text-sm text-gray-500">
          {t('review.due_count', { count: totalDue })}
        </Text>
      </View>

      {/* Streak banner */}
      {streak ? (
        streak.current > 0 ? (
          <View className="mx-6 mt-4 flex-row items-center rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-950">
            <Text className="text-2xl">🔥</Text>
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-amber-800 dark:text-amber-200">
                {t('streak.days', { count: streak.current })}
              </Text>
              <Text className="text-xs text-amber-600 dark:text-amber-400">
                {streak.todayDone ? t('streak.done_today') : t('streak.not_yet')}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              {Array.from({ length: 2 }, (_, i) => (
                <MaterialIcons
                  key={i}
                  name="favorite"
                  size={18}
                  color={i < streak.hearts ? '#ef4444' : colorScheme === 'dark' ? '#78350f' : '#fcd34d'}
                />
              ))}
            </View>
            <MaterialIcons
              name={streak.todayDone ? 'check-circle' : 'radio-button-unchecked'}
              size={20}
              color={streak.todayDone ? '#2EC4A5' : '#9ca3af'}
              style={{ marginLeft: 8 }}
            />
          </View>
        ) : (
          <View className="mx-6 mt-4 flex-row items-center rounded-xl bg-gray-100 px-4 py-3 dark:bg-gray-800">
            <Text className="text-2xl" style={{ opacity: 0.4 }}>🔥</Text>
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-gray-500 dark:text-gray-400">
                {t('streak.start_title')}
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                {t('streak.start_hint')}
              </Text>
            </View>
          </View>
        )
      ) : null}

      {/* Sort buttons */}
      <View className="mt-3 flex-row gap-2 px-6">
        {(['recent', 'created', 'words'] as const).map((mode) => (
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
              {t(`home.sort_${mode}`)}
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

      {/* Search bar */}
      <View className="mt-2 px-6">
        <View>
          <View className="flex-row items-center rounded-xl bg-gray-100 px-3 dark:bg-gray-800">
            <MaterialIcons name="search" size={18} color="#9ca3af" />
            <TextInput
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              placeholder={t('home.search_placeholder')}
              placeholderTextColor="#9ca3af"
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              className="ml-2 flex-1 py-2.5 text-sm text-black dark:text-white"
            />
            {searchQuery ? (
              <Pressable
                onPress={() => onSearchQueryChange('')}
                className="ml-1 p-1"
                accessibilityLabel={t('common.clear')}
                accessibilityRole="button"
              >
                <MaterialIcons name="close" size={16} color="#9ca3af" />
              </Pressable>
            ) : null}
          </View>
          {searchMatches.length > 0 && searchQuery.trim() ? (
            <View className="mt-1 rounded-xl bg-gray-100 dark:bg-gray-800" style={{ overflow: 'hidden' }}>
              {searchMatches.map((book) => (
                <Pressable
                  key={book.bookId}
                  onPress={() => handleSearchComplete(book)}
                  className="flex-row items-center px-4 py-3"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <MaterialIcons name="book" size={16} color="#9ca3af" />
                  <Text className="ml-2 flex-1 text-sm text-black dark:text-white" numberOfLines={1}>{book.title}</Text>
                  <Text className="text-xs text-gray-400">{book.dueCount}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* Per-book list */}
      <FlatList
        ref={pickerListRef}
        data={bookCounts}
        keyExtractor={(item) => item.bookId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bookCounts.length === 0
          ? { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }
          : { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="items-center px-6">
            <MaterialIcons name={hasWords ? 'check-circle' : 'menu-book'} size={56} color="#9ca3af" />
            <Text className="mt-4 text-center text-base text-gray-500 dark:text-gray-400">
              {hasWords ? t('review.empty') : t('review.empty_no_lists')}
            </Text>
            {hasWords ? (
              <Text className="mt-1 text-center text-sm text-gray-400">
                {t('review.empty_hint')}
              </Text>
            ) : null}
          </View>
        }
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            pickerListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }, 200);
        }}
        renderItem={({ item }) => {
          const src = findLanguage(item.sourceLang);
          const tgt = item.targetLang ? findLanguage(item.targetLang) : null;
          const highlighted = highlightedBookId === item.bookId;
          const canStart = item.dueCount >= MIN_SESSION;
          const canReload = item.dueCount < MIN_SESSION && item.reloadableCount > 0;
          return (
            <Pressable
              onPress={() => {
                if (!canStart) {
                  if (canReload) return;
                  onMinWordToast();
                  return;
                }
                handleStartRequest(item.bookId);
              }}
              className={`mb-2 rounded-xl border px-4 py-4 ${
                highlighted ? '' : 'border-gray-300 dark:border-gray-700'
              }`}
              style={[
                highlighted ? { borderColor: '#2EC4A5' } : undefined,
                !canStart && !canReload ? { opacity: 0.4 } : undefined,
              ]}
            >
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-base font-medium text-black dark:text-white" numberOfLines={1}>
                  {item.title}
                </Text>
                <View className="ml-3 rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                  <Text className="text-sm font-semibold text-black dark:text-white">
                    {t('home.word_count', { count: item.dueCount })}
                  </Text>
                </View>
              </View>
              {src && tgt ? (
                <Text className="mt-1 text-xs text-gray-500">
                  {src.flag} {t(`languages.${src.code}`)} → {tgt.flag} {t(`languages.${tgt.code}`)}
                </Text>
              ) : null}
              {canReload ? (
                <Pressable
                  onPress={async () => {
                    await resetReviewSchedule(item.bookId);
                    await loadPickerData(sortMode, sortReversed);
                  }}
                  className="mt-2 flex-row items-center self-start rounded-lg bg-gray-100 px-3 py-1.5 dark:bg-gray-800"
                >
                  <MaterialIcons name="refresh" size={14} color="#6b7280" />
                  <Text className="ml-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t('review.reload_hint', { count: Math.min(item.reloadableCount, MAX_RELOAD) })}
                  </Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        }}
      />

      <Toast
        message={toastMsg}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        style={{ position: 'absolute', bottom: 32, left: 0, right: 0 }}
      />

      {settingsModal}
    </SafeAreaView>
  );
}
