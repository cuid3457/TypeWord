import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { findLanguage, STUDY_LANGUAGES } from '@src/constants/languages';
import { useUserSettings } from '@src/hooks/useUserSettings';
import {
  addCuratedWordlistToUser,
  getCuratedWordlist,
  localize,
  type CuratedWord,
  type CuratedWordlistMeta,
} from '@src/services/curatedWordlistService';
import { Toast } from '@/components/toast';
import { AdBanner } from '@/components/ad-banner';

export default function CuratedWordlistDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useUserSettings();
  const insets = useSafeAreaInsets();

  const [meta, setMeta] = useState<CuratedWordlistMeta | null>(null);
  const [words, setWords] = useState<CuratedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setLoading(true);
    getCuratedWordlist(id).then((data) => {
      if (cancelled || !data) {
        setLoading(false);
        return;
      }
      setMeta(data.meta);
      setWords(data.words);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const defaultTargetLang = settings?.primaryTargetLang || 'en';

  // Pick a target_lang for preview — prefer user's setting, fall back to any
  // language pre-cached in this curated list (since the preferred lang may
  // not be among the pre-cached target_langs).
  const previewLang = useMemo(() => {
    if (words.length === 0) return null;
    const available = new Set<string>();
    for (const w of words) {
      for (const k of Object.keys(w.resultsByTargetLang)) available.add(k);
    }
    if (available.has(defaultTargetLang)) return defaultTargetLang;
    const short = defaultTargetLang.split('-')[0];
    if (available.has(short)) return short;
    return Array.from(available)[0] ?? null;
  }, [words, defaultTargetLang]);

  const handleAdd = useCallback(async (targetLang: string) => {
    if (!meta) return;
    setShowLangPicker(false);
    setAdding(true);
    setProgress({ current: 0, total: words.length });
    try {
      const { bookId } = await addCuratedWordlistToUser(
        meta.id,
        targetLang,
        i18n.language,
        (p) => setProgress({ current: p.current, total: p.total }),
      );
      router.replace({ pathname: '/wordlist/[id]', params: { id: bookId } });
    } catch (e) {
      setToast(t('error.title'));
    } finally {
      setAdding(false);
      setProgress(null);
    }
  }, [meta, words.length, i18n.language, t]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color="#6b7280" />
      </SafeAreaView>
    );
  }

  if (!meta) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-base text-gray-500">{t('library.not_found')}</Text>
      </SafeAreaView>
    );
  }

  const sourceLang = findLanguage(meta.sourceLang);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-6 pt-2">
        <Pressable onPress={() => router.back()} className="mr-2 p-1">
          <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
        </Pressable>
      </View>

      <View className="px-6 pt-2">
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <MaterialIcons
              name={meta.category === 'exam' ? 'school' : 'topic'}
              size={22}
              color="#6b7280"
            />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-2xl font-bold text-black dark:text-white">
              {localize(meta.nameI18n, i18n.language)}
            </Text>
            <Text className="mt-0.5 text-xs text-gray-500">
              {sourceLang?.flag} {t(`languages.${meta.sourceLang}`)} · {meta.wordCount}{t('library.words_suffix')}
            </Text>
          </View>
        </View>
        {localize(meta.descriptionI18n, i18n.language) ? (
          <Text className="mt-3 text-sm text-gray-500">
            {localize(meta.descriptionI18n, i18n.language)}
          </Text>
        ) : null}
      </View>

      <View className="px-6 pt-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('library.preview')}
        </Text>
      </View>

      <FlatList
        data={words.slice(0, 20)}
        keyExtractor={(w) => w.word}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const result = previewLang ? item.resultsByTargetLang[previewLang] : null;
          const definition = result?.meanings?.[0]?.definition ?? '';
          return (
            <View className="border-b border-gray-100 py-3 dark:border-gray-800">
              <View className="flex-row items-baseline">
                <Text className="text-base font-semibold text-black dark:text-white">{item.word}</Text>
                {result?.reading ? (
                  <Text className="ml-2 text-xs text-gray-400">
                    {Array.isArray(result.reading) ? result.reading.join(', ') : result.reading}
                  </Text>
                ) : null}
                {result?.ipa ? (
                  <Text className="ml-2 text-xs text-gray-400">{result.ipa}</Text>
                ) : null}
              </View>
              {definition ? (
                <Text className="mt-1 text-sm text-gray-500" numberOfLines={2}>
                  {definition}
                </Text>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          words.length > 20 ? (
            <Text className="mt-4 text-center text-sm text-gray-400">
              {t('library.preview_more', { count: words.length - 20 })}
            </Text>
          ) : null
        }
      />

      <View
        className="absolute bottom-0 left-0 right-0 border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-black"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
      >
        <AdBanner />
        <View className="px-6 pt-4">
        <Pressable
          onPress={() => setShowLangPicker(true)}
          disabled={adding}
          className="items-center rounded-xl bg-black py-4 dark:bg-white"
        >
          {adding ? (
            <View className="flex-row items-center">
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
              <Text className="text-base font-semibold text-white dark:text-black">
                {progress
                  ? t('library.adding_progress', { current: progress.current, total: progress.total })
                  : t('library.adding')}
              </Text>
            </View>
          ) : (
            <Text className="text-base font-semibold text-white dark:text-black">
              {t('library.add_to_my_lists')}
            </Text>
          )}
        </Pressable>
        </View>
      </View>

      {showLangPicker ? (
        <Pressable
          onPress={() => setShowLangPicker(false)}
          className="absolute inset-0 items-center justify-center bg-black/50 px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-gray-900"
          >
            <Text className="text-lg font-bold text-black dark:text-white">
              {t('library.pick_target_lang')}
            </Text>
            <Text className="mt-1 text-sm text-gray-500">
              {t('library.pick_target_lang_hint')}
            </Text>
            <View className="mt-4 max-h-80">
              <FlatList
                data={STUDY_LANGUAGES.filter((l) => l.code !== meta.sourceLang)}
                keyExtractor={(l) => l.code}
                renderItem={({ item }) => {
                  const isDefault = item.code === defaultTargetLang;
                  return (
                    <Pressable
                      onPress={() => handleAdd(item.code)}
                      className="flex-row items-center px-2 py-3"
                    >
                      <Text className="mr-3 text-xl">{item.flag}</Text>
                      <Text className="flex-1 text-base text-black dark:text-white">
                        {t(`languages.${item.code}`)}
                      </Text>
                      {isDefault ? (
                        <Text className="text-xs text-gray-400">{t('library.default_target')}</Text>
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            </View>
            <Pressable onPress={() => setShowLangPicker(false)} className="mt-2 items-center py-2">
              <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}

      <Toast visible={!!toast} message={toast} onHide={() => setToast('')} />
    </SafeAreaView>
  );
}
