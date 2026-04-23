import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Confetti } from '@/components/confetti';
import { Paywall } from '@/components/paywall';
import { usePremium } from '@src/hooks/usePremium';
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
  paywallVisible: boolean;
  setPaywallVisible: (v: boolean) => void;
}

export function ReviewComplete({
  stats,
  completeCelebrate,
  showNotifPrompt,
  setShowNotifPrompt,
  limitRemaining,
  goBackToPicker,
  paywallVisible,
  setPaywallVisible,
}: Props) {
  const { t } = useTranslation();
  const premium = usePremium();

  const celebrationEmojiRef = useRef('🎉');
  const celebrationScale = useSharedValue(0);
  useEffect(() => {
    const emojis = ['🎉', '🏆', '⭐'];
    celebrationEmojiRef.current = emojis[Math.floor(Math.random() * emojis.length)];
    celebrationScale.value = 0;
    celebrationScale.value = withDelay(100, withSpring(1, { damping: 8, stiffness: 120 }));
  }, []);
  const celebrationAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
  }));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 items-center justify-center bg-white px-10 dark:bg-black">
      <Confetti />
      <Animated.Text style={[{ fontSize: 48 }, celebrationAnimStyle]}>
        {celebrationEmojiRef.current}
      </Animated.Text>
      <Text className="mt-4 text-xl font-bold text-black dark:text-white">
        {t('review.complete')}
      </Text>
      <Text className="mt-2 text-center text-sm text-gray-500">
        {t('review.complete_summary', { count: stats.total })}
      </Text>
      <View className="mt-4 flex-row gap-6">
        <View className="items-center">
          <MaterialIcons name="check" size={24} color="#2EC4A5" />
          <CountUpText to={stats.gotIt + stats.uncertain} color="#2EC4A5" />
        </View>
        <View className="items-center">
          <MaterialIcons name="close" size={24} color="#ef4444" />
          <CountUpText to={stats.stillLearning} color="#ef4444" />
        </View>
      </View>

      {completeCelebrate ? (
        <View className="mt-6 w-full rounded-2xl bg-amber-50 p-5 dark:bg-amber-950">
          <Text className="text-center text-3xl">
            {completeCelebrate.type === 'milestone' ? '🔥' : getDailyEmoji(completeCelebrate.variant)}
          </Text>
          <Text className="mt-2 text-center text-lg font-bold text-amber-800 dark:text-amber-200">
            {completeCelebrate.type === 'milestone'
              ? t('streak.milestone_title')
              : t(`streak.daily_title_${completeCelebrate.variant + 1}`)}
          </Text>
          <Text className="mt-1 text-center text-2xl font-black" style={{ color: completeCelebrate.type === 'milestone' ? '#f59e0b' : '#2EC4A5' }}>
            {completeCelebrate.streak}{t('streak.milestone_days')}
          </Text>
          <Text className="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
            {completeCelebrate.type === 'milestone'
              ? t('streak.milestone_ad_free')
              : t(`streak.daily_message_${completeCelebrate.variant + 1}`)}
          </Text>
        </View>
      ) : null}

      {showNotifPrompt ? (
        <View className="mt-8 w-full rounded-2xl border border-gray-200 p-5 dark:border-gray-700">
          <Text className="text-center text-base font-semibold text-black dark:text-white">
            {t('review.notif_prompt_title')}
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-500">
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
            className="mt-4 items-center rounded-xl bg-black py-3 dark:bg-white"
          >
            <Text className="text-base font-semibold text-white dark:text-black">
              {t('review.notif_prompt_yes')}
            </Text>
          </Pressable>
          <Pressable onPress={() => setShowNotifPrompt(false)} className="mt-2 items-center py-2">
            <Text className="text-sm text-gray-400">{t('review.notif_prompt_no')}</Text>
          </Pressable>
        </View>
      ) : null}

      {!premium && limitRemaining <= 0 ? (
        <Pressable
          onPress={() => setPaywallVisible(true)}
          className="mt-6 w-full flex-row items-center rounded-2xl border border-gray-200 px-5 py-4 dark:border-gray-700"
        >
          <MaterialIcons name="star" size={20} color="#f59e0b" />
          <Text className="ml-3 flex-1 text-sm font-medium text-black dark:text-white">
            {t('review_limit.premium')}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color="#9ca3af" />
        </Pressable>
      ) : null}

      <Pressable onPress={goBackToPicker} className="mt-8 items-center rounded-xl bg-black px-8 py-4 dark:bg-white">
        <Text className="text-base font-semibold text-white dark:text-black">{t('review.back_to_list')}</Text>
      </Pressable>

      <Paywall visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </SafeAreaView>
  );
}
