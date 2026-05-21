import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTier } from '@src/hooks/usePremium';

export type PaywallReason = 'cards' | 'books' | 'images' | 'lang_pair' | 'general';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Why the paywall was triggered. Drives the title + hint copy. */
  reason?: PaywallReason;
  /** Optional callback for the "watch ad for +100 cards" button (cards reason
   * + free tier only). When absent the watch-ad option is hidden. */
  onWatchAd?: () => void;
}

const ACCENT = '#2EC4A5';

export function Paywall({ visible, onClose, reason = 'general', onWatchAd }: Props) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const tier = useTier();

  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 1000;
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 300 });
      });
    }
  }, [visible]);

  const hideSheet = useCallback(() => onClose(), [onClose]);

  const dismissSheet = useCallback(() => {
    translateY.value = withTiming(1000, { duration: 250 }, () => {
      runOnJS(hideSheet)();
    });
  }, [hideSheet]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onUpdate((e) => { if (e.translationY > 0) translateY.value = e.translationY; })
      .onEnd((e) => {
        if (e.translationY > 400 || e.velocityY > 800) {
          translateY.value = withTiming(1000, { duration: 200 }, () => { runOnJS(hideSheet)(); });
        } else {
          translateY.value = withTiming(0, { duration: 250 });
        }
      }),
    [hideSheet],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const goToSubscription = () => {
    dismissSheet();
    setTimeout(() => router.push('/subscription' as never), 250);
  };

  const handleWatchAd = () => {
    if (!onWatchAd) return;
    dismissSheet();
    setTimeout(() => onWatchAd(), 250);
  };

  const titleKey = reason === 'cards' ? 'paywall.limit_cards'
    : reason === 'books' ? 'paywall.limit_books'
    : reason === 'images' ? 'paywall.limit_images'
    : reason === 'lang_pair' ? 'paywall.limit_lang_pair'
    : 'premium.title';

  const hintKey = tier === 'plus' ? 'paywall.plus_to_pro_hint'
    : reason === 'cards' ? 'paywall.free_to_plus_hint'
    : 'paywall.free_to_plus_hint';

  const upgradeLabel = tier === 'plus' ? t('tier.upgrade_to_pro') : t('tier.upgrade_to_plus');
  const showWatchAd = tier === 'free' && reason === 'cards' && !!onWatchAd;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable
          onPress={dismissSheet}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                {
                  backgroundColor: dark ? '#1a1a2e' : '#fff',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingHorizontal: 24,
                  paddingTop: 20,
                  paddingBottom: Math.max(insets.bottom, 16) + 16,
                },
                sheetAnimStyle,
              ]}
            >
              <Pressable onPress={() => {}}>
                {/* Drag handle */}
                <View className="mb-4 items-center">
                  <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                </View>

                {/* Icon + title */}
                <View className="items-center">
                  <View
                    className="mb-3 h-14 w-14 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${ACCENT}20` }}
                  >
                    <MaterialIcons name="auto-awesome" size={28} color={ACCENT} />
                  </View>
                  <Text className="text-center text-xl font-bold text-black dark:text-white">
                    {t(titleKey)}
                  </Text>
                  <Text className="mt-2 text-center text-sm text-gray-500" numberOfLines={3}>
                    {t(hintKey)}
                  </Text>
                </View>

                {/* Watch ad (free + cards only) */}
                {showWatchAd ? (
                  <Pressable
                    onPress={handleWatchAd}
                    className="mt-6 flex-row items-center justify-center rounded-xl border border-gray-300 py-4 dark:border-gray-700"
                  >
                    <MaterialIcons name="play-circle-outline" size={20} color={dark ? '#e5e7eb' : '#374151'} />
                    <Text className="ml-2 text-base font-semibold text-black dark:text-white">
                      {t('paywall.watch_ad_cta')}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Primary CTA → subscription page */}
                <Pressable
                  onPress={goToSubscription}
                  className="mt-3 items-center rounded-xl py-4"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Text className="text-base font-semibold text-white">{upgradeLabel}</Text>
                </Pressable>

                {/* Secondary: view all plans */}
                <Pressable onPress={goToSubscription} className="mt-2 items-center py-2">
                  <Text className="text-sm text-gray-500">{t('paywall.view_plans')}</Text>
                </Pressable>

                {/* Tertiary: dismiss */}
                <Pressable onPress={dismissSheet} className="mt-1 items-center py-2">
                  <Text className="text-xs text-gray-400">{t('paywall.later')}</Text>
                </Pressable>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
