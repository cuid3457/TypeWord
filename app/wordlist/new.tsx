import { router, Stack, useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';

import { STUDY_LANGUAGES, findLanguage, isStudyLang } from '@src/constants/languages';
import { getExamplePrefix, getPlaceholder } from '@src/constants/placeholders';
import { insertBook, getBookCount, BOOK_LIMIT_BY_TIER } from '@src/db/queries';
import { useTier } from '@src/hooks/usePremium';
import { consumePaywallPending } from '@src/services/paywallPending';
import { genId } from '@src/services/wordService';
import { haptic } from '@src/services/hapticService';
import { useUserSettings } from '@src/hooks/useUserSettings';

const MAX_TITLE_LENGTH = 30;

export default function NewWordlistScreen() {
  const { t, i18n } = useTranslation();
  const tier = useTier();
  const { settings } = useUserSettings();
  const [title, setTitle] = useState('');
  const [studyLang, setStudyLang] = useState<string>(() => {
    const saved = settings?.primarySourceLang;
    return saved && isStudyLang(saved) ? saved : 'en';
  });
  const [transLang, setTransLang] = useState<string>(() => {
    const saved = settings?.primaryTargetLang;
    return saved && isStudyLang(saved) ? saved : 'ko';
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [editingLang, setEditingLang] = useState<'study' | 'trans' | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (consumePaywallPending()) router.push('/subscription');
    }, []),
  );

  // Typewriter placeholder animation for name input
  const [randomBook, setRandomBook] = useState(() => getPlaceholder(studyLang).book);
  useEffect(() => { setRandomBook(getPlaceholder(studyLang).book); }, [studyLang]);
  const fullPlaceholder = `${getExamplePrefix(i18n.language)} ${randomBook}`;
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('');
  const titleEmpty = title.length === 0;

  useEffect(() => {
    if (!titleEmpty) return;
    let i = 0;
    setAnimatedPlaceholder('');
    const timer = setInterval(() => {
      i++;
      if (i <= fullPlaceholder.length) {
        setAnimatedPlaceholder(fullPlaceholder.slice(0, i));
      } else {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [fullPlaceholder, titleEmpty]);

  const studyLabel = useMemo(() => findLanguage(studyLang), [studyLang]);
  const transLabel = useMemo(() => findLanguage(transLang), [transLang]);

  const canSubmit = title.trim().length > 0 && studyLang !== transLang && !saving;

  const handleCreate = async () => {
    if (studyLang === transLang) {
      setToast(t('new_wordlist.same_lang'));
      return;
    }
    if (title.trim().length === 0) {
      setToast(t('new_wordlist.name_required'));
      return;
    }
    if (!canSubmit) return;
    const cap = BOOK_LIMIT_BY_TIER[tier];
    if (Number.isFinite(cap)) {
      const count = await getBookCount();
      if (count >= cap) {
        router.push('/subscription');
        return;
      }
    }
    setSaving(true);
    try {
      const id = genId();
      await insertBook({
        id,
        title: title.trim(),
        sourceLang: studyLang,
        targetLang: transLang,
        bidirectional: true,
        studyLang: studyLang,
      });
      haptic.success();
      router.replace({ pathname: '/wordlist/[id]', params: { id } });
    } catch {
      setToast(t('error.title'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="h-11 flex-row items-center">
            <Pressable onPress={() => { Keyboard.dismiss(); router.back(); }} className="mr-2 p-1">
              <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
            </Pressable>
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">
              {t('new_wordlist.title')}
            </Text>
          </View>

          <View className="mt-6">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t('new_wordlist.name')}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={animatedPlaceholder}
              placeholderTextColor="#A79E90"
              maxLength={MAX_TITLE_LENGTH}
              className="mt-2 rounded-xl px-4 text-base text-ink dark:text-ink-dark"
              style={[
                { borderWidth: 2, borderColor: '#2EC4A5' },
                // iOS line-box rules:
                //   * text-base via NativeWind applies lineHeight: 24,
                //     which on iOS leaves descender headroom and shifts
                //     visible text below center.
                //   * lineHeight = fontSize clips ascenders at the top.
                //   * lineHeight ≈ fontSize × 1.25 is the standard iOS
                //     UI value that keeps ascender + descender inside
                //     the box AND centers cleanly.
                // paddingVertical chosen so the total height (15+20+15
                // ≈ 50) matches the Android height: 50 path visually.
                Platform.OS === 'ios'
                  ? { paddingVertical: 15, fontSize: 16, lineHeight: 20 }
                  : { height: 50, includeFontPadding: false, textAlignVertical: 'center' },
              ]}
            />
            {title.length >= MAX_TITLE_LENGTH - 10 ? (
              <Text className="mt-1 text-right text-xs text-faint">
                {title.length}/{MAX_TITLE_LENGTH}
              </Text>
            ) : null}
          </View>

          <View className="mt-6 rounded-2xl border border-line dark:border-line-dark">
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setEditingLang(editingLang === 'study' ? null : 'study');
              }}
              className="flex-row items-center p-4"
            >
              <View className="flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('new_wordlist.study_lang')}
                </Text>
                <Text
                  className="mt-1 text-base text-ink dark:text-ink-dark"
                  // Android: tight box + remove font padding for crisp
                  // alignment with the label above. iOS: skip the height
                  // clamp — native text metrics handle centering and the
                  // clamp would clip descenders.
                  style={Platform.OS === 'ios'
                    ? undefined
                    : { lineHeight: 24, height: 24, includeFontPadding: false, textAlignVertical: 'center' }}
                  numberOfLines={1}
                >
                  {studyLabel ? `${studyLabel.flag} ${t(`languages.${studyLabel.code}`)}` : '—'}
                </Text>
              </View>
              <Text className="text-base text-faint">{editingLang === 'study' ? '▲' : '▼'}</Text>
            </Pressable>

            {/* Inline list right below the study picker so the option list is
                visually attached to the row that opened it. The trans picker
                + swap button are hidden during selection to keep focus and
                avoid the "list appearing below the wrong row" confusion. */}
            {editingLang === 'study' ? (
              <View className="border-t border-line dark:border-line-dark" style={{ height: 320 }}>
                <ScrollView nestedScrollEnabled>
                  {STUDY_LANGUAGES.map((item) => {
                    const selected = item.code === studyLang;
                    const translatedName = t(`languages.${item.code}`);
                    return (
                      <Pressable
                        key={item.code}
                        onPress={() => {
                          Keyboard.dismiss();
                          setStudyLang(item.code);
                          setEditingLang(null);
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

            {editingLang !== 'study' ? (
              <>
                <View className="mx-4 flex-row items-center justify-center py-1">
                  <View className="h-px flex-1 bg-clay dark:bg-clay-dark" />
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setEditingLang(null);
                      const a = studyLang;
                      setStudyLang(transLang);
                      setTransLang(a);
                    }}
                    hitSlop={10}
                    accessibilityLabel={t('new_wordlist.swap_langs')}
                    accessibilityRole="button"
                    className="mx-2 h-7 w-7 items-center justify-center rounded-full bg-clay dark:bg-clay-dark"
                  >
                    <MaterialIcons name="swap-vert" size={18} color="#7B7366" />
                  </Pressable>
                  <View className="h-px flex-1 bg-clay dark:bg-clay-dark" />
                </View>

                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setEditingLang(editingLang === 'trans' ? null : 'trans');
                  }}
                  className="flex-row items-center p-4"
                >
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {t('new_wordlist.target_lang')}
                    </Text>
                    <Text
                      className="mt-1 text-base text-ink dark:text-ink-dark"
                      style={Platform.OS === 'ios'
                        ? undefined
                        : { lineHeight: 24, height: 24, includeFontPadding: false, textAlignVertical: 'center' }}
                      numberOfLines={1}
                    >
                      {transLabel ? `${transLabel.flag} ${t(`languages.${transLabel.code}`)}` : '—'}
                    </Text>
                  </View>
                  <Text className="text-base text-faint">{editingLang === 'trans' ? '▲' : '▼'}</Text>
                </Pressable>

                {editingLang === 'trans' ? (
                  <View className="border-t border-line dark:border-line-dark" style={{ height: 320 }}>
                    <ScrollView nestedScrollEnabled>
                      {STUDY_LANGUAGES.map((item) => {
                        const selected = item.code === transLang;
                        const translatedName = t(`languages.${item.code}`);
                        return (
                          <Pressable
                            key={item.code}
                            onPress={() => {
                              Keyboard.dismiss();
                              setTransLang(item.code);
                              setEditingLang(null);
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

          <View className="mt-8">
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                handleCreate();
              }}
              className={`items-center rounded-xl py-4 ${
                canSubmit ? 'bg-ink dark:bg-ink-dark' : 'bg-clay'
              }`}
            >
              <Text
                className={`text-base font-semibold ${
                  canSubmit ? 'text-canvas dark:text-canvas-dark' : 'text-muted'
                }`}
              >
                {saving ? t('new_wordlist.creating') : t('new_wordlist.create')}
              </Text>
            </Pressable>
            <Toast visible={!!toast} message={toast} onHide={() => setToast('')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', pointerEvents: 'none' }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </TabletContainer>
    </SafeAreaView>
  );
}

