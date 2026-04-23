import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isAnonymous } from '@src/services/authService';
import { setPaywallPending } from '@src/services/paywallPending';
import {
  getOfferings,
  purchaseAnnual,
  purchaseMonthly,
  restorePurchases,
} from '@src/services/subscriptionService';

import { formatLocalPrice } from '@src/utils/pure';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function Paywall({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const [monthlyPrice, setMonthlyPrice] = useState('$3.99');
  const [annualPrice, setAnnualPrice] = useState('$29.99');
  const [annualPerMonth, setAnnualPerMonth] = useState('$2.49');
  const [savingsPercent, setSavingsPercent] = useState(37);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('');

  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMessage('');
      translateY.value = 1000;
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 300 });
      });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    getOfferings().then((o) => {
      if (!o) return;
      if (o.monthly) {
        setMonthlyPrice(o.monthly.priceString);
      }
      if (o.annual) {
        setAnnualPrice(o.annual.priceString);
        setAnnualPerMonth(formatLocalPrice(o.annual.price / 12, o.annual.currencyCode));
      }
      if (o.monthly && o.annual) {
        setSavingsPercent(Math.round((1 - o.annual.price / (o.monthly.price * 12)) * 100));
      }
    });
  }, [visible]);

  const requireAuth = async (): Promise<boolean> => {
    if (await isAnonymous()) {
      setPaywallPending();
      onClose();
      router.push('/auth');
      return true;
    }
    return false;
  };

  const handlePurchase = async () => {
    if (await requireAuth()) return;
    setPurchasing(true);
    setMessage('');
    const success = plan === 'annual' ? await purchaseAnnual() : await purchaseMonthly();
    setPurchasing(false);
    if (success) onClose();
  };

  const handleRestore = async () => {
    if (await requireAuth()) return;
    setRestoring(true);
    setMessage('');
    const success = await restorePurchases();
    setRestoring(false);
    if (success) {
      setMessage(t('premium.restored'));
      setTimeout(onClose, 1000);
    } else {
      setMessage(t('premium.restore_empty'));
    }
  };

  const hideSheet = useCallback(() => {
    onClose();
  }, [onClose]);

  const dismissSheet = useCallback(() => {
    translateY.value = withTiming(1000, { duration: 250 }, () => {
      runOnJS(hideSheet)();
    });
  }, [hideSheet]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onUpdate((e) => {
        if (e.translationY > 0) translateY.value = e.translationY;
      })
      .onEnd((e) => {
        if (e.translationY > 400 || e.velocityY > 800) {
          translateY.value = withTiming(1000, { duration: 200 }, () => {
            runOnJS(hideSheet)();
          });
        } else {
          translateY.value = withTiming(0, { duration: 250 });
        }
      }),
    [hideSheet],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const features = [
    { icon: 'all-inclusive' as const, text: t('premium.feature_unlimited') },
    { icon: 'photo-camera' as const, text: t('premium.feature_image') },
    { icon: 'folder' as const, text: t('premium.feature_wordlists') },
    { icon: 'file-download' as const, text: t('premium.feature_export') },
    { icon: 'block' as const, text: t('premium.feature_no_ads') },
  ];

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

                {/* Title */}
                <Text className="text-center text-2xl font-bold text-black dark:text-white">
                  TypeWord {t('premium.title')}
                </Text>

                {/* Features */}
                <View className="mt-6 gap-4">
                  {features.map((f) => (
                    <View key={f.icon} className="flex-row items-center">
                      <View
                        className="mr-3 h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: '#2EC4A520' }}
                      >
                        <MaterialIcons name={f.icon as any} size={20} color="#2EC4A5" />
                      </View>
                      <Text className="flex-1 text-base text-black dark:text-white">{f.text}</Text>
                    </View>
                  ))}
                </View>

                {/* Plan selector */}
                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    onPress={() => setPlan('monthly')}
                    className={`flex-1 rounded-xl border-2 p-4 ${
                      plan === 'monthly'
                        ? 'border-[#2EC4A5]'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <Text className="text-sm text-gray-500">{t('premium.monthly')}</Text>
                    <Text className="mt-1 text-xl font-bold text-black dark:text-white">
                      {monthlyPrice}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setPlan('annual')}
                    className={`flex-1 rounded-xl border-2 p-4 ${
                      plan === 'annual'
                        ? 'border-[#2EC4A5]'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm text-gray-500">{t('premium.annual')}</Text>
                      <View className="rounded-full bg-[#2EC4A5] px-2 py-0.5">
                        <Text className="text-xs font-semibold text-white">
                          {t('premium.annual_save', { percent: savingsPercent })}
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-1 text-xl font-bold text-black dark:text-white">
                      {annualPrice}
                    </Text>
                    <Text className="text-xs text-gray-400">
                      {t('premium.per_month', { price: annualPerMonth })}
                    </Text>
                  </Pressable>
                </View>

                {/* Purchase button */}
                <Pressable
                  onPress={handlePurchase}
                  disabled={purchasing}
                  className="mt-6 items-center rounded-xl py-4"
                  style={{ backgroundColor: '#2EC4A5' }}
                >
                  {purchasing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-base font-semibold text-white">
                      {t('premium.subscribe')}
                    </Text>
                  )}
                </Pressable>

                {/* Restore */}
                <Pressable onPress={handleRestore} disabled={restoring} className="mt-3 items-center py-2">
                  <Text className="text-sm text-gray-500">
                    {restoring ? t('premium.restoring') : t('premium.restore')}
                  </Text>
                </Pressable>

                {/* Message */}
                {message ? (
                  <Text className="mt-2 text-center text-sm text-gray-500">{message}</Text>
                ) : null}

                {/* Legal links */}
                <View className="mt-4 flex-row items-center justify-center gap-3">
                  <Pressable onPress={() => router.push('/terms')}>
                    <Text className="text-xs text-gray-400 underline">{t('settings.terms')}</Text>
                  </Pressable>
                  <Text className="text-xs text-gray-300">|</Text>
                  <Pressable onPress={() => router.push('/privacy')}>
                    <Text className="text-xs text-gray-400 underline">{t('settings.privacy')}</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
