import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletContainer } from '@/components/tablet-container';
import { useTablet } from '@src/hooks/useTablet';

import { Toast } from '@/components/toast';
import { NativeAdCard } from '@/components/native-ad-card';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { findLanguage, STUDY_LANGUAGES } from '@src/constants/languages';
import { type CommunitySortMode, type CommunityWordlistMeta } from '@src/services/communityWordlistService';
import { getCachedLibrary, refreshLibrary, subscribeLibrary } from '@src/services/libraryCache';
import { NicknameModal } from '@/components/nickname-modal';
import { ProfileSetupModal } from '@/components/profile-setup-modal';
import { getMyProfile } from '@src/services/friendsService';
import { haptic } from '@src/services/hapticService';

export default function LibraryTabScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const { isTablet, contentWidth } = useTablet();
  const insets = useSafeAreaInsets();
  // Seed from the boot-prefetch cache so the first focus has data.
  const initial = getCachedLibrary();
  const [sortMode, setSortMode] = useState<CommunitySortMode>(initial?.sort ?? 'likes');
  const [sortReversed, setSortReversed] = useState(initial?.reversed ?? false);
  const [searchQuery, setSearchQuery] = useState(initial?.search ?? '');
  const [sourceLangFilter, setSourceLangFilter] = useState<string | null>(initial?.sourceLang ?? null);
  const [targetLangFilter, setTargetLangFilter] = useState<string | null>(initial?.targetLang ?? null);
  const [picker, setPicker] = useState<'source' | 'target' | null>(null);
  const [items, setItems] = useState<CommunityWordlistMeta[]>(initial?.items ?? []);
  const [loading, setLoading] = useState(!initial);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  // Tracks the action that triggered ProfileSetupModal, so we can resume it
  // (route to the upload page or my-uploads page) once the user finishes setup.
  const [profileNextAction, setProfileNextAction] = useState<'upload' | 'my_uploads' | null>(null);
  const [pendingProfile, setPendingProfile] = useState<{ displayName: string | null; username: string | null } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showNickname, setShowNickname] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for cache updates (boot prefetch, focus refresh, mutations).
  useEffect(() => {
    return subscribeLibrary((snap) => {
      setItems(snap.items);
      setLoading(false);
    });
  }, []);

  const reload = useCallback(() => {
    refreshLibrary(sortMode, searchQuery, sourceLangFilter, targetLangFilter, sortReversed)
      .then(() => setError(null))
      .catch((e: unknown) => {
        setError(e instanceof Error && e.message ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
  }, [sortMode, searchQuery, sourceLangFilter, targetLangFilter, sortReversed]);

  const handleSortPress = useCallback((mode: CommunitySortMode) => {
    if (mode === sortMode) {
      setSortReversed((r) => !r);
    } else {
      setSortMode(mode);
      setSortReversed(false);
    }
  }, [sortMode]);

  const handleUploadPress = useCallback(async () => {
    haptic.tap();
    const profile = await getMyProfile().catch(() => null);
    if (!profile || profile.isAnonymous) {
      setToast({ msg: t('library_tab.upload_signin_required'), type: 'error' });
      return;
    }
    if (!profile.username || !profile.displayName?.trim()) {
      setPendingProfile({ displayName: profile.displayName, username: profile.username });
      setProfileNextAction('upload');
      setShowProfileSetup(true);
      return;
    }
    router.push('/community-upload');
  }, [t]);

  const handleMyUploadsPress = useCallback(async () => {
    haptic.tap();
    const profile = await getMyProfile().catch(() => null);
    if (!profile || profile.isAnonymous) {
      setToast({ msg: t('library_tab.upload_signin_required'), type: 'error' });
      return;
    }
    if (!profile.username || !profile.displayName?.trim()) {
      setPendingProfile({ displayName: profile.displayName, username: profile.username });
      setProfileNextAction('my_uploads');
      setShowProfileSetup(true);
      return;
    }
    router.push('/my-uploads');
  }, [t]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  // Re-fetch when sort/direction or language filters change (search reloads on submit).
  useEffect(() => { reload(); }, [sortMode, sortReversed, sourceLangFilter, targetLangFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: refresh the library feed when a new community wordlist is
  // inserted on the server. Same pattern as the friendships subscription
  // on the dashboard — more reliable than tab-refocus alone.
  //
  // We subscribe ONCE on mount and use a ref for `reload` so filter
  // changes don't tear down + recreate the channel. Without the ref,
  // re-renders re-ran the async setup before the previous cleanup
  // resolved → two channels with the same topic existed momentarily,
  // and Supabase Realtime rejected the second `.on()` with "cannot add
  // postgres_changes callbacks after subscribe()".
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    // Per-mount unique channel name so a rapid mount/unmount cycle
    // (e.g. Expo Router hydration on web) can't hand back a stale
    // already-subscribed channel from Supabase's by-name registry.
    // Without this we hit "cannot add postgres_changes callbacks after
    // subscribe()" whenever the SDK returned the previous mount's
    // half-torn-down channel.
    const channelName = `community-wordlists-feed-${Math.random().toString(36).slice(2, 10)}`;
    (async () => {
      const { supabase } = await import('@src/api/supabase');
      if (cancelled) return;
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_wordlists' },
          () => { reloadRef.current(); },
        )
        .subscribe();
      if (cancelled) {
        supabase.removeChannel(channel);
        return;
      }
      cleanup = () => { supabase.removeChannel(channel); };
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Inject native ad markers: one at the top + one every N items thereafter.
  // Top placement guarantees cold-start users still see an ad without scrolling.
  type AdItem = { __ad: true; key: string };
  const itemsWithAds = useMemo<Array<CommunityWordlistMeta | AdItem>>(() => {
    if (items.length === 0) return items;
    const adsEvery = 7;
    const out: Array<CommunityWordlistMeta | AdItem> = [{ __ad: true, key: 'ad-top' }];
    items.forEach((it, idx) => {
      out.push(it);
      if ((idx + 1) % adsEvery === 0 && idx < items.length - 1) {
        out.push({ __ad: true, key: `ad-${idx}` });
      }
    });
    return out;
  }, [items, isTablet]);

  // Header rendered OUTSIDE the FlatList — Fragment (not <View>) so
  // each chrome row becomes an individual flex item of TabletContainer,
  // matching wordlist tab byte-for-byte. A wrapping View would collapse
  // them into one flex item and shift content by ~1px (sub-pixel layout
  // pass differs).
  const headerEl = (
    <>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-6">
        <View className="flex-1">
          <Text className="text-3xl font-extrabold tracking-tight text-ink dark:text-ink-dark">
            {t('tabs.library')}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleMyUploadsPress}
            className="rounded-full bg-ink p-3 dark:bg-ink-dark"
            accessibilityLabel={t('library_tab.my_uploads')}
            accessibilityRole="button"
          >
            <MaterialIcons
              name="person"
              size={20}
              color={colorScheme === 'dark' ? '#15130E' : '#F4F1EA'}
            />
          </Pressable>
          <Pressable
            onPress={handleUploadPress}
            className="rounded-full bg-ink p-3 dark:bg-ink-dark"
            accessibilityLabel={t('library_tab.upload_button')}
            accessibilityRole="button"
          >
            <MaterialIcons
              name="add"
              size={20}
              color={colorScheme === 'dark' ? '#15130E' : '#F4F1EA'}
            />
          </Pressable>
        </View>
      </View>

      {/* Row 1: sort buttons */}
      <View className="mt-3 flex-row gap-2 px-6">
        {(['likes', 'downloads'] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => handleSortPress(mode)}
            className={`flex-row items-center rounded-xl px-3 py-1.5 ${
              sortMode === mode ? 'bg-ink dark:bg-ink-dark' : 'bg-clay dark:bg-clay-dark'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                sortMode === mode ? 'text-canvas dark:text-canvas-dark' : 'text-muted'
              }`}
            >
              {t(`library_tab.sort_${mode}`)}
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

      {/* Row 2: language filter buttons */}
      <View className="mt-2 flex-row gap-2 px-6">
        {(['source', 'target'] as const).map((side) => {
          const value = side === 'source' ? sourceLangFilter : targetLangFilter;
          const lang = value ? findLanguage(value) : null;
          const active = !!value;
          return (
            <Pressable
              key={side}
              onPress={() => setPicker(side)}
              className={`flex-row items-center rounded-xl px-3 py-1.5 ${
                active ? 'bg-ink dark:bg-ink-dark' : 'bg-clay dark:bg-clay-dark'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  active ? 'text-canvas dark:text-canvas-dark' : 'text-muted'
                }`}
              >
                {lang
                  ? t(`languages.${lang.code}`)
                  : t(`library_tab.filter_${side}`)}
              </Text>
              <MaterialIcons
                name="arrow-drop-down"
                size={16}
                color={active ? (colorScheme === 'dark' ? '#15130E' : '#F4F1EA') : '#A79E90'}
                style={{ marginLeft: 2 }}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Search bar */}
      <View className="mt-2 px-6">
        <View className="flex-row items-center rounded-xl bg-clay px-3 dark:bg-clay-dark">
          <MaterialIcons name="search" size={18} color="#A79E90" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('library_tab.search_placeholder')}
            placeholderTextColor="#A79E90"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={reload}
            className="ml-2 flex-1 py-2.5 text-sm text-ink dark:text-ink-dark"
          />
          {searchQuery ? (
            <Pressable onPress={() => { setSearchQuery(''); setTimeout(reload, 0); }} className="ml-1 p-1">
              <MaterialIcons name="close" size={16} color="#A79E90" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <TabletContainer>
      {headerEl}
      <View style={{ flex: 1 }}>
      {(
        <FlatList
          key={isTablet ? 'grid' : 'list'}
          data={loading ? [] : itemsWithAds}
          keyExtractor={(it) => ('__ad' in it ? it.key : it.id)}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { gap: 12, paddingHorizontal: 24 } : undefined}
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 80, gap: isTablet ? 12 : 0 }}
          ListEmptyComponent={
            loading ? (
              <View className="items-center justify-center py-12">
                <ActivityIndicator color="#2EC4A5" />
              </View>
            ) : error ? (
              <View className="items-center justify-center px-10 py-12">
                <MaterialIcons name="error-outline" size={48} color="#A79E90" />
                <Text className="mt-4 text-center text-xl font-bold text-ink dark:text-ink-dark">
                  {t('error.title')}
                </Text>
                <Text className="mt-2 text-center text-sm text-muted">
                  {t('error.message')}
                </Text>
                {error !== 'unknown' ? (
                  <Text className="mt-2 text-center text-xs text-faint" numberOfLines={3}>
                    {error}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => { setLoading(true); reload(); }}
                  className="mt-8 items-center rounded-xl bg-ink px-8 py-4 dark:bg-ink-dark"
                >
                  <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
                    {t('error.retry')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="items-center justify-center px-8 py-12">
                <View className="h-32 w-32 items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
                  <Image
                    source={require('../../assets/images/android-icon-foreground.png')}
                    style={{ width: 104, height: 104 }}
                    resizeMode="contain"
                  />
                </View>
                <Text className="mt-5 text-center text-lg font-bold text-ink dark:text-ink-dark">
                  {t('library_tab.empty_title')}
                </Text>
                <Text className="mt-2 text-center text-sm text-muted">
                  {t('library_tab.empty_hint')}
                </Text>
              </View>
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                haptic.tap();
                setRefreshing(true);
                try {
                  await refreshLibrary(sortMode, searchQuery, sourceLangFilter, targetLangFilter, sortReversed);
                } finally {
                  setRefreshing(false);
                }
              }}
              tintColor="#2EC4A5"
              colors={['#2EC4A5']}
            />
          }
          renderItem={({ item }) => {
            // Tablet grid: fixed half-width card. Drops flex:1 entirely so
            // a lone last-row item doesn't stretch — the empty right slot
            // just stays empty. Row padding/gap is on columnWrapperStyle.
            const tabletCardWidth = (contentWidth - 24 * 2 - 12) / 2;
            if ('__ad' in item) {
              return (
                <View
                  className={isTablet ? '' : 'mx-6 mb-3'}
                  style={isTablet ? { width: tabletCardWidth } : null}
                >
                  <NativeAdCard />
                </View>
              );
            }
            return (
              <Pressable
                onPress={() => router.push(`/community-detail/${item.id}`)}
                className={`rounded-[20px] border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark ${isTablet ? '' : 'mx-6 mb-3'}`}
                style={isTablet ? { width: tabletCardWidth } : null}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="text-base font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.uploaderName ? (
                      <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
                        @{item.uploaderName}
                      </Text>
                    ) : null}
                  </View>
                  <View className="ml-3 items-end">
                    <View className="rounded-full bg-clay px-3 py-1 dark:bg-clay-dark">
                      <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                        {t('home.word_count', { count: item.wordCount })}
                      </Text>
                    </View>
                    <View className="mt-1 flex-row items-center gap-3">
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
              </Pressable>
            );
          }}
        />
      )}
      </View>

      <NicknameModal
        visible={showNickname}
        onSaved={() => {
          setShowNickname(false);
          router.push('/community-upload');
        }}
        onCancel={() => setShowNickname(false)}
      />
      <ProfileSetupModal
        visible={showProfileSetup}
        initialDisplayName={pendingProfile?.displayName ?? ''}
        initialUsername={pendingProfile?.username ?? ''}
        cancellable
        onSaved={() => {
          setShowProfileSetup(false);
          const next = profileNextAction;
          setProfileNextAction(null);
          if (next === 'upload') router.push('/community-upload');
          else if (next === 'my_uploads') router.push('/my-uploads');
        }}
        onCancel={() => {
          setShowProfileSetup(false);
          setProfileNextAction(null);
        }}
      />
      </TabletContainer>

      {/* Language filter picker — opened from the source/target buttons */}
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable onPress={() => setPicker(null)} className="flex-1 items-center justify-center bg-black/50 px-6">
          <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface dark:bg-surface-dark">
            <View className="border-b border-line px-5 py-4 dark:border-line-dark">
              <Text className="text-base font-bold text-ink dark:text-ink-dark">
                {picker === 'source' ? t('library_tab.filter_source') : t('library_tab.filter_target')}
              </Text>
            </View>
            <FlatList
              data={[null, ...STUDY_LANGUAGES]}
              keyExtractor={(l, i) => l?.code ?? `__all_${i}`}
              style={{ maxHeight: 360 }}
              renderItem={({ item: lang }) => {
                const current = picker === 'source' ? sourceLangFilter : targetLangFilter;
                const selected = lang ? current === lang.code : current === null;
                return (
                  <Pressable
                    onPress={() => {
                      const next = lang?.code ?? null;
                      if (picker === 'source') setSourceLangFilter(next);
                      else setTargetLangFilter(next);
                      setPicker(null);
                    }}
                    className="flex-row items-center px-5 py-3"
                  >
                    <Text className="flex-1 text-sm text-ink dark:text-ink-dark">
                      {lang ? t(`languages.${lang.code}`) : t('library_tab.filter_all')}
                    </Text>
                    {selected ? <MaterialIcons name="check" size={18} color="#2EC4A5" /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
      <Toast visible={!!toast} message={toast?.msg ?? ''} type={toast?.type ?? 'success'} onHide={() => setToast(null)} style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }} />
    </SafeAreaView>
  );
}
