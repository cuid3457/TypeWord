import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useCallback, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { type SharedValue, runOnJS, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { usePremium } from '@src/hooks/usePremium';
import { getDailyLimit, type ReviewMode as LimitReviewMode } from '@src/services/reviewLimitService';

type ReviewOrder = 'newest' | 'shuffle';
type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank' | 'auto';

const MIN_SESSION = 5;
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
  settingsRemaining: Record<string, number>;
  onDismiss: () => void;
  onStart: () => void;
}

export function ReviewSettingsSheet({
  visible,
  sheetTranslateY,
  reviewOrder,
  setReviewOrder,
  reviewMode,
  setReviewMode,
  sessionCount,
  setSessionCount,
  settingsRemaining,
  onDismiss,
  onStart,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const premium = usePremium();
  const [modeListOpen, setModeListOpen] = useState(false);

  const MODE_ORDER: ReviewMode[] = ['auto', 'flashcard', 'choice', 'dictation', 'context', 'fill_blank'];
  const modeIcon = (m: ReviewMode): keyof typeof MaterialIcons.glyphMap =>
    m === 'auto' ? 'shuffle'
    : m === 'flashcard' ? 'style'
    : m === 'choice' ? 'quiz'
    : m === 'dictation' ? 'keyboard'
    : m === 'context' ? 'menu-book'
    : 'edit-note';

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
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismissSheet}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={dismissSheet} className="flex-1 justify-end bg-black/50">
          <Animated.View
            accessibilityLabel={t('review.settings_title')}
            className="rounded-t-3xl bg-white dark:bg-gray-900"
            style={[
              {
                // Cap sheet at 90% of screen so the inner ScrollView gets a
                // scrollable area instead of the sheet pushing its top edge
                // off-screen when content grows (large fonts × expanded
                // mode list × keyboard etc.).
                maxHeight: Dimensions.get('window').height * 0.9,
              },
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
                  <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                </View>
              </Pressable>
            </GestureDetector>
              {/* Plain View instead of ScrollView — order + mode trigger
                  are fixed-size sections that should stay put. The mode
                  list (when expanded) has its own bounded ScrollView so
                  only the 6 mode rows scroll, never the order section. */}
              <View className="px-6 pt-4 pb-4" style={{ flexShrink: 1 }}>
                <Text className="mb-2 text-sm font-semibold text-gray-500">{t('review.order')}</Text>
                <View className="flex-row gap-2">
                  {(['newest', 'shuffle'] as const).map((o) => (
                    <Pressable
                      key={o}
                      onPress={() => setReviewOrder(o)}
                      className={`flex-1 items-center rounded-xl py-3 ${
                        reviewOrder === o ? 'bg-black dark:bg-white' : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      <Text className={`text-sm font-semibold ${
                        reviewOrder === o ? 'text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {t(`review.order_${o}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text className="mb-2 mt-5 text-sm font-semibold text-gray-500">{t('review.mode')}</Text>
                {/* Collapsed trigger: shows just the active mode. Tap toggles
                    an inline list of all options below — same UX pattern as
                    the native-language picker on the settings screen. */}
                <Pressable
                  onPress={() => setModeListOpen((v) => !v)}
                  className="flex-row items-center rounded-xl border border-gray-300 px-3 py-3 dark:border-gray-700"
                >
                  <MaterialIcons name={modeIcon(reviewMode)} size={22} color="#10b981" />
                  <Text className="ml-3 flex-1 text-base text-black dark:text-white">
                    {t(`review.mode_${reviewMode}`)}
                  </Text>
                  <MaterialIcons
                    name={modeListOpen ? 'expand-less' : 'expand-more'}
                    size={22}
                    color="#9ca3af"
                  />
                </Pressable>
                {modeListOpen ? (
                  // Self-scrolling list — only the 6 mode rows move when
                  // the user drags inside this box. Order section + mode
                  // trigger above stay fixed. Cap chosen so all 6 rows
                  // fit at default font; large fonts scroll within.
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    className="mt-1 rounded-xl border border-gray-200 dark:border-gray-800"
                    style={{ maxHeight: 350 }}
                    contentContainerStyle={{ padding: 4, gap: 4 }}
                  >
                    {MODE_ORDER.map((m) => {
                      const rem = settingsRemaining[m] ?? Infinity;
                      const limit = getDailyLimit(m as LimitReviewMode);
                      const isSelected = reviewMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => {
                            setReviewMode(m);
                            setModeListOpen(false);
                          }}
                          className={`flex-row items-center rounded-lg px-3 py-3 ${
                            isSelected ? 'bg-black/5 dark:bg-white/10' : ''
                          }`}
                        >
                          <MaterialIcons
                            name={modeIcon(m)}
                            size={22}
                            color={isSelected ? '#10b981' : '#6b7280'}
                          />
                          <Text className="ml-3 flex-1 text-base text-black dark:text-white">
                            {t(`review.mode_${m}`)}
                          </Text>
                          {!premium && rem !== Infinity ? (
                            <Text className="text-xs text-gray-400">
                              {rem}/{limit}
                            </Text>
                          ) : null}
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
                <Text className="mb-2 text-sm font-semibold text-gray-500">{t('review.session_count')}</Text>
                <View className="flex-row items-center justify-center gap-4">
                  <Pressable
                    onPress={() => setSessionCount((c) => Math.max(MIN_SESSION, c - 5))}
                    className={`h-10 w-10 items-center justify-center rounded-full ${
                      sessionCount <= MIN_SESSION ? 'bg-gray-100 dark:bg-gray-800' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                    disabled={sessionCount <= MIN_SESSION}
                  >
                    <Text className={`text-lg font-bold ${sessionCount <= MIN_SESSION ? 'text-gray-300 dark:text-gray-600' : 'text-black dark:text-white'}`}>−</Text>
                  </Pressable>
                  <Text className="min-w-[40px] text-center text-2xl font-bold text-black dark:text-white">
                    {sessionCount}
                  </Text>
                  <Pressable
                    onPress={() => setSessionCount((c) => Math.min(MAX_SESSION, c + 5))}
                    className={`h-10 w-10 items-center justify-center rounded-full ${
                      sessionCount >= MAX_SESSION ? 'bg-gray-100 dark:bg-gray-800' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                    disabled={sessionCount >= MAX_SESSION}
                  >
                    <Text className={`text-lg font-bold ${sessionCount >= MAX_SESSION ? 'text-gray-300 dark:text-gray-600' : 'text-black dark:text-white'}`}>+</Text>
                  </Pressable>
                </View>

                <Pressable onPress={onStart} className="mt-4 items-center rounded-xl bg-black py-4 dark:bg-white">
                  <Text className="text-base font-semibold text-white dark:text-black">{t('review.start')}</Text>
                </Pressable>
              </View>
          </Animated.View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
