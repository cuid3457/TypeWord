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

export function Paywall() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';

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
    if (await requireAuth()) return;
    setPurchasing(true);
    setMessage('');
    const success = plan === 'annual' ? await purchaseAnnual() : await purchaseMonthly();
    setPurchasing(false);
    if (success) closePage();
  };

  const handleRestore = async () => {
    if (await requireAuth()) return;
    setRestoring(true);
    setMessage('');
    const success = await restorePurchases();
    setRestoring(false);
    if (success) {
      setMessage(t('premium.restored'));
      setTimeout(closePage, 1000);
    } else {
      setMessage(t('premium.restore_empty'));
    }
  };

  const features = [
    { icon: 'all-inclusive' as const, text: t('premium.feature_unlimited') },
    { icon: 'photo-camera' as const, text: t('premium.feature_image') },
    { icon: 'folder' as const, text: t('premium.feature_wordlists') },
    { icon: 'file-download' as const, text: t('premium.feature_export') },
    { icon: 'block' as const, text: t('premium.feature_no_ads') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — back button + title */}
      <View className="flex-row items-center px-4 py-2">
        <Pressable
          onPress={closePage}
          className="p-2"
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <MaterialIcons name="arrow-back" size={24} color={dark ? '#fff' : '#000'} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 32,
        }}
      >
        {/* Title */}
        <Text className="text-center text-2xl font-bold text-black dark:text-white">
          MoaVoca {t('premium.title')}
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

        {/* Apple Guideline 3.1.2(a) / Google Play subscription disclosure.
            Must appear ON the paywall (not just in ToS). Spelled out
            in plain language: subscription title + length + auto-renew
            + cancellation method. i18n strings render in the user's
            selected language. */}
        <Text className="mt-4 text-center text-xs leading-4 text-gray-500 dark:text-gray-400">
          {t('premium.disclosure', {
            monthlyPrice,
            annualPrice,
            defaultValue:
              'MoaVoca Premium — Monthly ({{monthlyPrice}}/month) or Annual ({{annualPrice}}/year). Payment is charged to your Apple ID or Google account at confirmation of purchase. Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage subscriptions and turn off auto-renewal by going to your Account Settings after purchase.',
          })}
        </Text>

        {/* Manage subscription deep link */}
        <Pressable
          onPress={() => {
            const url = Platform.OS === 'ios'
              ? 'https://apps.apple.com/account/subscriptions'
              : 'https://play.google.com/store/account/subscriptions';
            Linking.openURL(url).catch(() => {});
          }}
          className="mt-2 items-center py-1"
        >
          <Text className="text-xs text-gray-500 underline">
            {t('premium.manage_subscription', { defaultValue: 'Manage Subscription' })}
          </Text>
        </Pressable>

        {/* Message */}
        {message ? (
          <Text className="mt-2 text-center text-sm text-gray-500">{message}</Text>
        ) : null}

        {/* Legal links — terms + privacy + business info (전자상거래법 disclosure
            must be reachable at the point of purchase). */}
        <View className="mt-3 flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Pressable onPress={() => router.push('/terms')}>
            <Text className="text-xs text-gray-400 underline">{t('settings.terms')}</Text>
          </Pressable>
          <Text className="text-xs text-gray-300">|</Text>
          <Pressable onPress={() => router.push('/privacy')}>
            <Text className="text-xs text-gray-400 underline">{t('settings.privacy')}</Text>
          </Pressable>
          <Text className="text-xs text-gray-300">|</Text>
          <Pressable onPress={() => router.push('/business-info')}>
            <Text className="text-xs text-gray-400 underline">{t('settings.business_info')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
