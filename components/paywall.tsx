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

import { Card } from '@/components/ui/card';
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
      if (o.monthly) setMonthlyPrice(o.monthly.priceString);
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

  const features: { icon: React.ComponentProps<typeof MaterialIcons>['name']; text: string }[] = [
    { icon: 'all-inclusive', text: t('premium.feature_unlimited') },
    { icon: 'folder', text: t('premium.feature_wordlists') },
    { icon: 'block', text: t('premium.feature_no_ads') },
    { icon: 'photo-camera', text: t('premium.feature_image') },
    { icon: 'file-download', text: t('premium.feature_export') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* App bar */}
      <View className="h-11 flex-row items-center px-5">
        <Pressable onPress={closePage} className="mr-1 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button" hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
        </Pressable>
        <Text className="text-lg font-bold text-ink dark:text-ink-dark">
          MoaVoca {t('premium.title')}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}>
        {/* Hero */}
        <View className="items-center pt-2">
          <View className="h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-accent-soft dark:bg-accent-soft-dark">
            <MaterialIcons name="workspace-premium" size={40} color="#1E9E84" />
          </View>
          <Text className="mt-4 text-2xl font-extrabold tracking-tight text-ink dark:text-ink-dark" style={{ lineHeight: 32 }}>
            MoaVoca {t('premium.title')}
          </Text>
          <Text className="mt-1.5 text-sm text-muted">{t('tier.pro_tagline')}</Text>
        </View>

        {/* Feature checklist */}
        <Card className="mt-6 p-2">
          {features.map((f, i) => (
            <View
              key={f.icon}
              className={`flex-row items-center gap-3.5 px-3.5 py-3 ${i < features.length - 1 ? 'border-b border-line dark:border-line-dark' : ''}`}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
                <MaterialIcons name={f.icon} size={20} color="#1E9E84" />
              </View>
              <Text className="flex-1 text-[15px] font-semibold text-ink dark:text-ink-dark">{f.text}</Text>
              <MaterialIcons name="check" size={20} color="#2EC4A5" />
            </View>
          ))}
        </Card>

        {/* Plan selector */}
        <View className="mt-6 flex-row gap-3">
          <PlanCard
            label={t('premium.annual')}
            price={annualPrice}
            per={t('premium.per_month', { price: annualPerMonth })}
            ribbon={t('premium.annual_save', { percent: savingsPercent })}
            selected={plan === 'annual'}
            onPress={() => setPlan('annual')}
          />
          <PlanCard
            label={t('premium.monthly')}
            price={monthlyPrice}
            selected={plan === 'monthly'}
            onPress={() => setPlan('monthly')}
          />
        </View>

        {/* Disclosure (Apple 3.1.2(a) / Play) — must stay on the paywall */}
        <Text className="mt-4 text-center text-[11px] leading-4 text-faint">
          {t('premium.disclosure', { monthlyPrice, annualPrice })}
        </Text>

        {/* Links — restore / manage / legal (compliance: terms+privacy+business reachable) */}
        <View className="mt-3 flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Pressable onPress={handleRestore} disabled={restoring}>
            <Text className="text-[11px] text-faint underline">
              {restoring ? t('premium.restoring') : t('premium.restore')}
            </Text>
          </Pressable>
          <Text className="text-[11px] text-faint">·</Text>
          <Pressable onPress={() => {
            const url = Platform.OS === 'ios'
              ? 'https://apps.apple.com/account/subscriptions'
              : 'https://play.google.com/store/account/subscriptions';
            Linking.openURL(url).catch(() => {});
          }}>
            <Text className="text-[11px] text-faint underline">{t('premium.manage_subscription')}</Text>
          </Pressable>
          <Text className="text-[11px] text-faint">·</Text>
          <Pressable onPress={() => router.push('/terms')}><Text className="text-[11px] text-faint underline">{t('settings.terms')}</Text></Pressable>
          <Text className="text-[11px] text-faint">·</Text>
          <Pressable onPress={() => router.push('/privacy')}><Text className="text-[11px] text-faint underline">{t('settings.privacy')}</Text></Pressable>
          <Text className="text-[11px] text-faint">·</Text>
          <Pressable onPress={() => router.push('/business-info')}><Text className="text-[11px] text-faint underline">{t('settings.business_info')}</Text></Pressable>
        </View>

        {message ? <Text className="mt-2 text-center text-sm text-muted">{message}</Text> : null}
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View className="border-t border-line bg-surface px-5 pb-2 pt-3.5 dark:border-line-dark dark:bg-surface-dark">
        <Pressable
          onPress={handlePurchase}
          disabled={purchasing}
          className="h-14 items-center justify-center rounded-[14px] bg-accent active:opacity-80"
          accessibilityRole="button"
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-bold text-white">
              {plan === 'annual' ? annualPrice : monthlyPrice} · {t('premium.subscribe')}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PlanCard({ label, price, per, ribbon, selected, onPress }: {
  label: string;
  price: string;
  per?: string;
  ribbon?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-[18px] border-2 bg-surface p-4 dark:bg-surface-dark ${selected ? 'border-accent' : 'border-line dark:border-line-dark'}`}
    >
      {ribbon ? (
        <View className="absolute -top-2.5 right-3.5 rounded-full bg-accent px-2.5 py-[3px]">
          <Text className="text-[11px] font-extrabold text-white">{ribbon}</Text>
        </View>
      ) : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-muted">{label}</Text>
        <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-accent bg-accent' : 'border-line dark:border-line-dark'}`}>
          {selected ? <MaterialIcons name="check" size={12} color="#fff" /> : null}
        </View>
      </View>
      <Text className="mt-2 text-2xl font-extrabold tracking-tight text-ink dark:text-ink-dark" style={{ lineHeight: 30 }}>
        {price}
      </Text>
      <Text className="mt-0.5 text-xs text-faint" numberOfLines={1}>{per ?? ' '}</Text>
    </Pressable>
  );
}
