import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import type { StreakInfo } from '@src/services/streakService';

const BRAND_GREEN = '#2EC4A5';
const MAX_HEARTS = 2;

/**
 * Compact streak banner used in the wordlist + review tabs.
 *
 * Visual states:
 *   - streak > 0 AND todayDone   → brand green tint + checkmark badge
 *   - streak > 0 AND !todayDone  → amber tint, "today still pending" copy
 *   - streak == 0                → muted neutral, encouragement copy
 *
 * The main count text intentionally drops "학습 중!" because that wording
 * implied today's activity even when the user hasn't studied yet today.
 */
export function StreakBanner({ streak }: { streak: StreakInfo | null }) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';

  if (!streak) return null;

  // All states use the same brand-green border + tint as the settings
  // premium card. State is conveyed by inner content (icon backdrop, copy,
  // "today done" badge) rather than container color.
  const done = streak.current > 0 && streak.todayDone;
  const noStreak = streak.current <= 0;
  const tintBg = done ? '#2EC4A520' : '#2EC4A510';

  return (
    <View
      className="mx-6 mt-4 flex-row items-center rounded-2xl px-4 py-4"
      style={{ backgroundColor: tintBg, borderWidth: 1, borderColor: BRAND_GREEN }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: BRAND_GREEN + '22' }}
      >
        <MaterialIcons
          name="local-fire-department"
          size={22}
          color={noStreak ? (dark ? '#6b7280' : '#9ca3af') : BRAND_GREEN}
        />
      </View>
      <View className="ml-3 flex-1">
        {noStreak ? (
          <>
            <Text className="text-sm font-semibold text-black dark:text-white">
              {t('streak.start_title')}
            </Text>
            <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
              {t('streak.start_hint')}
            </Text>
          </>
        ) : (
          <>
            <View className="flex-row items-center">
              <Text className="text-base font-bold text-black dark:text-white">
                {t('streak.days', { count: streak.current })}
              </Text>
              {done ? (
                <View
                  className="ml-2 flex-row items-center rounded-full px-2 py-0.5"
                  style={{ backgroundColor: BRAND_GREEN }}
                >
                  <MaterialIcons name="check" size={10} color="#fff" />
                  <Text className="ml-0.5 text-[10px] font-bold text-white">
                    {t('streak.today_done_badge')}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
              {done ? t('streak.done_today') : t('streak.not_yet_short')}
            </Text>
          </>
        )}
      </View>
      {!noStreak ? (
        <View className="ml-2 flex-row items-center gap-1">
          {Array.from({ length: MAX_HEARTS }, (_, i) => {
            const active = i < streak.hearts;
            return (
              <MaterialIcons
                key={i}
                name={active ? 'favorite' : 'favorite-border'}
                size={16}
                color={active ? '#ef4444' : dark ? '#4b5563' : '#d1d5db'}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
