import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { haptic } from '@src/services/hapticService';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabletContainer } from '@/components/tablet-container';
import { floatingShadow } from '@/components/ui/card';
import { webCursor } from '@/components/ui/pressable-card';
import { useTablet } from '@src/hooks/useTablet';

import { AppModal } from '@/components/app-modal';
import { StreakBanner } from '@/components/streak-banner';
import { WordlistCreateModal } from '@/components/wordlist-create-modal';
import { NativeAdCard } from '@/components/native-ad-card';
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
  const { isTablet, contentWidth } = useTablet();
  // Seed from boot-prefetch cache so first focus avoids the loading flash.
  const initialHome = getCachedHome();
  const [books, setBooks] = useState<BookWithCount[]>(initialHome?.books ?? []);
  const [loading, setLoading] = useState(!initialHome);
  const [sortMode, setSortMode] = useState<BookSortMode>(initialHome?.sort ?? 'recent');
  const [sortReversed, setSortReversed] = useState(initialHome?.reversed ?? false);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedBookId, setHighlightedBookId] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(initialHome?.streak ?? null);
  const longPressedRef = useRef(false);
  const flatListRef = useRef<FlatList<BookWithCount | { __ad: true; key: string }>>(null);
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
      if (consumePaywallPending()) router.push('/subscription');
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
      haptic.warning();
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

  // Web: Escape key exits edit mode — the small ✓ in the corner is
  // easy to miss with a mouse, and there's no hardware back button.
  // Native: skip entirely. RN polyfills `window` as an object without
  // addEventListener, so the `typeof window === 'undefined'` guard alone
  // wasn't enough — the call still went through and crashed in production.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!editMode) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode]);

  // Inject native ad markers: one at the top + one every N items thereafter.
  // Top placement guarantees cold-start users (few wordlists) still see an
  // ad without scrolling. Skip in editMode (selection UI inline with ad
  // invites accidental clicks).
  type AdItem = { __ad: true; key: string };
  const booksWithAds = useMemo<Array<BookWithCount | AdItem>>(() => {
    if (editMode || books.length === 0) return books;
    const adsEvery = isTablet ? 14 : 7;
    const out: Array<BookWithCount | AdItem> = [{ __ad: true, key: 'ad-top' }];
    books.forEach((b, idx) => {
      out.push(b);
      if ((idx + 1) % adsEvery === 0 && idx < books.length - 1) {
        out.push({ __ad: true, key: `ad-${idx}` });
      }
    });
    return out;
  }, [books, editMode, isTablet]);

  const renderItem = ({ item }: { item: BookWithCount | AdItem }) => {
    if ('__ad' in item) {
      const tabletCardWidth = isTablet ? (contentWidth - 24 * 2 - 12) / 2 : undefined;
      return (
        <View
          className={isTablet ? '' : 'mx-6 mb-3'}
          style={isTablet ? { width: tabletCardWidth } : undefined}
        >
          <NativeAdCard />
        </View>
      );
    }
    const card = (
      <BookCard
        book={item}
        t={t}
        dark={colorScheme === 'dark'}
        editMode={editMode}
        selected={selectedIds.has(item.id)}
        highlighted={highlightedBookId === item.id}
        noOuterMargin={isTablet}
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
    // Tablet grid: fixed half-width cell. Drops flex:1 so a lone last-row
    // card stays half-width instead of stretching. Row padding/gap is on
    // columnWrapperStyle.
    if (isTablet) {
      const tabletCardWidth = (contentWidth - 24 * 2 - 12) / 2;
      return <View style={{ width: tabletCardWidth }}>{card}</View>;
    }
    return card;
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <TabletContainer>
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pt-6">
          <View className="flex-1">
            <Text className="text-3xl font-extrabold tracking-tight text-ink dark:text-ink-dark">
              {t('home.title')}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              haptic.tap();
              const cap = BOOK_LIMIT_BY_TIER[tier];
              if (Number.isFinite(cap) && books.length >= cap) {
                router.push('/subscription');
              } else {
                setShowCreateModal(true);
              }
            }}
            style={webCursor}
            className="rounded-full bg-ink p-3 dark:bg-ink-dark"
            accessibilityLabel={t('home.new_button')}
            accessibilityRole="button"
          >
            <MaterialIcons
              name="add"
              size={20}
              color={colorScheme === 'dark' ? '#15130E' : '#F4F1EA'}
            />
          </Pressable>
        </View>

        <View className="px-6">
          <StreakBanner streak={streak} />
        </View>

        {/* Sort buttons + edit */}
        <View className="mt-3 flex-row items-center justify-between px-6">
          <View className="flex-row gap-2">
            {(['recent', 'created', 'words'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => handleSortChange(mode)}
                style={webCursor}
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
          <Pressable onPress={toggleEdit} style={webCursor} className="p-1" accessibilityLabel={editMode ? t('common.done') : t('common.edit')} accessibilityRole="button">
            <MaterialIcons
              name={editMode ? 'check' : 'edit'}
              size={20}
              color={editMode ? '#2EC4A5' : '#7B7366'}
            />
          </Pressable>
        </View>

        {/* Search bar */}
        {!loading ? (
          <View className="mt-2 px-6">
            <View>
              <View className="flex-row items-center rounded-xl bg-clay px-3 dark:bg-clay-dark">
                <MaterialIcons name="search" size={18} color="#A79E90" />
                <TextInput
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setHighlightedBookId(null);
                    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                  }}
                  placeholder={t('home.search_placeholder')}
                  placeholderTextColor="#A79E90"
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={t('home.search_placeholder')}
                  className="ml-2 flex-1 py-2.5 text-sm text-ink dark:text-ink-dark"
                />
                {searchQuery ? (
                  <Pressable
                    onPress={() => {
                      setSearchQuery('');
                      setHighlightedBookId(null);
                    }}
                    style={webCursor}
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
                      key={book.id}
                      onPress={() => handleSearchComplete(book)}
                      className="flex-row items-center px-4 py-3"
                      style={({ pressed }) => [webCursor, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <MaterialIcons name="book" size={16} color="#A79E90" />
                      <Text className="ml-2 flex-1 text-sm text-ink dark:text-ink-dark" numberOfLines={1}>{book.title}</Text>
                      <Text className="text-xs text-faint">{t('home.word_count', { count: book.wordCount })}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#2EC4A5" />
          </View>
        ) : books.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10">
            <View className="h-32 w-32 items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
              <Image
                source={require('../../assets/images/android-icon-foreground.png')}
                style={{ width: 104, height: 104 }}
                resizeMode="contain"
              />
            </View>
            <Text className="mt-5 text-center text-lg font-bold text-ink dark:text-ink-dark">
              {t('home.empty')}
            </Text>
            <Pressable
              onPress={() => { haptic.tap(); setShowCreateModal(true); }}
              className="mt-5 rounded-xl bg-accent px-6 py-3"
              accessibilityRole="button"
              accessibilityLabel={t('home.new_button')}
            >
              <Text className="text-sm font-bold text-white">{t('home.new_button')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              key={isTablet ? 'grid' : 'list'}
              data={booksWithAds}
              keyExtractor={(b) => ('__ad' in b ? b.key : b.id)}
              numColumns={isTablet ? 2 : 1}
              columnWrapperStyle={isTablet ? { gap: 12, paddingHorizontal: 24 } : undefined}
              contentContainerStyle={{ paddingTop: 24, paddingBottom: editMode ? { small: 86, medium: 104, large: 120 }[settings?.fontSize ?? 'medium'] : 24, gap: isTablet ? 12 : 0, flexGrow: 1 }}
              // In edit mode, the scroll area below the last card row
              // becomes a Pressable — tapping empty space exits edit
              // mode (click-outside-to-deselect, matching desktop UX).
              ListFooterComponent={editMode ? (
                <Pressable
                  onPress={() => { setEditMode(false); setSelectedIds(new Set()); }}
                  style={{ flex: 1, minHeight: 200 }}
                />
              ) : null}
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
          <View className="absolute bottom-2 left-6 right-6 flex-row items-center justify-between rounded-2xl bg-ink px-5 py-4 dark:bg-ink-dark" style={floatingShadow}>
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
                color={selectedIds.size === books.length && books.length > 0 ? '#2EC4A5' : '#A79E90'}
              />
              <Text className="ml-2 text-sm font-semibold text-canvas dark:text-canvas-dark">
                {selectedIds.size > 0 ? t('home.selected_count', { count: selectedIds.size }) : t('home.select_all')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className={`rounded-xl p-2.5 ${selectedIds.size > 0 ? 'bg-danger' : 'bg-clay dark:bg-clay-dark'}`}
              accessibilityLabel={t('home.delete_selected')}
              accessibilityRole="button"
            >
              <MaterialIcons
                name="delete-outline"
                size={22}
                color={selectedIds.size > 0 ? '#fff' : '#A79E90'}
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

        <WordlistCreateModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onPickBlank={() => router.push('/wordlist/new')}
          onPickBrowse={() => router.push('/wordlist/library')}
        />
    </SafeAreaView>
  );
}

function BookCard({
  book,
  t,
  dark,
  editMode,
  selected,
  highlighted,
  noOuterMargin,
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
  /** When true, drops the default `mx-6 mb-2`. Used on tablet where the
   *  parent grid wrapper owns horizontal spacing. */
  noOuterMargin?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPin: () => void;
}) {
  const src = findLanguage(book.sourceLang);
  const tgt = book.targetLang ? findLanguage(book.targetLang) : null;
  const [hovered, setHovered] = useState(false);
  const isWeb = Platform.OS === 'web';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onHoverIn={isWeb ? () => setHovered(true) : undefined}
      onHoverOut={isWeb ? () => setHovered(false) : undefined}
      style={webCursor}
      className={`${noOuterMargin ? '' : 'mx-6 mb-3'} rounded-[20px] border px-4 py-4 ${
        highlighted
          ? 'border-accent bg-accent-soft dark:bg-accent-soft-dark'
          : hovered
            ? 'border-faint bg-clay dark:border-line-dark dark:bg-clay-dark'
            : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark'
      }`}
    >
      <View className="flex-row items-center">
        {/* Checkbox in edit mode */}
        {editMode ? (
          <View className="mr-3">
            <MaterialIcons
              name={selected ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={selected ? '#E0654F' : '#A79E90'}
            />
          </View>
        ) : null}

        <View className="flex-1">
          <View className="flex-row items-center">
            {!editMode && book.pinned ? (
              <MaterialIcons name="push-pin" size={13} color="#A79E90" style={{ marginRight: 4 }} />
            ) : null}
            <Text className="flex-1 text-base font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
              {book.title}
            </Text>
          </View>
          {src && tgt ? (
            <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
              {t(`languages.${src.code}`)} → {t(`languages.${tgt.code}`)}
            </Text>
          ) : null}
        </View>
        <View className="ml-3 rounded-full bg-clay px-3 py-1 dark:bg-clay-dark">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            {t('home.word_count', { count: book.wordCount })}
          </Text>
        </View>

        {/* Edit mode: pin */}
        {editMode ? (
          <Pressable onPress={onPin} className="ml-2 p-1">
            <MaterialIcons
              name="push-pin"
              size={18}
              color={book.pinned ? '#2EC4A5' : '#A79E90'}
            />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
