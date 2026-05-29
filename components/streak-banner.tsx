import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { StreakInfo } from '@src/services/streakService';

const ACCENT = '#2EC4A5';
const ACCENT_DEEP = '#1E9E84';
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

  if (!streak) return null;

  // All states share the warm accent-soft tint; state is conveyed by inner
  // content (fire icon, copy, "today done" badge) rather than container color.
  const done = streak.current > 0 && streak.todayDone;
  const noStreak = streak.current <= 0;

  return (
    <View className="mt-4 flex-row items-center rounded-2xl bg-accent-soft px-4 py-4 dark:bg-accent-soft-dark">
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: ACCENT + '26' }}
      >
        <MaterialIcons
          name="local-fire-department"
          size={24}
          color={noStreak ? '#A79E90' : ACCENT_DEEP}
        />
      </View>
      <View className="ml-3 flex-1">
        {noStreak ? (
          <>
            <Text className="text-sm font-bold text-ink dark:text-ink-dark">
              {t('streak.start_title')}
            </Text>
            <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
              {t('streak.start_hint')}
            </Text>
          </>
        ) : (
          <>
            <View className="flex-row items-center">
              <Text className="text-base font-extrabold text-accent-deep dark:text-accent">
                {t('streak.days', { count: streak.current })}
              </Text>
              {done ? (
                <View
                  className="ml-2 flex-row items-center rounded-full px-2 py-0.5"
                  style={{ backgroundColor: ACCENT }}
                >
                  <MaterialIcons name="check" size={10} color="#fff" />
                  <Text className="ml-0.5 text-[10px] font-bold text-white">
                    {t('streak.today_done_badge')}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
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
                color={active ? '#E0654F' : '#A79E90'}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
