import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { FlatList, Keyboard, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { refreshReview } from '@src/services/reviewCache';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabletContainer } from '@/components/tablet-container';
import { useTablet } from '@src/hooks/useTablet';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { StreakBanner } from '@/components/streak-banner';
import { Toast } from '@/components/toast';
import { NativeAdCard } from '@/components/native-ad-card';
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

const MIN_SESSION = 10;

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
  const [refreshing, setRefreshing] = useState(false);
  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshReview();
    } finally {
      setRefreshing(false);
    }
  };
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const { isTablet, contentWidth } = useTablet();

  // Header rendered OUTSIDE the FlatList (as a sibling, not via
  // ListHeaderComponent) to match the wordlist tab's structure exactly.
  // We use a Fragment (not a wrapping <View>) so the four chrome rows
  // become individual flex items of TabletContainer — wordlist tab does
  // the same. A wrapping <View> would collapse them into ONE flex item,
  // and the resulting layout pass shifted review's content by ~1px.
  const headerEl = (
    <>
      {/* Header — structure must be byte-for-byte parallel with the
          wordlist tab (app/(tabs)/index.tsx) for the title baseline
          to land on the exact same pixel. The wordlist tab pairs the
          title with a `rounded-xl bg-black p-3` "+" Pressable that
          measures 44 × 44 (p-3 = 12 + 20 icon + 12). Review has no
          action button, so we mirror with a same-sized invisible
          spacer — `h-11 w-11` is exactly 44 × 44. This keeps the
          flex-row items-center math identical (cross-axis size =
          max(child heights) = 44), preventing the sub-pixel y-drift
          we hit when review used h-11 + flex-1 wrapping. */}
      <View className="flex-row items-center justify-between px-6 pt-6">
        <View className="flex-1">
          <Text className="text-3xl font-extrabold tracking-tight text-ink dark:text-ink-dark">
            {t('review.title')}
          </Text>
        </View>
        <View className="h-11 w-11" />
      </View>

      <View className="px-6">
        <StreakBanner streak={streak} />
      </View>

      {/* Sort buttons */}
      <View className="mt-3 flex-row gap-2 px-6">
        {(['recent', 'created', 'words'] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => handleSortChange(mode)}
            className={`flex-row items-center rounded-xl px-3 py-1.5 ${
              sortMode === mode
                ? 'bg-ink dark:bg-ink-dark'
                : 'bg-clay dark:bg-clay-dark'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                sortMode === mode
                  ? 'text-canvas dark:text-canvas-dark'
                  : 'text-muted'
              }`}
            >
              {t(`home.sort_${mode}`)}
            </Text>
            {sortMode === mode ? (
              <MaterialIcons
                name={sortReversed ? 'arrow-upward' : 'arrow-downward'}
                size={12}
                color={colorScheme === 'dark' ? '#15130E' : '#F4F1EA'}
                style={{ marginLeft: 2 }}
              />
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* Search bar */}
      <View className="mt-2 px-6">
        <View>
          <View className="flex-row items-center rounded-xl bg-clay px-3 dark:bg-clay-dark">
            <MaterialIcons name="search" size={18} color="#A79E90" />
            <TextInput
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              placeholder={t('home.search_placeholder')}
              placeholderTextColor="#A79E90"
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              className="ml-2 flex-1 py-2.5 text-sm text-ink dark:text-ink-dark"
            />
            {searchQuery ? (
              <Pressable
                onPress={() => onSearchQueryChange('')}
                className="ml-1 p-1"
                accessibilityLabel={t('common.clear')}
                accessibilityRole="button"
              >
                <MaterialIcons name="close" size={16} color="#A79E90" />
              </Pressable>
            ) : null}
          </View>
          {searchMatches.length > 0 && searchQuery.trim() ? (
            <View className="mt-1 rounded-xl bg-clay dark:bg-clay-dark" style={{ overflow: 'hidden' }}>
              {searchMatches.map((book) => (
                <Pressable
                  key={book.bookId}
                  onPress={() => handleSearchComplete(book)}
                  className="flex-row items-center px-4 py-3"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <MaterialIcons name="book" size={16} color="#A79E90" />
                  <Text className="ml-2 flex-1 text-sm text-ink dark:text-ink-dark" numberOfLines={1}>{book.title}</Text>
                  <Text className="text-xs text-faint">{book.dueCount}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <TabletContainer>
      {headerEl}
      {/* Per-book list — header rendered above, outside FlatList, to
          match the wordlist tab structure pixel-for-pixel. */}
      <View style={{ flex: 1 }}>
      <FlatList
        ref={pickerListRef}
        key={isTablet ? 'grid' : 'list'}
        data={bookCounts}
        keyExtractor={(item) => item.bookId}
        showsVerticalScrollIndicator={false}
        numColumns={isTablet ? 2 : 1}
        columnWrapperStyle={isTablet ? { gap: 12, paddingHorizontal: 24 } : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} tintColor="#2EC4A5" colors={['#2EC4A5']} />
        }
        contentContainerStyle={bookCounts.length === 0
          ? { flexGrow: 1, paddingHorizontal: 24 }
          : { paddingTop: 24, paddingBottom: 24, gap: isTablet ? 12 : 0 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center px-6">
            <MaterialIcons name={hasWords ? 'check-circle' : 'menu-book'} size={56} color={hasWords ? '#2EC4A5' : '#A79E90'} />
            <Text className="mt-4 text-center text-base text-muted">
              {hasWords ? t('review.empty') : t('review.empty_no_lists')}
            </Text>
            {hasWords ? (
              <Text className="mt-1 text-center text-sm text-faint">
                {t('review.empty_hint')}
              </Text>
            ) : null}
          </View>
        }
        ListFooterComponent={bookCounts.length > 0 ? (
          <View className="mt-3 px-6">
            <NativeAdCard />
          </View>
        ) : null}
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
          const tabletCardWidth = (contentWidth - 24 * 2 - 12) / 2;
          return (
            <Pressable
              onPress={async () => {
                if (canStart) {
                  handleStartRequest(item.bookId);
                  return;
                }
                // Below MIN_SESSION but the user has finished cards they can
                // re-queue. The card *is* the reload affordance — the inner
                // chip is just a visual label (nested Pressable used to
                // swallow the tap into onMinWordToast).
                if (canReload) {
                  await resetReviewSchedule(item.bookId);
                  await loadPickerData(sortMode, sortReversed);
                  return;
                }
                onMinWordToast();
              }}
              className={`rounded-[20px] border border-line bg-surface px-4 py-4 dark:border-line-dark dark:bg-surface-dark ${isTablet ? '' : 'mx-6 mb-3'}`}
              style={[
                isTablet ? { width: tabletCardWidth } : null,
                highlighted ? { borderColor: '#2EC4A5' } : null,
              ]}
            >
              {/* Dimmed header/meta only — reload button below stays full opacity.
                  Layout mirrors the wordlist tab BookCard: flag tile + title +
                  language in a flex-1 column, due-count chip on the right. */}
              <View style={!canStart ? { opacity: 0.4 } : undefined}>
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-base font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
                      {item.title}
                    </Text>
                    {src && tgt ? (
                      <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
                        {t(`languages.${src.code}`)} → {t(`languages.${tgt.code}`)}
                      </Text>
                    ) : null}
                  </View>
                  <View className={`ml-3 rounded-full px-3 py-1 ${canStart ? 'bg-accent-soft dark:bg-accent-soft-dark' : 'bg-clay dark:bg-clay-dark'}`}>
                    <Text className={`text-sm font-bold ${canStart ? 'text-accent-deep dark:text-accent' : 'text-ink dark:text-ink-dark'}`}>
                      {t('home.word_count', { count: item.dueCount })}
                    </Text>
                  </View>
                </View>
              </View>
              {canReload ? (
                <View className="mt-3 flex-row items-center self-start rounded-xl border border-accent bg-clay px-3 py-1.5 dark:bg-clay-dark">
                  <MaterialIcons name="refresh" size={14} color="#2EC4A5" />
                  <Text className="ml-1 text-xs font-semibold text-accent-deep dark:text-accent">
                    {t('review.reload_hint', { count: Math.min(item.reloadableCount, MAX_RELOAD) })}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
      </View>

      <Toast
        message={toastMsg}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
        style={{ position: 'absolute', bottom: 32, left: 0, right: 0 }}
      />
      </TabletContainer>

      {settingsModal}
    </SafeAreaView>
  );
}
