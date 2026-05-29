import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { router } from 'expo-router';

import { Confetti } from '@/components/confetti';
import { Card } from '@/components/ui/card';
import { usePremium } from '@src/hooks/usePremium';
import { haptic } from '@src/services/hapticService';
import { getDailyEmoji, type CelebrateInfo } from '@src/services/streakMilestone';
import {
  requestNotificationPermission,
  rescheduleNotifications,
  getNotificationTranslations,
} from '@src/services/notificationService';

function CountUpText({ to, delay = 500, duration = 800, color }: { to: number; delay?: number; duration?: number; color: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (to === 0) { setDisplay(0); return; }
    let interval: ReturnType<typeof setInterval>;
    const timeout = setTimeout(() => {
      const start = Date.now();
      interval = setInterval(() => {
        const progress = Math.min((Date.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(eased * to));
        if (progress >= 1) clearInterval(interval);
      }, 16);
    }, delay);
    return () => { clearTimeout(timeout); if (interval) clearInterval(interval); };
  }, [to, delay, duration]);
  return <Text className="text-2xl font-bold" style={{ color }}>{display}</Text>;
}

interface Props {
  stats: { total: number; gotIt: number; uncertain: number; stillLearning: number };
  completeCelebrate: CelebrateInfo | null;
  showNotifPrompt: boolean;
  setShowNotifPrompt: (v: boolean) => void;
  limitRemaining: number;
  goBackToPicker: () => void;
}

export function ReviewComplete({
  stats,
  completeCelebrate,
  showNotifPrompt,
  setShowNotifPrompt,
  limitRemaining,
  goBackToPicker,
}: Props) {
  const { t } = useTranslation();
  const premium = usePremium();

  const celebrationScale = useSharedValue(0);
  useEffect(() => {
    haptic.success();
    celebrationScale.value = 0;
    celebrationScale.value = withDelay(100, withSpring(1, { damping: 8, stiffness: 120 }));
  }, []);
  const celebrationAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
  }));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 items-center justify-center bg-canvas px-10 dark:bg-canvas-dark">
      <Confetti />
      <Animated.View style={celebrationAnimStyle}>
        <View className="h-[150px] w-[150px] items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
          <Image
            source={require('../../assets/images/android-icon-foreground.png')}
            style={{ width: 118, height: 118 }}
            resizeMode="contain"
          />
        </View>
      </Animated.View>
      <Text className="mt-5 text-2xl font-extrabold tracking-tight text-ink dark:text-ink-dark">
        {t('review.complete')}
      </Text>
      <Text className="mt-2 text-center text-sm text-muted">
        {t('review.complete_summary', { count: stats.total })}
      </Text>

      {/* Stats — 3 columns split by hairlines */}
      <Card className="mt-5 w-full flex-row items-center p-4">
        <View className="flex-1 items-center">
          <MaterialIcons name="check" size={22} color="#2EC4A5" />
          <CountUpText to={stats.gotIt} color="#2EC4A5" />
        </View>
        <View className="h-10 w-px bg-line dark:bg-line-dark" />
        <View className="flex-1 items-center">
          <MaterialIcons name="remove" size={22} color="#D9A441" />
          <CountUpText to={stats.uncertain} color="#D9A441" />
        </View>
        <View className="h-10 w-px bg-line dark:bg-line-dark" />
        <View className="flex-1 items-center">
          <MaterialIcons name="close" size={22} color="#E0654F" />
          <CountUpText to={stats.stillLearning} color="#E0654F" />
        </View>
      </Card>

      {completeCelebrate ? (
        <View className="mt-6 w-full rounded-2xl bg-accent-soft p-5 dark:bg-accent-soft-dark">
          <Text className="text-center text-3xl">
            {completeCelebrate.type === 'milestone' ? '🔥' : getDailyEmoji(completeCelebrate.variant)}
          </Text>
          <Text className="mt-2 text-center text-lg font-bold text-accent-deep dark:text-accent">
            {completeCelebrate.type === 'milestone'
              ? t('streak.milestone_title')
              : t(`streak.daily_title_${completeCelebrate.variant + 1}`)}
          </Text>
          <Text className="mt-1 text-center text-2xl font-black" style={{ color: completeCelebrate.type === 'milestone' ? '#D9A441' : '#2EC4A5' }}>
            {completeCelebrate.streak}{t('streak.milestone_days')}
          </Text>
          <Text className="mt-2 text-center text-xs text-muted">
            {completeCelebrate.type === 'milestone'
              ? t('streak.milestone_reward')
              : t(`streak.daily_message_${completeCelebrate.variant + 1}`)}
          </Text>
        </View>
      ) : null}

      {showNotifPrompt ? (
        <View className="mt-8 w-full rounded-2xl border border-line p-5 dark:border-line-dark">
          <Text className="text-center text-base font-bold text-ink dark:text-ink-dark">
            {t('review.notif_prompt_title')}
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            {t('review.notif_prompt_message')}
          </Text>
          <Pressable
            onPress={async () => {
              const granted = await requestNotificationPermission();
              if (granted) {
                await rescheduleNotifications(getNotificationTranslations(t));
              }
              setShowNotifPrompt(false);
            }}
            className="mt-4 items-center rounded-xl bg-accent py-3"
          >
            <Text className="text-base font-bold text-white">
              {t('review.notif_prompt_yes')}
            </Text>
          </Pressable>
          <Pressable onPress={() => setShowNotifPrompt(false)} className="mt-2 items-center py-2">
            <Text className="text-sm text-faint">{t('review.notif_prompt_no')}</Text>
          </Pressable>
        </View>
      ) : null}

      {!premium && limitRemaining <= 0 ? (
        <Pressable
          onPress={() => router.push('/subscription')}
          className="mt-6 w-full flex-row items-center rounded-2xl border border-accent bg-accent-soft px-5 py-4 dark:bg-accent-soft-dark"
        >
          <MaterialIcons name="star" size={20} color="#D9A441" />
          <Text className="ml-3 flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
            {t('review_limit.premium')}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color="#A79E90" />
        </Pressable>
      ) : null}

      <Pressable onPress={goBackToPicker} className="mt-8 items-center rounded-xl bg-accent px-8 py-4">
        <Text className="text-base font-bold text-white">{t('review.back_to_list')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
