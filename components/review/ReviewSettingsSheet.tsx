import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useCallback } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { type SharedValue, runOnJS, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePremium } from '@src/hooks/usePremium';
import { getDailyLimit, type ReviewMode as LimitReviewMode } from '@src/services/reviewLimitService';

type ReviewOrder = 'newest' | 'shuffle';
type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context';

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
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const premium = usePremium();

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
          <GestureDetector gesture={panGesture}>
            <Animated.View className="rounded-t-3xl bg-white px-6 pt-6 dark:bg-gray-900" style={[{ paddingBottom: Math.max(insets.bottom, 16) + 16 }, sheetAnimStyle]}>
              <Pressable onPress={() => {}}>
                <View className="mb-4 items-center">
                  <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                </View>
                <Text className="text-xl font-bold text-black dark:text-white">
                  {t('review.settings_title')}
                </Text>

                <Text className="mb-2 mt-5 text-sm font-semibold text-gray-500">{t('review.order')}</Text>
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
                <View className="flex-row flex-wrap gap-2">
                  {(['flashcard', 'choice', 'dictation', 'context'] as const).map((m) => {
                    const icon = m === 'flashcard' ? 'style' : m === 'choice' ? 'quiz' : m === 'dictation' ? 'keyboard' : 'menu-book';
                    const rem = settingsRemaining[m] ?? Infinity;
                    const limit = getDailyLimit(m as LimitReviewMode);
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setReviewMode(m)}
                        className={`w-[48%] items-center rounded-xl py-4 ${
                          reviewMode === m ? 'bg-black dark:bg-white' : 'bg-gray-100 dark:bg-gray-800'
                        }`}
                      >
                        <MaterialIcons
                          name={icon}
                          size={24}
                          color={reviewMode === m ? (colorScheme === 'dark' ? '#000' : '#fff') : '#6b7280'}
                        />
                        <Text className={`mt-1 text-sm font-semibold ${
                          reviewMode === m ? 'text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                        }`}>
                          {t(`review.mode_${m}`)}
                        </Text>
                        {!premium && rem !== Infinity ? (
                          <Text className={`mt-0.5 text-xs ${
                            reviewMode === m ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {rem}/{limit}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                <Text className="mb-2 mt-5 text-sm font-semibold text-gray-500">{t('review.session_count')}</Text>
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

                <Pressable onPress={onStart} className="mt-6 items-center rounded-xl bg-black py-4 dark:bg-white">
                  <Text className="text-base font-semibold text-white dark:text-black">{t('review.start')}</Text>
                </Pressable>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
