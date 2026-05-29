import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useCallback, useState } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SmoothSwitch } from '@/components/common/SmoothSwitch';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { type SharedValue, runOnJS, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTablet } from '@src/hooks/useTablet';
import { usePremium } from '@src/hooks/usePremium';
import { BottomSheetShell } from '@/components/bottom-sheet-shell';
import { getDailyLimit, type ReviewMode as LimitReviewMode } from '@src/services/reviewLimitService';

type ReviewOrder = 'newest' | 'shuffle';
type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank' | 'auto';

const MIN_SESSION = 10;
const MAX_SESSION = 50;

interface Props {
  visible: boolean;
  sheetTranslateY: SharedValue<number>;
  reviewOrder: ReviewOrder;
  setReviewOrder: (o: ReviewOrder) => void;
  reviewMode: ReviewMode;
  setReviewMode: (m: ReviewMode) => void;
  sessionCount: number;
  setSessionCount: (fn: (c: number) => number) => void;
  autoPlayTts: boolean;
  setAutoPlayTts: (v: boolean) => void;
  settingsRemaining: Record<string, number>;
  onDismiss: () => void;
  onStart: () => void;
}

const MODE_ORDER: ReviewMode[] = ['auto', 'flashcard', 'choice', 'dictation', 'context', 'fill_blank'];
const modeIcon = (m: ReviewMode): keyof typeof MaterialIcons.glyphMap =>
  m === 'auto' ? 'shuffle'
  : m === 'flashcard' ? 'style'
  : m === 'choice' ? 'quiz'
  : m === 'dictation' ? 'keyboard'
  : m === 'context' ? 'menu-book'
  : 'edit-note';

export function ReviewSettingsSheet(props: Props) {
  const { isTablet } = useTablet();
  const useCard = Platform.OS === 'web' && isTablet;
  if (useCard) return <CenteredCardLayout {...props} />;
  return <BottomSheetLayout {...props} />;
}

function CenteredCardLayout({
  visible,
  reviewOrder,
  setReviewOrder,
  reviewMode,
  setReviewMode,
  sessionCount,
  setSessionCount,
  autoPlayTts,
  setAutoPlayTts,
  settingsRemaining,
  onDismiss,
  onStart,
}: Props) {
  const { t } = useTranslation();
  const premium = usePremium();
  const [modeListOpen, setModeListOpen] = useState(false);

  return (
    <BottomSheetShell visible={visible} onRequestClose={onDismiss} animationType="fade">
      <Pressable
        onPress={onDismiss}
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <Pressable
          onPress={() => {}}
          className="w-full max-w-lg rounded-2xl bg-surface p-6 dark:bg-surface-dark"
          style={{ maxHeight: '80vh' as unknown as number }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <Text className="mb-2 text-sm font-semibold text-muted">{t('review.order')}</Text>
            <View className="flex-row gap-2">
              {(['newest', 'shuffle'] as const).map((o) => (
                <Pressable
                  key={o}
                  onPress={() => setReviewOrder(o)}
                  className={`flex-1 items-center rounded-xl py-3 ${
                    reviewOrder === o ? 'bg-ink dark:bg-ink-dark' : 'bg-clay dark:bg-clay-dark'
                  }`}
                >
                  <Text className={`text-sm font-semibold ${
                    reviewOrder === o ? 'text-canvas dark:text-canvas-dark' : 'text-muted'
                  }`}>
                    {t(`review.order_${o}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="mb-2 mt-5 flex-row items-end justify-between">
              <Text className="text-sm font-semibold text-muted">{t('review.mode')}</Text>
              {!premium ? (
                <Text className="text-xs text-faint">
                  {(settingsRemaining.flashcard ?? Infinity) === Infinity
                    ? null
                    : `${settingsRemaining.flashcard}/${getDailyLimit()}`}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setModeListOpen((v) => !v)}
              className="flex-row items-center rounded-xl border border-line px-3 py-3 dark:border-line-dark"
            >
              <MaterialIcons name={modeIcon(reviewMode)} size={22} color="#1E9E84" />
              <Text className="ml-3 flex-1 text-base text-ink dark:text-ink-dark">
                {t(`review.mode_${reviewMode}`)}
              </Text>
              <MaterialIcons
                name={modeListOpen ? 'expand-less' : 'expand-more'}
                size={22}
                color="#A79E90"
              />
            </Pressable>

            <View className="mt-4 flex-row items-center justify-between rounded-xl border border-line px-3 py-3 dark:border-line-dark">
              <View className="flex-row items-center">
                <MaterialIcons name="volume-up" size={22} color="#7B7366" />
                <Text className="ml-3 text-base text-ink dark:text-ink-dark">
                  {t('review.auto_play_tts')}
                </Text>
              </View>
              <SmoothSwitch
                value={autoPlayTts}
                onValueChange={setAutoPlayTts}
              />
            </View>

            {modeListOpen ? (
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                className="mt-1 rounded-xl border border-line dark:border-line-dark"
                style={{ maxHeight: 350 }}
                contentContainerStyle={{ padding: 4, gap: 4 }}
              >
                {MODE_ORDER.map((m) => {
                  const isSelected = reviewMode === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setReviewMode(m);
                        setModeListOpen(false);
                      }}
                      className={`flex-row items-center rounded-lg px-3 py-3 ${
                        isSelected ? 'bg-accent-soft dark:bg-accent-soft-dark' : ''
                      }`}
                    >
                      <MaterialIcons
                        name={modeIcon(m)}
                        size={22}
                        color={isSelected ? '#1E9E84' : '#7B7366'}
                      />
                      <Text className="ml-3 flex-1 text-base text-ink dark:text-ink-dark">
                        {t(`review.mode_${m}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <Text className="mb-2 mt-5 text-sm font-semibold text-muted">{t('review.session_count')}</Text>
            <View className="flex-row items-center justify-center gap-4">
              <Pressable
                onPress={() => {
                  if (sessionCount <= MIN_SESSION) return;
                  setSessionCount((c) => Math.max(MIN_SESSION, c - 5));
                }}
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  sessionCount <= MIN_SESSION ? 'bg-clay dark:bg-clay-dark' : 'bg-line dark:bg-line-dark'
                }`}
              >
                <Text className={`text-lg font-bold ${sessionCount <= MIN_SESSION ? 'text-faint' : 'text-ink dark:text-ink-dark'}`}>−</Text>
              </Pressable>
              <Text className="min-w-[40px] text-center text-2xl font-bold text-ink dark:text-ink-dark">
                {sessionCount}
              </Text>
              <Pressable
                onPress={() => {
                  if (sessionCount >= MAX_SESSION) return;
                  setSessionCount((c) => Math.min(MAX_SESSION, c + 5));
                }}
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  sessionCount >= MAX_SESSION ? 'bg-clay dark:bg-clay-dark' : 'bg-line dark:bg-line-dark'
                }`}
              >
                <Text className={`text-lg font-bold ${sessionCount >= MAX_SESSION ? 'text-faint' : 'text-ink dark:text-ink-dark'}`}>+</Text>
              </Pressable>
            </View>

            <Pressable onPress={onStart} className="mt-4 items-center rounded-xl bg-accent py-4">
              <Text className="text-base font-bold text-white">{t('review.start')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </BottomSheetShell>
  );
}

function BottomSheetLayout({
  visible,
  sheetTranslateY,
  reviewOrder,
  setReviewOrder,
  reviewMode,
  setReviewMode,
  sessionCount,
  setSessionCount,
  autoPlayTts,
  setAutoPlayTts,
  settingsRemaining,
  onDismiss,
  onStart,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const premium = usePremium();
  const { isTablet, contentWidth } = useTablet();
  const [modeListOpen, setModeListOpen] = useState(false);

  const hideSheet = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const dismissSheet = useCallback(() => {
    sheetTranslateY.value = withTiming(1000, { duration: 250 }, () => {
      runOnJS(hideSheet)();
    });
  }, [hideSheet, sheetTranslateY]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onUpdate((e) => {
        if (e.translationY > 0) sheetTranslateY.value = e.translationY;
      })
      .onEnd((e) => {
        if (e.translationY > 400 || e.velocityY > 800) {
          sheetTranslateY.value = withTiming(1000, { duration: 200 }, () => {
            runOnJS(hideSheet)();
          });
        } else {
          sheetTranslateY.value = withTiming(0, { duration: 250 });
        }
      }),
    [hideSheet, sheetTranslateY],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <BottomSheetShell visible={visible} onRequestClose={dismissSheet}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={dismissSheet} className="flex-1 justify-end bg-black/50">
          <Animated.View
            accessibilityLabel={t('review.settings_title')}
            className="rounded-t-3xl bg-surface dark:bg-surface-dark"
            style={[
              {
                // Cap sheet at 90% of screen so the inner ScrollView gets a
                // scrollable area instead of the sheet pushing its top edge
                // off-screen when content grows (large fonts × expanded
                // mode list × keyboard etc.).
                maxHeight: Dimensions.get('window').height * 0.9,
                width: '100%',
              },
              isTablet ? { maxWidth: contentWidth, alignSelf: 'center' } : null,
              sheetAnimStyle,
            ]}
          >
            {/* Pan-to-dismiss is scoped to the drag handle only — wrapping
                the entire sheet in the GestureDetector intercepts every
                vertical drag, including the user's attempt to scroll the
                ScrollView (so the last mode in the list, fill_blank, was
                unreachable on tall layouts). */}
            <GestureDetector gesture={panGesture}>
              <Pressable onPress={() => {}}>
                <View className="items-center pt-3 pb-2">
                  <View className="h-1 w-10 rounded-full bg-line dark:bg-line-dark" />
                </View>
              </Pressable>
            </GestureDetector>
              {/* Plain View instead of ScrollView — order + mode trigger
                  are fixed-size sections that should stay put. The mode
                  list (when expanded) has its own bounded ScrollView so
                  only the 6 mode rows scroll, never the order section. */}
              <View className="px-6 pt-4 pb-4" style={{ flexShrink: 1 }}>
                <Text className="mb-2 text-sm font-semibold text-muted">{t('review.order')}</Text>
                <View className="flex-row gap-2">
                  {(['newest', 'shuffle'] as const).map((o) => (
                    <Pressable
                      key={o}
                      onPress={() => setReviewOrder(o)}
                      className={`flex-1 items-center rounded-xl py-3 ${
                        reviewOrder === o ? 'bg-ink dark:bg-ink-dark' : 'bg-clay dark:bg-clay-dark'
                      }`}
                    >
                      <Text className={`text-sm font-semibold ${
                        reviewOrder === o ? 'text-canvas dark:text-canvas-dark' : 'text-muted'
                      }`}>
                        {t(`review.order_${o}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View className="mb-2 mt-5 flex-row items-end justify-between">
                  <Text className="text-sm font-semibold text-muted">{t('review.mode')}</Text>
                  {!premium ? (
                    <Text className="text-xs text-faint">
                      {(settingsRemaining.flashcard ?? Infinity) === Infinity
                        ? null
                        : `${settingsRemaining.flashcard}/${getDailyLimit()}`}
                    </Text>
                  ) : null}
                </View>
                {/* Collapsed trigger: shows just the active mode. Tap toggles
                    an inline list of all options below — same UX pattern as
                    the native-language picker on the settings screen. */}
                <Pressable
                  onPress={() => setModeListOpen((v) => !v)}
                  className="flex-row items-center rounded-xl border border-line px-3 py-3 dark:border-line-dark"
                >
                  <MaterialIcons name={modeIcon(reviewMode)} size={22} color="#1E9E84" />
                  <Text className="ml-3 flex-1 text-base text-ink dark:text-ink-dark">
                    {t(`review.mode_${reviewMode}`)}
                  </Text>
                  <MaterialIcons
                    name={modeListOpen ? 'expand-less' : 'expand-more'}
                    size={22}
                    color="#A79E90"
                  />
                </Pressable>
                {/* Auto-play TTS toggle — affects only review cards.
                    Default-on preserves prior behavior; user can disable
                    to study silently (e.g. in public). */}
                <View className="mt-4 flex-row items-center justify-between rounded-xl border border-line px-3 py-3 dark:border-line-dark">
                  <View className="flex-row items-center">
                    <MaterialIcons name="volume-up" size={22} color="#7B7366" />
                    <Text className="ml-3 text-base text-ink dark:text-ink-dark">
                      {t('review.auto_play_tts')}
                    </Text>
                  </View>
                  <SmoothSwitch
                    value={autoPlayTts}
                    onValueChange={setAutoPlayTts}
                  />
                </View>

                {modeListOpen ? (
                  // Self-scrolling list — only the 6 mode rows move when
                  // the user drags inside this box. Order section + mode
                  // trigger above stay fixed. Cap chosen so all 6 rows
                  // fit at default font; large fonts scroll within.
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    className="mt-1 rounded-xl border border-line dark:border-line-dark"
                    style={{ maxHeight: 350 }}
                    contentContainerStyle={{ padding: 4, gap: 4 }}
                  >
                    {MODE_ORDER.map((m) => {
                      const isSelected = reviewMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => {
                            setReviewMode(m);
                            setModeListOpen(false);
                          }}
                          className={`flex-row items-center rounded-lg px-3 py-3 ${
                            isSelected ? 'bg-accent-soft dark:bg-accent-soft-dark' : ''
                          }`}
                        >
                          <MaterialIcons
                            name={modeIcon(m)}
                            size={22}
                            color={isSelected ? '#1E9E84' : '#7B7366'}
                          />
                          <Text className="ml-3 flex-1 text-base text-ink dark:text-ink-dark">
                            {t(`review.mode_${m}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}

              </View>

              {/* Sticky footer — keeps the session-count stepper AND the
                  start button pinned above the system nav bar regardless
                  of how tall the inner ScrollView grows (e.g. when the
                  mode list expands). Only the ScrollView above scrolls. */}
              <View
                className="px-6"
                style={{ paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 24 }}
              >
                <Text className="mb-2 text-sm font-semibold text-muted">{t('review.session_count')}</Text>
                <View className="flex-row items-center justify-center gap-4">
                  <Pressable
                    onPress={() => {
                      if (sessionCount <= MIN_SESSION) return;
                      setSessionCount((c) => Math.max(MIN_SESSION, c - 5));
                    }}
                    className={`h-10 w-10 items-center justify-center rounded-full ${
                      sessionCount <= MIN_SESSION ? 'bg-clay dark:bg-clay-dark' : 'bg-line dark:bg-line-dark'
                    }`}
                  >
                    <Text className={`text-lg font-bold ${sessionCount <= MIN_SESSION ? 'text-faint' : 'text-ink dark:text-ink-dark'}`}>−</Text>
                  </Pressable>
                  <Text className="min-w-[40px] text-center text-2xl font-bold text-ink dark:text-ink-dark">
                    {sessionCount}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (sessionCount >= MAX_SESSION) return;
                      setSessionCount((c) => Math.min(MAX_SESSION, c + 5));
                    }}
                    className={`h-10 w-10 items-center justify-center rounded-full ${
                      sessionCount >= MAX_SESSION ? 'bg-clay dark:bg-clay-dark' : 'bg-line dark:bg-line-dark'
                    }`}
                  >
                    <Text className={`text-lg font-bold ${sessionCount >= MAX_SESSION ? 'text-faint' : 'text-ink dark:text-ink-dark'}`}>+</Text>
                  </Pressable>
                </View>

                <Pressable onPress={onStart} className="mt-4 items-center rounded-xl bg-accent py-4">
                  <Text className="text-base font-bold text-white">{t('review.start')}</Text>
                </Pressable>
              </View>
          </Animated.View>
        </Pressable>
      </GestureHandlerRootView>
    </BottomSheetShell>
  );
}
