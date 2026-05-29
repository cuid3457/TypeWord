import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  boostMinutesLeft,
  getInventory,
  isBoostActive,
  purchaseItem,
  PurchaseError,
  refreshInventory,
  subscribeInventory,
  type InventorySnapshot,
  type StoreItemId,
} from '@src/services/pointsService';
import { haptic } from '@src/services/hapticService';

type StoreItem = {
  id: StoreItemId;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  iconTint: string;
  titleKey: string;
  descKey: string;
  price: number;
  badgeKey?: string;
};

const FREEZE_ITEMS: StoreItem[] = [
  {
    id: 'freeze_1',
    icon: 'shield',
    iconTint: '#3b82f6',
    titleKey: 'store.items.freeze_1.title',
    descKey: 'store.items.freeze_1.desc',
    price: 50,
  },
  {
    id: 'freeze_3',
    icon: 'shield',
    iconTint: '#3b82f6',
    titleKey: 'store.items.freeze_3.title',
    descKey: 'store.items.freeze_3.desc',
    price: 120,
    badgeKey: 'store.badge_20_off',
  },
];

const BOOST_ITEMS: StoreItem[] = [
  {
    id: 'boost_15',
    icon: 'flash-on',
    iconTint: '#f59e0b',
    titleKey: 'store.items.boost_15.title',
    descKey: 'store.items.boost_15.desc',
    price: 20,
  },
  {
    id: 'boost_60',
    icon: 'flash-on',
    iconTint: '#f59e0b',
    titleKey: 'store.items.boost_60.title',
    descKey: 'store.items.boost_60.desc',
    price: 60,
    badgeKey: 'store.badge_25_off',
  },
];

const BRAND_GREEN = '#2EC4A5';

export default function StoreScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const [snap, setSnap] = useState<InventorySnapshot>(getInventory());
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<StoreItemId | null>(null);

  useEffect(() => subscribeInventory(setSnap), []);

  useFocusEffect(useCallback(() => {
    refreshInventory().catch(() => {});
  }, []));

  // Re-render every 30 s while a boost is active so the countdown stays current.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isBoostActive(snap)) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [snap]);

  const points = snap.points;
  const freezeCount = snap.streakFreezes;
  const minutesLeft = boostMinutesLeft(snap);
  const boostActive = isBoostActive(snap);

  const handlePurchase = async (item: StoreItem) => {
    if (busy) return;
    if (points < item.price) {
      setToast(t('store.insufficient_points'));
      return;
    }
    setBusy(item.id);
    try {
      await purchaseItem(item.id);
      haptic.success();
      setToast(t('store.purchase_success'));
    } catch (e) {
      if (e instanceof PurchaseError && e.code === 'insufficient_points') {
        setToast(t('store.insufficient_points'));
      } else {
        setToast(t('store.purchase_failed'));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          // SafeAreaView's 'bottom' edge already accounts for the nav bar
          // inset, so this is just visual breathing room after the last item.
          paddingBottom: 24,
        }}
      >
        {/* Header — scrollable with content */}
        <View className="mb-4 h-11 flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="mr-2 p-1"
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>
          <Text className="text-base font-semibold text-black dark:text-white">
            {t('store.title')}
          </Text>
        </View>
        {/* Points balance — matches settings premium card style (tinted
            fill + brand green border). */}
        <View
          className="rounded-2xl p-5"
          style={{ backgroundColor: '#2EC4A520', borderWidth: 1, borderColor: BRAND_GREEN }}
        >
          <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_GREEN }}>
            {t('store.balance')}
          </Text>
          <View className="mt-2 flex-row items-end justify-between">
            <Text className="text-4xl font-bold text-black dark:text-white">
              {points.toLocaleString()}
              <Text className="text-base font-medium text-gray-500">
                {' '}{t('store.points_unit')}
              </Text>
            </Text>
            <MaterialIcons name="monetization-on" size={40} color={BRAND_GREEN} />
          </View>
        </View>

        {/* Inventory summary */}
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
            <View className="flex-row items-center">
              <MaterialIcons name="shield" size={18} color="#3b82f6" />
              <Text className="ml-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t('store.freeze_count')}
              </Text>
            </View>
            <Text className="mt-1 text-2xl font-bold text-black dark:text-white">
              {freezeCount}
            </Text>
          </View>
          <View className="flex-1 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
            <View className="flex-row items-center">
              <MaterialIcons name="flash-on" size={18} color="#f59e0b" />
              <Text className="ml-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t('store.active_boost')}
              </Text>
            </View>
            <Text
              className={`mt-1 text-xl font-bold ${boostActive ? 'text-amber-500' : 'text-gray-400 dark:text-gray-600'}`}
              numberOfLines={1}
            >
              {boostActive
                ? t('store.boost_minutes_left', { minutes: minutesLeft })
                : t('store.no_active_boost')}
            </Text>
          </View>
        </View>

        {/* Streak protection group */}
        <View className="mt-6">
          <View className="flex-row items-center">
            <MaterialIcons name="shield" size={18} color="#3b82f6" />
            <Text className="ml-1.5 text-sm font-bold text-black dark:text-white">
              {t('store.group_streak')}
            </Text>
          </View>
          <View className="mt-2 overflow-hidden rounded-2xl border border-gray-300 dark:border-gray-700">
            {FREEZE_ITEMS.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                affordable={points >= item.price}
                busy={busy === item.id}
                onPress={() => handlePurchase(item)}
                isLast={idx === FREEZE_ITEMS.length - 1}
              />
            ))}
          </View>
        </View>

        {/* XP boost group */}
        <View className="mt-6">
          <View className="flex-row items-center">
            <MaterialIcons name="flash-on" size={18} color="#f59e0b" />
            <Text className="ml-1.5 text-sm font-bold text-black dark:text-white">
              {t('store.group_boost')}
            </Text>
          </View>
          <View className="mt-2 overflow-hidden rounded-2xl border border-gray-300 dark:border-gray-700">
            {BOOST_ITEMS.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                affordable={points >= item.price}
                busy={busy === item.id}
                onPress={() => handlePurchase(item)}
                isLast={idx === BOOST_ITEMS.length - 1}
              />
            ))}
          </View>
        </View>

        {/* How to earn */}
        <View className={`mt-6 rounded-2xl p-4 ${dark ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <View className="flex-row items-center">
            <MaterialIcons name="info-outline" size={16} color="#6b7280" />
            <Text className="ml-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
              {t('store.how_to_earn_title')}
            </Text>
          </View>
          <View className="mt-2 gap-1">
            <EarnRow icon="check-circle-outline" text={t('store.earn_session')} />
            <EarnRow icon="favorite-border" text={t('store.earn_like')} />
            <EarnRow icon="download" text={t('store.earn_download')} />
          </View>
        </View>
      </ScrollView>
      </TabletContainer>

      <Toast visible={!!toast} message={toast ?? ''} type="success" onHide={() => setToast(null)} style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }} />
    </SafeAreaView>
  );
}

function ItemRow({ item, affordable, busy, onPress, isLast }: {
  item: StoreItem;
  affordable: boolean;
  busy: boolean;
  onPress: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className={`flex-row items-center p-4 ${isLast ? '' : 'border-b border-gray-300 dark:border-gray-700'} active:opacity-70`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800" style={{ flexShrink: 0 }}>
        <MaterialIcons name={item.icon} size={22} color={item.iconTint} />
      </View>
      <View className="ml-3 flex-1" style={{ minWidth: 0 }}>
        <View className="flex-row items-center">
          <Text
            className="text-sm font-semibold text-black dark:text-white"
            numberOfLines={1}
            style={{ flexShrink: 1, flexGrow: 0 }}
          >
            {t(item.titleKey)}
          </Text>
          {item.badgeKey ? (
            <View className="ml-2 rounded-md bg-red-500 px-1.5 py-0.5" style={{ flexShrink: 0 }}>
              <Text className="text-[10px] font-bold text-white">{t(item.badgeKey)}</Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={2}>
          {t(item.descKey)}
        </Text>
      </View>
      <View
        className={`ml-3 flex-row items-center rounded-xl px-3 py-2 ${affordable ? '' : 'opacity-50'}`}
        style={{ backgroundColor: affordable ? BRAND_GREEN : '#d1d5db', flexShrink: 0 }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <MaterialIcons name="monetization-on" size={14} color={affordable ? '#fff' : '#6b7280'} />
            <Text
              className={`ml-1 text-sm font-bold ${affordable ? 'text-white' : 'text-gray-500'}`}
            >
              {item.price}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function EarnRow({ icon, text }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; text: string }) {
  return (
    <View className="flex-row items-center">
      <MaterialIcons name={icon} size={14} color="#6b7280" />
      <Text className="ml-2 text-xs text-gray-600 dark:text-gray-400" style={{ lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  );
}
