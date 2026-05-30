import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Card } from '@/components/ui/card';
import { Toast } from '@/components/toast';
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
  titleKey: string;
  descKey: string;
  price: number;
  badgeKey?: string;
};

const FREEZE_TINT = '#5B8DEF';
const FREEZE_TINT_BG = 'rgba(91,141,239,0.14)';
const BOOST_TINT = '#D9A441';
const BOOST_TINT_BG = 'rgba(217,164,65,0.16)';

const FREEZE_ITEMS: StoreItem[] = [
  { id: 'freeze_1', icon: 'shield', titleKey: 'store.items.freeze_1.title', descKey: 'store.items.freeze_1.desc', price: 50 },
  { id: 'freeze_3', icon: 'shield', titleKey: 'store.items.freeze_3.title', descKey: 'store.items.freeze_3.desc', price: 120, badgeKey: 'store.badge_20_off' },
];

const BOOST_ITEMS: StoreItem[] = [
  { id: 'boost_15', icon: 'flash-on', titleKey: 'store.items.boost_15.title', descKey: 'store.items.boost_15.desc', price: 20 },
  { id: 'boost_60', icon: 'flash-on', titleKey: 'store.items.boost_60.title', descKey: 'store.items.boost_60.desc', price: 60, badgeKey: 'store.badge_25_off' },
];

export default function StoreScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [snap, setSnap] = useState<InventorySnapshot>(getInventory());
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<StoreItemId | null>(null);

  useEffect(() => subscribeInventory(setSnap), []);
  useFocusEffect(useCallback(() => { refreshInventory().catch(() => {}); }, []));

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
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28 }}>
        {/* App bar */}
        <View className="mb-4 h-11 flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button" hitSlop={8}>
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">{t('store.title')}</Text>
        </View>

        {/* Points hero */}
        <View className="rounded-[20px] border border-accent bg-accent-soft p-5 dark:bg-accent-soft-dark">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">
                {t('store.balance')}
              </Text>
              <View className="mt-1 flex-row items-baseline">
                <Text
                  className="text-[40px] font-extrabold tracking-tight text-ink dark:text-ink-dark"
                  style={{ lineHeight: 48 }}
                >
                  {points.toLocaleString()}
                </Text>
                <Text className="ml-1 text-base font-semibold text-accent-deep">
                  {t('store.points_unit')}
                </Text>
              </View>
            </View>
            <MaterialIcons name="monetization-on" size={46} color="#2EC4A5" />
          </View>
          {/* inventory tiles */}
          <View className="mt-4 flex-row gap-2.5">
            <View className="flex-1 rounded-[14px] bg-surface p-3 dark:bg-surface-dark">
              <View className="flex-row items-center gap-1.5">
                <MaterialIcons name="shield" size={16} color={FREEZE_TINT} />
                <Text className="text-xs font-semibold text-muted">{t('store.freeze_count')}</Text>
              </View>
              <Text className="mt-1 text-2xl font-extrabold text-ink dark:text-ink-dark">{freezeCount}</Text>
            </View>
            <View className="flex-1 rounded-[14px] bg-surface p-3 dark:bg-surface-dark">
              <View className="flex-row items-center gap-1.5">
                <MaterialIcons name="flash-on" size={16} color={BOOST_TINT} />
                <Text className="text-xs font-semibold text-muted">{t('store.active_boost')}</Text>
              </View>
              <Text className={`mt-2 text-base font-extrabold ${boostActive ? 'text-warm-amber' : 'text-faint'}`} numberOfLines={1}>
                {boostActive ? t('store.boost_minutes_left', { minutes: minutesLeft }) : t('store.no_active_boost')}
              </Text>
            </View>
          </View>
        </View>

        {/* Streak protection */}
        <SectionLabel icon="shield" tint={FREEZE_TINT} text={t('store.group_streak')} />
        <View className="flex-row gap-3">
          {FREEZE_ITEMS.map((item) => (
            <StoreItemCard key={item.id} item={item} tint={FREEZE_TINT} tintBg={FREEZE_TINT_BG}
              affordable={points >= item.price} busy={busy === item.id} onPress={() => handlePurchase(item)} />
          ))}
        </View>

        {/* XP boost */}
        <SectionLabel icon="flash-on" tint={BOOST_TINT} text={t('store.group_boost')} />
        <View className="flex-row gap-3">
          {BOOST_ITEMS.map((item) => (
            <StoreItemCard key={item.id} item={item} tint={BOOST_TINT} tintBg={BOOST_TINT_BG}
              affordable={points >= item.price} busy={busy === item.id} onPress={() => handlePurchase(item)} />
          ))}
        </View>

        {/* How to earn */}
        <View className="mt-6 rounded-[16px] bg-clay p-[18px] dark:bg-clay-dark">
          <View className="flex-row items-center gap-1.5">
            <MaterialIcons name="info-outline" size={14} color="#7B7366" />
            <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">{t('store.how_to_earn_title')}</Text>
          </View>
          <View className="mt-3 gap-2.5">
            <EarnRow icon="check-circle" text={t('store.earn_session')} />
            <EarnRow icon="favorite" text={t('store.earn_like')} />
            <EarnRow icon="download" text={t('store.earn_download')} />
          </View>
        </View>
      </ScrollView>
      </TabletContainer>

      <Toast visible={!!toast} message={toast ?? ''} type="success" onHide={() => setToast(null)} style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }} />
    </SafeAreaView>
  );
}

function SectionLabel({ icon, tint, text }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; tint: string; text: string }) {
  return (
    <View className="mb-2 mt-6 flex-row items-center gap-1.5">
      <MaterialIcons name={icon} size={14} color={tint} />
      <Text className="text-[11px] font-bold uppercase tracking-wider text-ink dark:text-ink-dark">{text}</Text>
    </View>
  );
}

function StoreItemCard({ item, tint, tintBg, affordable, busy, onPress }: {
  item: StoreItem;
  tint: string;
  tintBg: string;
  affordable: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex-1 p-4" style={{ opacity: affordable ? 1 : 0.55 }}>
      <View className="flex-row items-start justify-between">
        <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: tintBg }}>
          <MaterialIcons name={item.icon} size={22} color={tint} />
        </View>
        {item.badgeKey ? (
          <View className="rounded-md bg-danger-soft px-1.5 py-0.5 dark:bg-danger-soft-dark">
            <Text className="text-[10px] font-bold text-danger">{t(item.badgeKey)}</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-3 text-[15px] font-bold text-ink dark:text-ink-dark">{t(item.titleKey)}</Text>
      <Text className="mt-1 text-xs leading-[18px] text-muted" numberOfLines={2}>{t(item.descKey)}</Text>
      <Pressable
        onPress={onPress}
        disabled={busy}
        className="mt-3 h-10 flex-row items-center justify-center rounded-xl bg-accent active:opacity-80"
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <MaterialIcons name="monetization-on" size={16} color="#fff" />
            <Text className="ml-1 text-sm font-bold text-white">{item.price}</Text>
          </>
        )}
      </Pressable>
    </Card>
  );
}

function EarnRow({ icon, text }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; text: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <MaterialIcons name={icon} size={16} color="#2EC4A5" />
      <Text className="text-sm text-ink dark:text-ink-dark">{text}</Text>
    </View>
  );
}
