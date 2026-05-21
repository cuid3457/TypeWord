import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabletContainer } from '@/components/tablet-container';
import { useTablet } from '@src/hooks/useTablet';

import { Toast } from '@/components/toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { findLanguage, STUDY_LANGUAGES } from '@src/constants/languages';
import { type CommunitySortMode, type CommunityWordlistMeta } from '@src/services/communityWordlistService';
import { getCachedLibrary, refreshLibrary, subscribeLibrary } from '@src/services/libraryCache';
import { NicknameModal } from '@/components/nickname-modal';
import { ProfileSetupModal } from '@/components/profile-setup-modal';
import { getMyProfile } from '@src/services/friendsService';

export default function LibraryTabScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const { isTablet } = useTablet();
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

  // Listen for cache updates (boot prefetch, focus refresh, mutations).
  useEffect(() => {
    return subscribeLibrary((snap) => {
      setItems(snap.items);
      setLoading(false);
    });
  }, []);

  const reload = useCallback(() => {
    refreshLibrary(sortMode, searchQuery, sourceLangFilter, targetLangFilter, sortReversed).finally(() => setLoading(false));
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
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      const { supabase } = await import('@src/api/supabase');
      const channel = supabase
        .channel('community-wordlists-feed')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_wordlists' },
          () => { reload(); },
        )
        .subscribe();
      unsub = () => { supabase.removeChannel(channel); };
    })();
    return () => { unsub?.(); };
  }, [reload]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-white dark:bg-black">
      <TabletContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-6">
        <View className="flex-1">
          <Text className="text-3xl font-bold text-black dark:text-white">
            {t('tabs.library')}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleMyUploadsPress}
            className="rounded-xl bg-black p-3 dark:bg-white"
            accessibilityLabel={t('library_tab.my_uploads')}
            accessibilityRole="button"
          >
            <MaterialIcons
              name="person"
              size={20}
              color={colorScheme === 'dark' ? '#000' : '#fff'}
            />
          </Pressable>
          <Pressable
            onPress={handleUploadPress}
            className="rounded-xl bg-black p-3 dark:bg-white"
            accessibilityLabel={t('library_tab.upload_button')}
            accessibilityRole="button"
          >
            <MaterialIcons
              name="add"
              size={20}
              color={colorScheme === 'dark' ? '#000' : '#fff'}
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
            className={`flex-row items-center rounded-lg px-3 py-1.5 ${
              sortMode === mode ? 'bg-black dark:bg-white' : 'bg-gray-100 dark:bg-gray-800'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                sortMode === mode ? 'text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {t(`library_tab.sort_${mode}`)}
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
              className={`flex-row items-center rounded-lg px-3 py-1.5 ${
                active ? 'bg-black dark:bg-white' : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  active ? 'text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {lang
                  ? `${lang.flag} ${t(`languages.${lang.code}`)}`
                  : t(`library_tab.filter_${side}`)}
              </Text>
              <MaterialIcons
                name="arrow-drop-down"
                size={16}
                color={active ? (colorScheme === 'dark' ? '#000' : '#fff') : '#9ca3af'}
                style={{ marginLeft: 2 }}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Search bar */}
      <View className="mt-2 px-6">
        <View className="flex-row items-center rounded-xl bg-gray-100 px-3 dark:bg-gray-800">
          <MaterialIcons name="search" size={18} color="#9ca3af" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('library_tab.search_placeholder')}
            placeholderTextColor="#9ca3af"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={reload}
            className="ml-2 flex-1 py-2.5 text-sm text-black dark:text-white"
          />
          {searchQuery ? (
            <Pressable onPress={() => { setSearchQuery(''); setTimeout(reload, 0); }} className="ml-1 p-1">
              <MaterialIcons name="close" size={16} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6b7280" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="groups" size={64} color="#9ca3af" />
          <Text className="mt-4 text-center text-base font-semibold text-gray-500 dark:text-gray-400">
            {t('library_tab.empty_title')}
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('library_tab.empty_hint')}
          </Text>
        </View>
      ) : (
        <FlatList
          key={isTablet ? 'grid' : 'list'}
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
          contentContainerStyle={{ padding: 24, paddingBottom: 80, gap: isTablet ? 12 : 0 }}
          renderItem={({ item }) => {
            return (
              <Pressable
                onPress={() => router.push(`/community-detail/${item.id}`)}
                className={`rounded-2xl border border-gray-300 p-4 dark:border-gray-700 ${isTablet ? 'flex-1' : 'mb-3'}`}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.uploaderName ? (
                      <Text className="mt-1 text-xs text-gray-400" numberOfLines={1}>
                        @{item.uploaderName}
                      </Text>
                    ) : null}
                  </View>
                  <View className="ml-3 items-end">
                    <View className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                      <Text className="text-sm font-semibold text-black dark:text-white">
                        {t('home.word_count', { count: item.wordCount })}
                      </Text>
                    </View>
                    <View className="mt-1 flex-row items-center gap-3">
                      <View className="flex-row items-center">
                        <MaterialIcons name="favorite" size={12} color="#ef4444" />
                        <Text className="ml-1 text-xs text-gray-500">{item.likesCount}</Text>
                      </View>
                      <View className="flex-row items-center">
                        <MaterialIcons name="download" size={12} color="#6b7280" />
                        <Text className="ml-1 text-xs text-gray-500">{item.downloadsCount}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

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
          <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-white dark:bg-gray-900">
            <View className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <Text className="text-base font-bold text-black dark:text-white">
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
                    <Text className="flex-1 text-sm text-black dark:text-white">
                      {lang ? `${lang.flag} ${t(`languages.${lang.code}`)}` : t('library_tab.filter_all')}
                    </Text>
                    {selected ? <MaterialIcons name="check" size={18} color="#2EC4A5" /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
      <Toast visible={!!toast} message={toast?.msg ?? ''} type={toast?.type ?? 'success'} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}
