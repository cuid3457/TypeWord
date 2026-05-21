import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTier } from '@src/hooks/usePremium';
import { isAnonymous } from '@src/services/authService';
import { setPaywallPending } from '@src/services/paywallPending';
import {
  getTierOfferings,
  purchaseTier,
  restorePurchases,
  type TierOfferings,
  type Tier,
} from '@src/services/subscriptionService';
import { formatLocalPrice } from '@src/utils/pure';
import { Toast } from '@/components/toast';

type Cycle = 'monthly' | 'annual';
type SelectablePaidTier = 'plus' | 'pro';

const ACCENT = '#2EC4A5';

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const currentTier = useTier();

  const [cycle, setCycle] = useState<Cycle>('annual');
  const [selectedTier, setSelectedTier] = useState<SelectablePaidTier>(
    currentTier === 'plus' ? 'pro' : 'plus',
  );
  const [offerings, setOfferings] = useState<TierOfferings | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getTierOfferings().then(setOfferings);
  }, []);

  const priceFor = (tier: SelectablePaidTier, c: Cycle): { display: string; perMonth?: string; price?: number } => {
    const pkg = c === 'annual' ? offerings?.[tier]?.annual : offerings?.[tier]?.monthly;
    if (!pkg) return { display: '—' };
    if (c === 'annual') {
      return {
        display: pkg.priceString,
        perMonth: formatLocalPrice(pkg.price / 12, pkg.currencyCode),
        price: pkg.price,
      };
    }
    return { display: pkg.priceString, price: pkg.price };
  };

  const annualSavings = (tier: SelectablePaidTier): number => {
    const monthly = offerings?.[tier]?.monthly?.price;
    const annual = offerings?.[tier]?.annual?.price;
    if (!monthly || !annual || monthly <= 0) return 0;
    return Math.max(0, Math.round((1 - annual / (monthly * 12)) * 100));
  };

  const requireAuth = async (): Promise<boolean> => {
    if (await isAnonymous()) {
      setPaywallPending();
      router.push('/auth');
      return true;
    }
    return false;
  };

  const handlePurchase = async () => {
    if (await requireAuth()) return;
    setPurchasing(true);
    const success = await purchaseTier(selectedTier, cycle);
    setPurchasing(false);
    if (success) {
      setToast(t('premium.restored'));
      setTimeout(() => router.back(), 1000);
    } else {
      setToast(t('premium.restore_empty'));
    }
  };

  const handleRestore = async () => {
    if (await requireAuth()) return;
    setRestoring(true);
    const success = await restorePurchases();
    setRestoring(false);
    setToast(success ? t('premium.restored') : t('premium.restore_empty'));
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center px-4 pt-2">
        <Pressable onPress={() => router.back()} className="p-2">
          <MaterialIcons name="close" size={24} color={dark ? '#9ca3af' : '#6b7280'} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 220 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text className="text-3xl font-bold text-black dark:text-white">
          {t('tier.page_title')}
        </Text>
        <Text className="mt-1 text-sm text-gray-500">
          {t('tier.page_subtitle')}
        </Text>

        {/* Billing cycle toggle */}
        <View className="mt-5 flex-row self-start rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          <Pressable
            onPress={() => setCycle('monthly')}
            className={`rounded-lg px-4 py-2 ${cycle === 'monthly' ? 'bg-white dark:bg-gray-700' : ''}`}
          >
            <Text className={`text-sm font-medium ${cycle === 'monthly' ? 'text-black dark:text-white' : 'text-gray-500'}`}>
              {t('tier.monthly_billing')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCycle('annual')}
            className={`flex-row items-center rounded-lg px-4 py-2 ${cycle === 'annual' ? 'bg-white dark:bg-gray-700' : ''}`}
          >
            <Text className={`text-sm font-medium ${cycle === 'annual' ? 'text-black dark:text-white' : 'text-gray-500'}`}>
              {t('tier.annual_billing')}
            </Text>
            {annualSavings('plus') > 0 ? (
              <View className="ml-2 rounded-full bg-[#2EC4A5] px-2 py-0.5">
                <Text className="text-[10px] font-semibold text-white">
                  −{Math.max(annualSavings('plus'), annualSavings('pro'))}%
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Tier cards */}
        <View className="mt-6 gap-3">
          <TierCard
            tier="plus"
            accent={ACCENT}
            currentTier={currentTier}
            selected={selectedTier === 'plus'}
            onSelect={() => setSelectedTier('plus')}
            price={priceFor('plus', cycle)}
            cycle={cycle}
            highlight={t('tier.most_popular')}
          />
          <TierCard
            tier="pro"
            accent={ACCENT}
            currentTier={currentTier}
            selected={selectedTier === 'pro'}
            onSelect={() => setSelectedTier('pro')}
            price={priceFor('pro', cycle)}
            cycle={cycle}
          />
        </View>

        {/* Comparison table */}
        <Text className="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('tier.compare_features')}
        </Text>
        <ComparisonTable />

        {/* Restore + legal */}
        <Pressable onPress={handleRestore} disabled={restoring} className="mt-6 items-center py-2">
          <Text className="text-sm text-gray-500">
            {restoring ? t('premium.restoring') : t('premium.restore')}
          </Text>
        </Pressable>
        <View className="mt-2 flex-row items-center justify-center gap-3">
          <Pressable onPress={() => router.push('/terms')}>
            <Text className="text-xs text-gray-400 underline">{t('settings.terms')}</Text>
          </Pressable>
          <Text className="text-xs text-gray-300">|</Text>
          <Pressable onPress={() => router.push('/privacy')}>
            <Text className="text-xs text-gray-400 underline">{t('settings.privacy')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      {currentTier !== selectedTier && currentTier !== 'pro' ? (
        <View
          className="absolute bottom-0 left-0 right-0 border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-black"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 12, paddingTop: 12, paddingHorizontal: 20 }}
        >
          <Pressable
            onPress={handlePurchase}
            disabled={purchasing || !offerings?.[selectedTier]?.[cycle]}
            className="items-center rounded-xl py-4"
            style={{ backgroundColor: ACCENT, opacity: offerings?.[selectedTier]?.[cycle] ? 1 : 0.5 }}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-semibold text-white">
                {selectedTier === 'pro' ? t('tier.upgrade_to_pro') : t('tier.upgrade_to_plus')}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Toast visible={!!toast} message={toast} onHide={() => setToast('')} />
    </SafeAreaView>
  );
}

function TierCard({
  tier,
  accent,
  currentTier,
  selected,
  onSelect,
  price,
  cycle,
  highlight,
}: {
  tier: SelectablePaidTier;
  accent: string;
  currentTier: Tier;
  selected: boolean;
  onSelect: () => void;
  price: { display: string; perMonth?: string };
  cycle: Cycle;
  highlight?: string;
}) {
  const { t } = useTranslation();
  const isCurrent = currentTier === tier;
  const name = t(`tier.${tier}_name`);
  const tagline = t(`tier.${tier}_tagline`);

  return (
    <Pressable
      onPress={onSelect}
      className="rounded-2xl border-2 p-5"
      style={{
        borderColor: selected ? accent : 'transparent',
        backgroundColor: selected ? `${accent}10` : 'rgba(127,127,127,0.06)',
      }}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-xl font-bold text-black dark:text-white">{name}</Text>
            {isCurrent ? (
              <View className="rounded-md bg-gray-200 px-2 py-0.5 dark:bg-gray-700">
                <Text className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                  {t('tier.current_badge')}
                </Text>
              </View>
            ) : highlight ? (
              <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: accent }}>
                <Text className="text-[10px] font-semibold text-white">{highlight}</Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-1 text-xs text-gray-500">{tagline}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xl font-bold text-black dark:text-white">{price.display}</Text>
          {cycle === 'annual' && price.perMonth ? (
            <Text className="text-[11px] text-gray-400">
              {t('tier.per_month_short', { price: price.perMonth })}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ComparisonTable() {
  const { t } = useTranslation();
  const rows: Array<{ label: string; free: string; plus: string; pro: string }> = useMemo(
    () => [
      { label: t('tier.cards_label'), free: t('tier.cards_free'), plus: t('tier.cards_plus'), pro: t('tier.cards_pro') },
      { label: t('tier.images_label'), free: t('tier.images_free'), plus: t('tier.images_plus'), pro: t('tier.images_pro') },
      { label: t('tier.wordlists_label'), free: t('tier.wordlists_free'), plus: t('tier.wordlists_plus'), pro: t('tier.wordlists_pro') },
      { label: t('tier.lang_pair_label'), free: t('tier.lang_pair_free'), plus: t('tier.lang_pair_plus'), pro: t('tier.lang_pair_pro') },
      { label: t('tier.ads_label'), free: t('tier.ads_free'), plus: t('tier.ads_remove'), pro: t('tier.ads_remove') },
    ],
    [t],
  );

  return (
    <View className="rounded-2xl border border-gray-200 dark:border-gray-800">
      <View className="flex-row border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <View className="flex-[2]" />
        <ColumnHeader label={t('tier.free_name')} />
        <ColumnHeader label={t('tier.plus_name')} />
        <ColumnHeader label={t('tier.pro_name')} />
      </View>
      {rows.map((row, i) => (
        <View
          key={row.label}
          className={`flex-row px-3 py-3 ${i < rows.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}
        >
          <View className="flex-[2]">
            <Text className="text-xs text-gray-700 dark:text-gray-300">{row.label}</Text>
          </View>
          <Cell value={row.free} />
          <Cell value={row.plus} />
          <Cell value={row.pro} />
        </View>
      ))}
    </View>
  );
}

function ColumnHeader({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[11px] font-semibold uppercase text-gray-500">{label}</Text>
    </View>
  );
}

function Cell({ value }: { value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-center text-[11px] text-black dark:text-white" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
