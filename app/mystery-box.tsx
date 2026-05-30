import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppModal } from '@/components/app-modal';
import { Card } from '@/components/ui/card';
import { ProfileBackground } from '@/components/profile-background';
import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';
import {
  CAPSULE_COST,
  DUPLICATE_REFUND,
  PITY_THRESHOLD,
  RARITY_PERCENT,
  buyDirect,
  equipCosmetic,
  fetchCatalog,
  getMysteryBoxState,
  isOwned,
  openCapsule,
  refreshMysteryBoxState,
  subscribeMysteryBox,
  type CapsuleResult,
  type MysteryBoxItem,
  type MysteryBoxRarity,
  type MysteryBoxState,
  MysteryBoxError,
} from '@src/services/mysteryBoxService';
import {
  getInventory,
  refreshInventory,
  subscribeInventory,
  type InventorySnapshot,
} from '@src/services/pointsService';
import { haptic } from '@src/services/hapticService';

const RARITY_TINT: Record<MysteryBoxRarity, string> = {
  common: '#7B7366',
  rare: '#5B8DEF',
  epic: '#D9A441',
};
const RARITY_BG: Record<MysteryBoxRarity, string> = {
  common: 'rgba(123,115,102,0.10)',
  rare: 'rgba(91,141,239,0.14)',
  epic: 'rgba(217,164,65,0.16)',
};

export default function MysteryBoxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [snap, setSnap] = useState<InventorySnapshot>(getInventory());
  const [state, setState] = useState<MysteryBoxState>(getMysteryBoxState());
  const [catalog, setCatalog] = useState<MysteryBoxItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<'capsule' | string | null>(null);
  const [resultModal, setResultModal] = useState<CapsuleResult | null>(null);

  useEffect(() => subscribeInventory(setSnap), []);
  useEffect(() => subscribeMysteryBox(setState), []);
  useFocusEffect(useCallback(() => {
    Promise.all([refreshInventory(), refreshMysteryBoxState(), fetchCatalog(true)])
      .then(([, , cat]) => setCatalog(cat))
      .catch(() => {});
  }, []));

  const points = snap.points;
  const canAfford = points >= CAPSULE_COST;
  const pityCount = state.pityCount;
  const pityNext = Math.min(pityCount + 1, PITY_THRESHOLD);

  // Mystery box is character-only — backgrounds are free and live in the
  // BackgroundPicker (see profile.tsx). Filter the shared catalog table.
  const characters = useMemo(() => catalog.filter((c) => c.kind === 'character'), [catalog]);

  const grouped = useMemo(() => {
    const out: Record<MysteryBoxRarity, MysteryBoxItem[]> = { epic: [], rare: [], common: [] };
    for (const item of characters) out[item.rarity].push(item);
    return out;
  }, [characters]);

  const ownedCharacterCount = useMemo(
    () => characters.filter((c) => state.ownedItemIds.has(c.id)).length,
    [characters, state.ownedItemIds],
  );
  const totalCount = characters.length;

  const handleOpenCapsule = async () => {
    if (busy) return;
    if (!canAfford) {
      setToast(t('store.insufficient_points'));
      return;
    }
    setBusy('capsule');
    try {
      const result = await openCapsule();
      haptic.success();
      setResultModal(result);
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(null);
    }
  };

  const handleDirectBuy = async (item: MysteryBoxItem) => {
    if (busy) return;
    if (isOwned(item.id)) return;
    if (points < item.directPrice) {
      setToast(t('store.insufficient_points'));
      return;
    }
    setBusy(item.id);
    try {
      const r = await buyDirect(item.id);
      if (r.alreadyOwned) {
        setToast(t('mystery_box.already_owned'));
      } else {
        haptic.success();
        setToast(t('mystery_box.purchase_success'));
      }
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(null);
    }
  };

  const handleEquip = async (item: MysteryBoxItem) => {
    if (busy) return;
    const equippedField = item.kind === 'character'
      ? state.equippedCharacterId
      : state.equippedBackgroundId;
    const nextId = equippedField === item.id ? null : item.id;
    setBusy(item.id);
    try {
      await equipCosmetic(item.kind, nextId);
      haptic.success();
      setToast(nextId
        ? t('mystery_box.equipped_toast')
        : t('mystery_box.unequipped_toast'));
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(null);
    }
  };

  const handleErr = (e: unknown) => {
    if (e instanceof MysteryBoxError) {
      if (e.code === 'insufficient_points') setToast(t('store.insufficient_points'));
      else if (e.code === 'anonymous_disallowed') setToast(t('mystery_box.anon_disallowed'));
      else if (e.code === 'catalog_empty') setToast(t('mystery_box.catalog_empty'));
      else setToast(t('store.purchase_failed'));
    } else {
      setToast(t('store.purchase_failed'));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28 }}>
        {/* App bar */}
        <View className="mb-4 h-11 flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>
          <Text className="text-base font-semibold text-ink dark:text-ink-dark flex-1">
            {t('mystery_box.title')}
          </Text>
          <Pressable
            onPress={() => router.push('/probability-policy' as never)}
            className="flex-row items-center gap-1 px-2 py-1"
            accessibilityRole="button"
          >
            <MaterialIcons name="info-outline" size={16} color="#7B7366" />
            <Text className="text-xs font-semibold text-muted">{t('mystery_box.probability_link')}</Text>
          </Pressable>
        </View>

        {/* Hero: balance + collection */}
        <View className="rounded-[20px] border border-accent bg-accent-soft p-5 dark:bg-accent-soft-dark">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">
                {t('store.balance')}
              </Text>
              <View className="mt-1 flex-row items-baseline">
                <Text className="text-[34px] font-extrabold tracking-tight text-ink dark:text-ink-dark" style={{ lineHeight: 40 }}>
                  {points.toLocaleString()}
                </Text>
                <Text className="ml-1 text-base font-semibold text-accent-deep">{t('store.points_unit')}</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">
                {t('mystery_box.collection')}
              </Text>
              <Text className="mt-1 text-2xl font-extrabold text-ink dark:text-ink-dark">
                {ownedCharacterCount} / {totalCount}
              </Text>
            </View>
          </View>
        </View>

        {/* Capsule CTA */}
        <Card className="mt-4 p-5">
          <View className="flex-row items-start">
            <View
              className="h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: RARITY_BG.epic }}
            >
              <MaterialIcons name="card-giftcard" size={36} color={RARITY_TINT.epic} />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-base font-bold text-ink dark:text-ink-dark">
                {t('mystery_box.capsule_title')}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {t('mystery_box.capsule_desc', { dupRefund: DUPLICATE_REFUND })}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleOpenCapsule}
            disabled={busy === 'capsule' || !canAfford || totalCount === 0}
            className="mt-4 h-11 flex-row items-center justify-center rounded-xl bg-accent active:opacity-80"
            style={{ opacity: canAfford && busy !== 'capsule' && totalCount > 0 ? 1 : 0.55 }}
            accessibilityRole="button"
          >
            {busy === 'capsule' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="monetization-on" size={18} color="#fff" />
                <Text className="ml-1.5 text-sm font-bold text-white">
                  {t('mystery_box.open_for', { cost: CAPSULE_COST })}
                </Text>
              </>
            )}
          </Pressable>

          {/* Pity progress */}
          <View className="mt-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">
                {t('mystery_box.pity_label')}
              </Text>
              <Text className="text-[11px] font-bold" style={{ color: RARITY_TINT.epic }}>
                {pityNext === PITY_THRESHOLD
                  ? t('mystery_box.pity_guaranteed')
                  : `${pityCount} / ${PITY_THRESHOLD}`}
              </Text>
            </View>
            <View className="mt-2 h-2 overflow-hidden rounded-full bg-line dark:bg-line-dark">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (pityCount / PITY_THRESHOLD) * 100)}%`,
                  backgroundColor: RARITY_TINT.epic,
                }}
              />
            </View>
            <Text className="mt-2 text-[11px] text-muted">
              {t('mystery_box.pity_explain', { threshold: PITY_THRESHOLD })}
            </Text>
          </View>
        </Card>

        {/* Empty catalog state — characters not yet released */}
        {totalCount === 0 ? (
          <View className="mt-6 items-center rounded-[16px] border border-dashed border-line bg-clay p-6 dark:border-line-dark dark:bg-clay-dark">
            <MaterialIcons name="hourglass-empty" size={28} color="#A79E90" />
            <Text className="mt-2 text-sm font-semibold text-ink dark:text-ink-dark">
              {t('mystery_box.coming_soon_title')}
            </Text>
            <Text className="mt-1 text-center text-xs text-muted">
              {t('mystery_box.coming_soon_message')}
            </Text>
          </View>
        ) : null}

        {/* Catalog by rarity */}
        {(['epic', 'rare', 'common'] as MysteryBoxRarity[]).map((rarity) =>
          grouped[rarity].length === 0 ? null : (
            <View key={rarity}>
              <RaritySectionLabel rarity={rarity} t={t} />
              <View className="flex-row flex-wrap gap-2.5">
                {grouped[rarity].map((item) => {
                  const equipped = item.kind === 'character'
                    ? state.equippedCharacterId === item.id
                    : state.equippedBackgroundId === item.id;
                  return (
                    <ItemTile
                      key={item.id}
                      item={item}
                      owned={state.ownedItemIds.has(item.id)}
                      equipped={equipped}
                      affordable={points >= item.directPrice}
                      busy={busy === item.id}
                      onBuy={() => handleDirectBuy(item)}
                      onEquip={() => handleEquip(item)}
                    />
                  );
                })}
              </View>
            </View>
          ),
        )}

        {/* How it works */}
        <View className="mt-6 rounded-[16px] bg-clay p-[18px] dark:bg-clay-dark">
          <View className="flex-row items-center gap-1.5">
            <MaterialIcons name="lightbulb-outline" size={14} color="#7B7366" />
            <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {t('mystery_box.how_it_works_title')}
            </Text>
          </View>
          <View className="mt-3 gap-2">
            <HowRow text={t('mystery_box.how_random', { cost: CAPSULE_COST })} />
            <HowRow text={t('mystery_box.how_direct')} />
            <HowRow text={t('mystery_box.how_duplicate', { refund: DUPLICATE_REFUND })} />
            <HowRow text={t('mystery_box.how_pity', { threshold: PITY_THRESHOLD })} />
          </View>
        </View>
      </ScrollView>
      </TabletContainer>

      {/* Result modal */}
      <AppModal
        visible={!!resultModal}
        title={
          resultModal?.pityTriggered
            ? t('mystery_box.result_pity_title')
            : resultModal?.wasDuplicate
            ? t('mystery_box.result_duplicate_title')
            : t('mystery_box.result_title')
        }
        message={
          resultModal
            ? buildResultMessage(resultModal, catalog, t)
            : ''
        }
        buttonText={t('common.done')}
        onClose={() => setResultModal(null)}
      />

      <Toast
        visible={!!toast}
        message={toast ?? ''}
        type="success"
        onHide={() => setToast(null)}
        style={{ position: 'absolute', bottom: insets.bottom + 32, left: 0, right: 0 }}
      />
    </SafeAreaView>
  );
}

function buildResultMessage(
  r: CapsuleResult,
  catalog: MysteryBoxItem[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const item = catalog.find((c) => c.id === r.itemId);
  const rarityLabel = t(`mystery_box.rarity.${r.rarity}`);
  const itemLabel = item ? t(`mystery_box.items.${item.id}`, { defaultValue: item.id }) : r.itemId;
  if (r.wasDuplicate) {
    return t('mystery_box.result_duplicate_message', {
      rarity: rarityLabel,
      item: itemLabel,
      refund: r.refund,
    });
  }
  return t('mystery_box.result_message', { rarity: rarityLabel, item: itemLabel });
}

function RaritySectionLabel({ rarity, t }: { rarity: MysteryBoxRarity; t: any }) {
  return (
    <View className="mb-2.5 mt-6 flex-row items-center gap-2">
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RARITY_TINT[rarity] }} />
      <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: RARITY_TINT[rarity] }}>
        {t(`mystery_box.rarity.${rarity}`)} · {RARITY_PERCENT[rarity]}%
      </Text>
    </View>
  );
}

function ItemTile({
  item,
  owned,
  equipped,
  affordable,
  busy,
  onBuy,
  onEquip,
}: {
  item: MysteryBoxItem;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
  busy: boolean;
  onBuy: () => void;
  onEquip: () => void;
}) {
  const { t } = useTranslation();
  const tint = RARITY_TINT[item.rarity];
  const isCharacter = item.kind === 'character';
  return (
    <Card style={{ width: '48%', padding: 12, opacity: busy ? 0.6 : 1 }}>
      <View className="relative mb-2 h-20 w-full overflow-hidden rounded-xl">
        {isCharacter ? (
          <View className="flex-1 items-center justify-center bg-clay">
            <MaterialIcons name="face" size={40} color="#A79E90" />
          </View>
        ) : (
          <ProfileBackground item={item} className="flex-1" />
        )}
        {owned ? (
          <View
            className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: tint }}
          >
            <MaterialIcons name="check" size={14} color="#fff" />
          </View>
        ) : null}
      </View>
      <Text
        className="text-[13px] font-bold text-ink dark:text-ink-dark"
        numberOfLines={1}
      >
        {t(`mystery_box.items.${item.id}`, { defaultValue: item.id })}
      </Text>
      <Text className="text-[11px] font-semibold" style={{ color: tint }}>
        {t(`mystery_box.rarity.${item.rarity}`)}
      </Text>
      {owned ? (
        <Pressable
          onPress={onEquip}
          disabled={busy}
          className={`mt-2 h-9 flex-row items-center justify-center rounded-lg ${
            equipped ? 'bg-accent' : 'border border-accent'
          } active:opacity-80`}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={equipped ? '#fff' : '#2EC4A5'} />
          ) : (
            <Text
              className={`text-xs font-bold ${equipped ? 'text-white' : 'text-accent-deep'}`}
            >
              {equipped ? t('mystery_box.equipped') : t('mystery_box.equip_cta')}
            </Text>
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={onBuy}
          disabled={busy || !affordable}
          className="mt-2 h-9 flex-row items-center justify-center rounded-lg bg-accent active:opacity-80"
          style={{ opacity: affordable && !busy ? 1 : 0.55 }}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="monetization-on" size={14} color="#fff" />
              <Text className="ml-1 text-xs font-bold text-white">{item.directPrice}</Text>
            </>
          )}
        </Pressable>
      )}
    </Card>
  );
}

function HowRow({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <MaterialIcons name="circle" size={6} color="#A79E90" style={{ marginTop: 6 }} />
      <Text className="flex-1 text-xs leading-[18px] text-ink dark:text-muted-dark">{text}</Text>
    </View>
  );
}
