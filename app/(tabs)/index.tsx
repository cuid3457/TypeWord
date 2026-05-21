import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackHandler,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabletContainer } from '@/components/tablet-container';
import { useTablet } from '@src/hooks/useTablet';
import { FlatList, GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppModal } from '@/components/app-modal';
import { Paywall } from '@/components/paywall';
import { StreakBanner } from '@/components/streak-banner';
import { WordlistCreateModal } from '@/components/wordlist-create-modal';
import { useRefreshReviewBadge } from '@/app/(tabs)/_layout';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePremium, useTier } from '@src/hooks/usePremium';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { findLanguage } from '@src/constants/languages';
import {
  deleteBooks,
  listBooks,
  toggleBookPinned,
  BOOK_LIMIT_BY_TIER,
  type BookSortMode,
  type BookWithCount,
} from '@src/db/queries';
import { consumePaywallPending } from '@src/services/paywallPending';
import { getCachedHome, refreshHome, subscribeHome } from '@src/services/homeCache';
import { type StreakInfo } from '@src/services/streakService';
import { isNotificationAvailable, rescheduleNotifications, getNotificationTranslations } from '@src/services/notificationService';

export default function HomeScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const refreshReviewBadge = useRefreshReviewBadge();
  const premium = usePremium();
  const tier = useTier();
  const { settings } = useUserSettings();
  const { isTablet } = useTablet();
  // Seed from boot-prefetch cache so first focus avoids the loading flash.
  const initialHome = getCachedHome();
  const [books, setBooks] = useState<BookWithCount[]>(initialHome?.books ?? []);
  const [loading, setLoading] = useState(!initialHome);
  const [sortMode, setSortMode] = useState<BookSortMode>(initialHome?.sort ?? 'recent');
  const [sortReversed, setSortReversed] = useState(initialHome?.reversed ?? false);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedBookId, setHighlightedBookId] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(initialHome?.streak ?? null);
  const longPressedRef = useRef(false);
  const flatListRef = useRef<FlatList<BookWithCount>>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for cache updates (boot prefetch, focus refresh, sort changes).
  useEffect(() => {
    return subscribeHome((snap) => {
      setBooks(snap.books);
      setStreak(snap.streak);
      setLoading(false);
    });
  }, []);

  const loadBooks = useCallback(async (sort: BookSortMode, reversed: boolean) => {
    await refreshHome(sort, reversed).finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (consumePaywallPending()) setShowPaywall(true);
      loadBooks(sortMode, sortReversed);
      if (isNotificationAvailable()) {
        rescheduleNotifications(getNotificationTranslations(t));
      }
    }, [loadBooks, sortMode, sortReversed, t]),
  );

  const handleSortChange = (mode: BookSortMode) => {
    if (mode === sortMode) {
      const next = !sortReversed;
      setSortReversed(next);
      loadBooks(mode, next);
    } else {
      setSortMode(mode);
      setSortReversed(false);
      loadBooks(mode, false);
    }
  };

  const toggleEdit = () => {
    if (editMode) {
      setSelectedIds(new Set());
    }
    setEditMode(!editMode);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePin = async (id: string) => {
    try {
      const nowPinned = await toggleBookPinned(id);
      setBooks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, pinned: nowPinned } : b)),
      );
      loadBooks(sortMode, sortReversed);
    } catch {
      // DB failed — leave UI unchanged
    }
  };

  const handleDeleteSelected = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const ids = Array.from(selectedIds);
      await deleteBooks(ids);
      setBooks((prev) => prev.filter((b) => !selectedIds.has(b.id)));
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      setEditMode(false);
      refreshReviewBadge();
    } catch {
      setShowDeleteConfirm(false);
    }
  };

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const lower = q.toLocaleLowerCase();
    return books.filter((b) => b.title.toLocaleLowerCase().includes(lower));
  }, [searchQuery, books]);

  const handleSearchComplete = (book: BookWithCount) => {
    setSearchQuery(book.title);
    Keyboard.dismiss();
    const index = books.indexOf(book);
    if (index >= 0) {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    }
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedBookId(book.id);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedBookId(null);
      setSearchQuery('');
    }, 2000);
  };

  useEffect(() => {
    if (!editMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditMode(false);
      setSelectedIds(new Set());
      return true;
    });
    return () => sub.remove();
  }, [editMode]);

  const renderItem = ({ item }: { item: BookWithCount }) => {
    const card = (
      <BookCard
        book={item}
        t={t}
        dark={colorScheme === 'dark'}
        editMode={editMode}
        selected={selectedIds.has(item.id)}
        highlighted={highlightedBookId === item.id}
        onPress={() => {
          if (longPressedRef.current) {
            longPressedRef.current = false;
            return;
          }
          if (editMode) {
            toggleSelect(item.id);
          } else {
            router.push({ pathname: '/wordlist/[id]', params: { id: item.id } });
          }
        }}
        onLongPress={() => {
          if (!editMode) {
            longPressedRef.current = true;
            setEditMode(true);
            setSelectedIds(new Set([item.id]));
          }
        }}
        onPin={() => handlePin(item.id)}
      />
    );
    // Wrap with flex:1 column on tablets so the 2-column grid splits width evenly.
    return isTablet ? <View style={{ flex: 1 }}>{card}</View> : card;
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-white dark:bg-black">
        <TabletContainer>
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pt-6">
          <View className="flex-1">
            <Text className="text-3xl font-bold text-black dark:text-white">
              {t('home.title')}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              const cap = BOOK_LIMIT_BY_TIER[tier];
              if (Number.isFinite(cap) && books.length >= cap) {
                setShowPaywall(true);
              } else {
                setShowCreateModal(true);
              }
            }}
            className="rounded-xl bg-black p-3 dark:bg-white"
            accessibilityLabel={t('home.new_button')}
            accessibilityRole="button"
          >
            <MaterialIcons
              name="add"
              size={20}
              color={colorScheme === 'dark' ? '#000' : '#fff'}
            />
          </Pressable>
        </View>

        <StreakBanner streak={streak} />

        {/* Sort buttons + edit */}
        <View className="mt-3 flex-row items-center justify-between px-6">
          <View className="flex-row gap-2">
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
          <Pressable onPress={toggleEdit} className="p-1" accessibilityLabel={editMode ? t('common.done') : t('common.edit')} accessibilityRole="button">
            <MaterialIcons
              name={editMode ? 'check' : 'edit'}
              size={20}
              color={editMode ? '#2EC4A5' : '#6b7280'}
            />
          </Pressable>
        </View>

        {/* Search bar */}
        {!loading ? (
          <View className="mt-2 px-6">
            <View>
              <View className="flex-row items-center rounded-xl bg-gray-100 px-3 dark:bg-gray-800">
                <MaterialIcons name="search" size={18} color="#9ca3af" />
                <TextInput
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setHighlightedBookId(null);
                    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                  }}
                  placeholder={t('home.search_placeholder')}
                  placeholderTextColor="#9ca3af"
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={t('home.search_placeholder')}
                  className="ml-2 flex-1 py-2.5 text-sm text-black dark:text-white"
                />
                {searchQuery ? (
                  <Pressable
                    onPress={() => {
                      setSearchQuery('');
                      setHighlightedBookId(null);
                    }}
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
                      key={book.id}
                      onPress={() => handleSearchComplete(book)}
                      className="flex-row items-center px-4 py-3"
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <MaterialIcons name="book" size={16} color="#9ca3af" />
                      <Text className="ml-2 flex-1 text-sm text-black dark:text-white" numberOfLines={1}>{book.title}</Text>
                      <Text className="text-xs text-gray-400">{t('home.word_count', { count: book.wordCount })}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-sm text-gray-400">{t('home.loading')}</Text>
          </View>
        ) : books.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10">
            <MaterialIcons name="menu-book" size={56} color="#9ca3af" />
            <Text className="mt-4 text-center text-base text-gray-500 dark:text-gray-400">
              {t('home.empty')}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              key={isTablet ? 'grid' : 'list'}
              data={books}
              keyExtractor={(b) => b.id}
              numColumns={isTablet ? 2 : 1}
              columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
              contentContainerStyle={{ padding: 24, paddingBottom: editMode ? { small: 86, medium: 104, large: 120 }[settings?.fontSize ?? 'medium'] : 24, gap: isTablet ? 12 : 0 }}
              renderItem={renderItem}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  flatListRef.current?.scrollToOffset({
                    offset: info.averageItemLength * info.index,
                    animated: true,
                  });
                }, 200);
              }}
            />
          </View>
        )}

        {/* Bottom bar in edit mode */}
        {editMode ? (
          <View className="absolute bottom-2 left-6 right-6 flex-row items-center justify-between rounded-2xl bg-gray-800 px-5 py-4 dark:bg-gray-200">
            <Pressable
              onPress={() => {
                if (selectedIds.size === books.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(books.map((b) => b.id)));
                }
              }}
              className="flex-row items-center"
              hitSlop={8}
            >
              <MaterialIcons
                name={selectedIds.size === books.length && books.length > 0 ? 'check-box' : 'check-box-outline-blank'}
                size={20}
                color={selectedIds.size === books.length && books.length > 0 ? '#2EC4A5' : '#9ca3af'}
              />
              <Text className="ml-2 text-sm font-medium text-white dark:text-black">
                {selectedIds.size > 0 ? t('home.selected_count', { count: selectedIds.size }) : t('home.select_all')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className={`rounded-xl p-2.5 ${selectedIds.size > 0 ? 'bg-red-500' : 'bg-gray-600'}`}
              accessibilityLabel={t('home.delete_selected')}
              accessibilityRole="button"
            >
              <MaterialIcons
                name="delete-outline"
                size={22}
                color={selectedIds.size > 0 ? '#fff' : '#9ca3af'}
              />
            </Pressable>
          </View>
        ) : null}
        </TabletContainer>

        <AppModal
          visible={showDeleteConfirm}
          title={t('home.confirm_delete_title')}
          message={t('home.confirm_delete_message', { count: selectedIds.size })}
          buttonText={t('wordlist.cancel')}
          confirmText={t('wordlist.confirm_delete')}
          destructive
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteSelected}
        />

        <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} reason="books" />

        <WordlistCreateModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onPickBlank={() => router.push('/wordlist/new')}
          onPickBrowse={() => router.push('/wordlist/library')}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function BookCard({
  book,
  t,
  dark,
  editMode,
  selected,
  highlighted,
  onPress,
  onLongPress,
  onPin,
}: {
  book: BookWithCount;
  t: (key: string, opts?: Record<string, unknown>) => string;
  dark: boolean;
  editMode: boolean;
  selected: boolean;
  highlighted: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPin: () => void;
}) {
  const src = findLanguage(book.sourceLang);
  const tgt = book.targetLang ? findLanguage(book.targetLang) : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className={`mb-2 rounded-xl border px-4 py-4 ${
        highlighted
          ? 'bg-white dark:bg-black'
          : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-black'
      }`}
      style={highlighted ? { borderColor: '#2EC4A5' } : undefined}
    >
      <View className="flex-row items-center">
        {/* Checkbox in edit mode */}
        {editMode ? (
          <View className="mr-3">
            <MaterialIcons
              name={selected ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={selected ? '#ef4444' : '#9ca3af'}
            />
          </View>
        ) : null}

        {/* Pin indicator in normal mode */}
        {!editMode && book.pinned ? (
          <MaterialIcons name="push-pin" size={14} color="#9ca3af" style={{ marginRight: 6 }} />
        ) : null}

        <View className="flex-1">
          <Text className="text-base font-medium text-black dark:text-white" numberOfLines={1}>
            {book.title}
          </Text>
          {src && tgt ? (
            <Text className="mt-1 text-xs text-gray-500">
              {src.flag} {t(`languages.${src.code}`)} → {tgt.flag} {t(`languages.${tgt.code}`)}
            </Text>
          ) : null}
        </View>
        <View className="ml-3 rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
          <Text className="text-sm font-semibold text-black dark:text-white">
            {t('home.word_count', { count: book.wordCount })}
          </Text>
        </View>

        {/* Edit mode: pin */}
        {editMode ? (
          <Pressable onPress={onPin} className="ml-2 p-1">
            <MaterialIcons
              name="push-pin"
              size={18}
              color={book.pinned ? (dark ? '#fff' : '#000') : '#d1d5db'}
            />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
