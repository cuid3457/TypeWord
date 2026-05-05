import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdBanner } from '@/components/ad-banner';
import { Toast } from '@/components/toast';
import { STUDY_LANGUAGES } from '@src/constants/languages';
import {
  CURATED_CATEGORIES,
  listCuratedWordlists,
  localize,
  type CuratedCategory,
  type CuratedWordlistMeta,
} from '@src/services/curatedWordlistService';

type EditingPicker = 'category' | 'lang' | null;

const CATEGORY_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  exam: 'school',
  foundation: 'auto-stories',
  academic: 'menu-book',
  domain: 'work',
  topic: 'topic',
};

const categoryIcon = (cat: string): keyof typeof MaterialIcons.glyphMap =>
  CATEGORY_ICONS[cat] ?? 'category';

export default function WordlistLibraryScreen() {
  const { t, i18n } = useTranslation();
  // category param is optional now; the in-screen picker drives selection.
  // When provided (e.g. from a deep link), it seeds the initial pick.
  const params = useLocalSearchParams<{ category?: string }>();
  const [items, setItems] = useState<CuratedWordlistMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CuratedCategory | null>(
    params.category && typeof params.category === 'string' ? (params.category as CuratedCategory) : null,
  );
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingPicker>(null);
  const [toast, setToast] = useState('');
  const [toastY, setToastY] = useState(0);
  const cardRefs = useRef<Map<string, View>>(new Map());

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listCuratedWordlists().then((list) => {
      if (cancelled) return;
      setItems(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []));

  // Categories that actually have content. Keep canonical order from
  // CURATED_CATEGORIES, then append any unknown extras at the end.
  const availableCategories = useMemo<CuratedCategory[]>(() => {
    const present = new Set(items.map((i) => i.category));
    const known = CURATED_CATEGORIES.filter((c) => present.has(c));
    const extras = Array.from(present).filter((c) => !CURATED_CATEGORIES.includes(c));
    return [...known, ...extras];
  }, [items]);

  // Ensure activeCategory points at something that exists. If the URL seed is
  // missing/invalid, default to the first available category.
  useEffect(() => {
    if (availableCategories.length === 0) return;
    if (!activeCategory || !availableCategories.includes(activeCategory)) {
      setActiveCategory(availableCategories[0]);
    }
  }, [availableCategories, activeCategory]);

  // Languages constrained to the active category — switching category may
  // change which langs have content, so we re-derive whenever it changes.
  const itemsInCategory = useMemo(
    () => (activeCategory ? items.filter((i) => i.category === activeCategory) : []),
    [items, activeCategory],
  );

  const availableLangs = useMemo(() => {
    const set = new Set(itemsInCategory.map((i) => i.sourceLang));
    return STUDY_LANGUAGES.filter((l) => set.has(l.code));
  }, [itemsInCategory]);

  useEffect(() => {
    if (availableLangs.length === 0) {
      if (activeLang !== null) setActiveLang(null);
      return;
    }
    if (!activeLang || !availableLangs.some((l) => l.code === activeLang)) {
      setActiveLang(availableLangs[0].code);
    }
  }, [availableLangs, activeLang]);

  const filtered = useMemo(() => {
    if (!activeLang) return [];
    return itemsInCategory.filter((i) => i.sourceLang === activeLang);
  }, [itemsInCategory, activeLang]);

  const activeLangMeta = useMemo(
    () => STUDY_LANGUAGES.find((l) => l.code === activeLang),
    [activeLang],
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-6 pt-2">
        <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')}>
          <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
        </Pressable>
        <Text className="text-3xl font-bold text-black dark:text-white">
          {t('library.title_browse')}
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6b7280" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="auto-stories" size={64} color="#9ca3af" />
          <Text className="mt-4 text-center text-base text-gray-500">
            {t('library.empty')}
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-400">
            {t('library.empty_hint')}
          </Text>
        </View>
      ) : (
        <>
          {/* Combined picker card — same collapsible pattern as new.tsx so
              switching contexts is muscle-memory consistent across screens.
              Category sits on top because it scopes which langs are even
              eligible below. */}
          <View className="mx-6 mt-4 rounded-2xl border border-gray-300 dark:border-gray-700">
            <Pressable
              onPress={() => setEditing(editing === 'category' ? null : 'category')}
              className="flex-row items-center p-4"
            >
              <View className="flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t('library.category_label')}
                </Text>
                <View className="mt-1 flex-row items-center" style={{ height: 24 }}>
                  {activeCategory ? (
                    <>
                      <MaterialIcons name={categoryIcon(activeCategory)} size={18} color="#6b7280" />
                      <Text
                        className="ml-2 text-base text-black dark:text-white"
                        style={{ lineHeight: 24, includeFontPadding: false }}
                        numberOfLines={1}
                      >
                        {t(`library.category_${activeCategory}`, { defaultValue: activeCategory })}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-base text-gray-400">—</Text>
                  )}
                </View>
              </View>
              <Text className="text-base text-gray-400">{editing === 'category' ? '▲' : '▼'}</Text>
            </Pressable>

            {editing === 'category' ? (
              <View className="border-t border-gray-200 dark:border-gray-800" style={{ maxHeight: 320 }}>
                <ScrollView nestedScrollEnabled>
                  {availableCategories.map((cat) => {
                    const selected = cat === activeCategory;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => {
                          setActiveCategory(cat);
                          setEditing(null);
                        }}
                        className={`flex-row items-center px-4 py-3 ${selected ? 'bg-black/5 dark:bg-white/10' : ''}`}
                      >
                        <MaterialIcons name={categoryIcon(cat)} size={20} color="#6b7280" />
                        <Text className="ml-3 flex-1 text-base text-black dark:text-white">
                          {t(`library.category_${cat}`, { defaultValue: cat })}
                        </Text>
                        {selected ? <MaterialIcons name="check-circle" size={22} color="#2EC4A5" /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {editing !== 'category' ? (
              <>
                <View className="mx-4 h-px bg-gray-200 dark:bg-gray-800" />

                <Pressable
                  onPress={() => setEditing(editing === 'lang' ? null : 'lang')}
                  className="flex-row items-center p-4"
                  disabled={availableLangs.length === 0}
                >
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t('library.lang_label')}
                    </Text>
                    <Text
                      className="mt-1 text-base text-black dark:text-white"
                      style={{ lineHeight: 24, height: 24, includeFontPadding: false, textAlignVertical: 'center' }}
                      numberOfLines={1}
                    >
                      {activeLangMeta
                        ? `${activeLangMeta.flag} ${t(`languages.${activeLangMeta.code}`)}`
                        : '—'}
                    </Text>
                  </View>
                  {availableLangs.length > 1 ? (
                    <Text className="text-base text-gray-400">{editing === 'lang' ? '▲' : '▼'}</Text>
                  ) : null}
                </Pressable>

                {editing === 'lang' && availableLangs.length > 1 ? (
                  <View className="border-t border-gray-200 dark:border-gray-800" style={{ maxHeight: 320 }}>
                    <ScrollView nestedScrollEnabled>
                      {availableLangs.map((item) => {
                        const selected = item.code === activeLang;
                        const translatedName = t(`languages.${item.code}`);
                        return (
                          <Pressable
                            key={item.code}
                            onPress={() => {
                              setActiveLang(item.code);
                              setEditing(null);
                            }}
                            className={`flex-row items-center px-4 py-3 ${selected ? 'bg-black/5 dark:bg-white/10' : ''}`}
                          >
                            <Text className="mr-3 text-xl">{item.flag}</Text>
                            <View className="flex-1">
                              <Text className="text-base text-black dark:text-white">{translatedName}</Text>
                              {translatedName !== item.nativeName ? (
                                <Text className="text-xs text-gray-400">{item.nativeName}</Text>
                              ) : null}
                            </View>
                            {selected ? <MaterialIcons name="check-circle" size={22} color="#2EC4A5" /> : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(it) => it.id}
            contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
            ListEmptyComponent={() => (
              <View className="items-center justify-center pt-16">
                <MaterialIcons name="auto-stories" size={48} color="#9ca3af" />
                <Text className="mt-3 text-center text-sm text-gray-500">
                  {t('library.empty')}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable
                ref={(r) => {
                  if (r) cardRefs.current.set(item.id, r as unknown as View);
                  else cardRefs.current.delete(item.id);
                }}
                onPress={() => {
                  if (item.wordCount === 0) {
                    const node = cardRefs.current.get(item.id);
                    node?.measure((_x, _y, _w, h, _pageX, pageY) => {
                      setToastY(pageY + h / 2);
                      setToast(t('library.coming_soon_toast'));
                    });
                    return;
                  }
                  router.push({ pathname: '/wordlist/library/[id]', params: { id: item.id } });
                }}
                className="mb-3 flex-row items-center rounded-2xl border border-gray-300 p-4 dark:border-gray-700"
                style={item.wordCount === 0 ? { opacity: 0.55 } : undefined}
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <MaterialIcons
                    name={categoryIcon(item.category)}
                    size={22}
                    color="#6b7280"
                  />
                </View>
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center">
                    <Text className="flex-1 text-base font-semibold text-black dark:text-white" numberOfLines={1}>
                      {localize(item.nameI18n, i18n.language)}
                    </Text>
                    {item.wordCount === 0 ? (
                      <View className="ml-2 rounded-md bg-gray-200 px-2 py-0.5 dark:bg-gray-700">
                        <Text className="text-[10px] font-bold text-gray-600 dark:text-gray-400">
                          {t('library.coming_soon_badge')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={2}>
                    {localize(item.descriptionI18n, i18n.language) || `${item.wordCount}${t('library.words_suffix')}`}
                  </Text>
                  <View className="mt-2 flex-row items-center">
                    {item.examType ? (
                      <View className="mr-2 rounded-md bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                        <Text className="text-[10px] font-bold text-gray-600 dark:text-gray-400">
                          {item.examType}
                        </Text>
                      </View>
                    ) : null}
                    {item.wordCount > 0 ? (
                      <Text className="text-xs text-gray-400">
                        {item.wordCount}{t('library.words_suffix')}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
              </Pressable>
            )}
          />
        </>
      )}
      <AdBanner />
      <Toast
        visible={!!toast}
        message={toast}
        onHide={() => setToast('')}
        style={{ position: 'absolute', top: Math.max(0, toastY - 22), left: 0, right: 0, pointerEvents: 'none' }}
      />
    </SafeAreaView>
  );
}
