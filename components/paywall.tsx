import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isAnonymous } from '@src/services/authService';
import { setPaywallPending } from '@src/services/paywallPending';
import { haptic } from '@src/services/hapticService';
import {
  getOfferings,
  purchaseAnnual,
  purchaseMonthly,
  restorePurchases,
} from '@src/services/subscriptionService';

import { formatLocalPrice } from '@src/utils/pure';

export function Paywall() {
  const { t } = useTranslation();

  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  // Fallback defaults — overwritten by RevenueCat offerings on mount.
  // Kept in sync with App Store Connect + Play Console + RevenueCat product
  // configuration: $5.99/mo + $39.99/yr (44% off, ~5.3 months free).
  const [monthlyPrice, setMonthlyPrice] = useState('$5.99');
  const [annualPrice, setAnnualPrice] = useState('$39.99');
  const [annualPerMonth, setAnnualPerMonth] = useState('$3.33');
  const [savingsPercent, setSavingsPercent] = useState(44);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
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
  }, []);

  const closePage = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const requireAuth = async (): Promise<boolean> => {
    if (await isAnonymous()) {
      setPaywallPending();
      router.replace('/auth');
      return true;
    }
    return false;
  };

  const handlePurchase = async () => {
    haptic.tap();
    if (await requireAuth()) return;
    setPurchasing(true);
    setMessage('');
    const success = plan === 'annual' ? await purchaseAnnual() : await purchaseMonthly();
    setPurchasing(false);
    if (success) {
      haptic.success();
      closePage();
    }
  };

  const handleRestore = async () => {
    if (await requireAuth()) return;
    setRestoring(true);
    setMessage('');
    const success = await restorePurchases();
    setRestoring(false);
    if (success) {
      haptic.success();
      setMessage(t('premium.restored'));
      setTimeout(closePage, 1000);
    } else {
      setMessage(t('premium.restore_empty'));
    }
  };

  const features = [
    { icon: 'all-inclusive' as const, text: t('premium.feature_unlimited') },
    { icon: 'folder' as const, text: t('premium.feature_wordlists') },
    { icon: 'block' as const, text: t('premium.feature_no_ads') },
    { icon: 'photo-camera' as const, text: t('premium.feature_image') },
    { icon: 'file-download' as const, text: t('premium.feature_export') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 32 }}>
        {/* Header — back button + title (matches other stack pages) */}
        <View className="mb-4 h-11 flex-row items-center">
          <Pressable
            onPress={closePage}
            className="mr-2 p-1"
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            MoaVoca {t('premium.title')}
          </Text>
        </View>

        {/* Features */}
        <View className="gap-4">
          {features.map((f) => (
            <View key={f.icon} className="flex-row items-center">
              <View
                className="mr-3 h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: '#2EC4A520' }}
              >
                <MaterialIcons name={f.icon as any} size={20} color="#2EC4A5" />
              </View>
              <Text className="flex-1 text-base text-ink dark:text-ink-dark">{f.text}</Text>
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
                : 'border-line dark:border-line-dark'
            }`}
          >
            <Text className="text-sm text-muted">{t('premium.monthly')}</Text>
            <Text className="mt-1 text-xl font-bold text-ink dark:text-ink-dark">
              {monthlyPrice}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setPlan('annual')}
            className={`flex-1 rounded-xl border-2 p-4 ${
              plan === 'annual'
                ? 'border-[#2EC4A5]'
                : 'border-line dark:border-line-dark'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-muted">{t('premium.annual')}</Text>
              <View className="rounded-full bg-[#2EC4A5] px-2 py-0.5">
                <Text className="text-xs font-semibold text-white">
                  {t('premium.annual_save', { percent: savingsPercent })}
                </Text>
              </View>
            </View>
            <Text className="mt-1 text-xl font-bold text-ink dark:text-ink-dark">
              {annualPrice}
            </Text>
            <Text className="text-xs text-faint">
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

        {/* Subscription utility links — restore + manage (한 줄) */}
        <View className="mt-3 flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Pressable onPress={handleRestore} disabled={restoring}>
            <Text className="text-xs text-faint underline">
              {restoring ? t('premium.restoring') : t('premium.restore')}
            </Text>
          </Pressable>
          <Text className="text-xs text-faint">|</Text>
          <Pressable
            onPress={() => {
              const url = Platform.OS === 'ios'
                ? 'https://apps.apple.com/account/subscriptions'
                : 'https://play.google.com/store/account/subscriptions';
              Linking.openURL(url).catch(() => {});
            }}
          >
            <Text className="text-xs text-faint underline">
              {t('premium.manage_subscription', { defaultValue: 'Manage Subscription' })}
            </Text>
          </Pressable>
        </View>

        {/* Message */}
        {message ? (
          <Text className="mt-2 text-center text-sm text-muted">{message}</Text>
        ) : null}

        {/* Apple Guideline 3.1.2(a) / Google Play subscription disclosure.
            Must appear ON the paywall (not just in ToS). Spelled out
            in plain language: subscription title + length + auto-renew
            + cancellation method. i18n strings render in the user's
            selected language. */}
        <Text className="mt-4 text-center text-xs leading-4 text-muted">
          {t('premium.disclosure', {
            monthlyPrice,
            annualPrice,
            defaultValue:
              'MoaVoca Premium — Monthly ({{monthlyPrice}}/month) or Annual ({{annualPrice}}/year). Payment is charged to your Apple ID or Google account at confirmation of purchase. Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage subscriptions and turn off auto-renewal by going to your Account Settings after purchase.',
          })}
        </Text>

        {/* Legal links — terms + privacy + business info (전자상거래법 disclosure
            must be reachable at the point of purchase). */}
        <View className="mt-3 flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Pressable onPress={() => router.push('/terms')}>
            <Text className="text-xs text-faint underline">{t('settings.terms')}</Text>
          </Pressable>
          <Text className="text-xs text-faint">|</Text>
          <Pressable onPress={() => router.push('/privacy')}>
            <Text className="text-xs text-faint underline">{t('settings.privacy')}</Text>
          </Pressable>
          <Text className="text-xs text-faint">|</Text>
          <Pressable onPress={() => router.push('/business-info')}>
            <Text className="text-xs text-faint underline">{t('settings.business_info')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
