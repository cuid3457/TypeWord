import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { NativeAdCard } from '@/components/native-ad-card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTablet } from '@src/hooks/useTablet';

import { TabletContainer } from '@/components/tablet-container';
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
  const { isTablet } = useTablet();
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

  // Inject native ad markers: one at the top + one every N items thereafter.
  // Phone (single column) = 10, tablet (2-col grid) = 20.
  const dataWithAds = useMemo<Array<(typeof filtered)[number] | { __ad: true; key: string }>>(() => {
    if (filtered.length === 0) return [];
    const adsEvery = 7;
    const out: Array<(typeof filtered)[number] | { __ad: true; key: string }> = [
      { __ad: true, key: 'ad-top' },
    ];
    filtered.forEach((item, idx) => {
      out.push(item);
      if ((idx + 1) % adsEvery === 0 && idx < filtered.length - 1) {
        out.push({ __ad: true, key: `ad-${idx}` });
      }
    });
    return out;
  }, [filtered, isTablet]);

  const activeLangMeta = useMemo(
    () => STUDY_LANGUAGES.find((l) => l.code === activeLang),
    [activeLang],
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <View className="px-6 pt-6">
        <View className="h-11 flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')}>
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            {t('library.title_browse')}
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7B7366" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="auto-stories" size={64} color="#A79E90" />
          <Text className="mt-4 text-center text-base text-muted">
            {t('library.empty')}
          </Text>
          <Text className="mt-2 text-center text-sm text-faint">
            {t('library.empty_hint')}
          </Text>
        </View>
      ) : (
        <>
          {/* Combined picker card — same collapsible pattern as new.tsx so
              switching contexts is muscle-memory consistent across screens.
              Category sits on top because it scopes which langs are even
              eligible below. */}
          <View className="mx-6 mt-4 rounded-2xl border border-line dark:border-line-dark">
            <Pressable
              onPress={() => setEditing(editing === 'category' ? null : 'category')}
              className="flex-row items-center p-4"
            >
              <View className="flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('library.category_label')}
                </Text>
                <View className="mt-1 flex-row items-center" style={{ height: 24 }}>
                  {activeCategory ? (
                    <>
                      <MaterialIcons name={categoryIcon(activeCategory)} size={18} color="#7B7366" />
                      <Text
                        className="ml-2 text-base text-ink dark:text-ink-dark"
                        style={Platform.OS === 'ios'
                          ? undefined
                          : { lineHeight: 24, includeFontPadding: false }}
                        numberOfLines={1}
                      >
                        {t(`library.category_${activeCategory}`, { defaultValue: activeCategory })}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-base text-faint">—</Text>
                  )}
                </View>
              </View>
              <Text className="text-base text-faint">{editing === 'category' ? '▲' : '▼'}</Text>
            </Pressable>

            {editing === 'category' ? (
              <View className="border-t border-line dark:border-line-dark" style={{ maxHeight: 320 }}>
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
                        className={`flex-row items-center px-4 py-3 ${selected ? 'bg-accent-soft dark:bg-accent-soft-dark' : ''}`}
                      >
                        <MaterialIcons name={categoryIcon(cat)} size={20} color="#7B7366" />
                        <Text className="ml-3 flex-1 text-base text-ink dark:text-ink-dark">
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
                <View className="mx-4 h-px bg-clay dark:bg-clay-dark" />

                <Pressable
                  onPress={() => setEditing(editing === 'lang' ? null : 'lang')}
                  className="flex-row items-center p-4"
                  disabled={availableLangs.length === 0}
                >
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {t('library.lang_label')}
                    </Text>
                    <Text
                      className="mt-1 text-base text-ink dark:text-ink-dark"
                      style={Platform.OS === 'ios'
                        ? undefined
                        : { lineHeight: 24, height: 24, includeFontPadding: false, textAlignVertical: 'center' }}
                      numberOfLines={1}
                    >
                      {activeLangMeta
                        ? `${activeLangMeta.flag} ${t(`languages.${activeLangMeta.code}`)}`
                        : '—'}
                    </Text>
                  </View>
                  {availableLangs.length > 1 ? (
                    <Text className="text-base text-faint">{editing === 'lang' ? '▲' : '▼'}</Text>
                  ) : null}
                </Pressable>

                {editing === 'lang' && availableLangs.length > 1 ? (
                  <View className="border-t border-line dark:border-line-dark" style={{ maxHeight: 320 }}>
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
                            className={`flex-row items-center px-4 py-3 ${selected ? 'bg-accent-soft dark:bg-accent-soft-dark' : ''}`}
                          >
                            <Text className="mr-3 text-xl">{item.flag}</Text>
                            <View className="flex-1">
                              <Text className="text-base text-ink dark:text-ink-dark">{translatedName}</Text>
                              {translatedName !== item.nativeName ? (
                                <Text className="text-xs text-faint">{item.nativeName}</Text>
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
            key={isTablet ? 'grid' : 'list'}
            data={dataWithAds}
            keyExtractor={(it) => ('__ad' in it ? it.key : it.id)}
            numColumns={isTablet ? 2 : 1}
            columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
            contentContainerStyle={{ padding: 24, paddingBottom: 80, gap: isTablet ? 12 : 0, flexGrow: 1 }}
            ListEmptyComponent={() => (
              <View className="flex-1 items-center justify-center">
                <MaterialIcons name="auto-stories" size={48} color="#A79E90" />
                <Text className="mt-3 text-center text-sm text-muted">
                  {t('library.empty')}
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              if ('__ad' in item) {
                return (
                  <View className={isTablet ? 'flex-1' : 'mb-3'}>
                    <NativeAdCard />
                  </View>
                );
              }
              return (
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
                className={`flex-row items-center rounded-2xl border border-line p-4 dark:border-line-dark ${isTablet ? 'flex-1' : 'mb-3'}`}
                style={item.wordCount === 0 ? { opacity: 0.55 } : undefined}
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-clay dark:bg-clay-dark">
                  <MaterialIcons
                    name={categoryIcon(item.category)}
                    size={22}
                    color="#7B7366"
                  />
                </View>
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center">
                    <Text className="flex-1 text-base font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
                      {localize(item.nameI18n, i18n.language)}
                    </Text>
                    {item.wordCount === 0 ? (
                      <View className="ml-2 rounded-md bg-line px-2 py-0.5 dark:bg-line-dark">
                        <Text className="text-[10px] font-bold text-muted">
                          {t('library.coming_soon_badge')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={2}>
                    {localize(item.descriptionI18n, i18n.language) || `${item.wordCount}${t('library.words_suffix')}`}
                  </Text>
                  <View className="mt-2 flex-row items-center">
                    {item.examType ? (
                      <View className="mr-2 rounded-md bg-clay px-2 py-0.5 dark:bg-clay-dark">
                        <Text className="text-[10px] font-bold text-muted">
                          {item.examType}
                        </Text>
                      </View>
                    ) : null}
                    {item.wordCount > 0 ? (
                      <Text className="text-xs text-faint">
                        {item.wordCount}{t('library.words_suffix')}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#A79E90" />
              </Pressable>
              );
            }}
          />
        </>
      )}
      </TabletContainer>
      <Toast
        visible={!!toast}
        message={toast}
        onHide={() => setToast('')}
        style={{ position: 'absolute', top: Math.max(0, toastY - 22), left: 0, right: 0, pointerEvents: 'none' }}
      />
    </SafeAreaView>
  );
}
