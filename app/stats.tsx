import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Card } from '@/components/ui/card';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { haptic } from '@src/services/hapticService';
import {
  getCachedDashboard,
  refreshDashboard,
  subscribeDashboard,
} from '@src/services/dashboardCache';
import {
  getTodayStreakDate,
  type StreakInfo,
} from '@src/services/streakService';
import { getLevel, getTotalXP, subscribeXP } from '@src/services/xpService';
import { getStatsSnapshot, type StatsSnapshot } from '@src/services/statsService';
import { findLanguage } from '@src/constants/languages';

const STAGE_COLORS = {
  new: '#A79E90',
  learning: '#F59E0B',
  reviewing: '#3B82F6',
  mastered: '#2EC4A5',
} as const;

type Stage = keyof typeof STAGE_COLORS;

export default function StatsScreen() {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';

  const initial = getCachedDashboard();
  const [streak, setStreak] = useState<StreakInfo | null>(initial?.streak ?? null);
  const [studiedDates, setStudiedDates] = useState<Set<string>>(initial?.studiedDates ?? new Set());
  const [frozenDates, setFrozenDates] = useState<Set<string>>(initial?.frozenDates ?? new Set());
  const [totalXP, setTotalXP] = useState<number>(getTotalXP());
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    return subscribeDashboard((snap) => {
      setStreak(snap.streak);
      setStudiedDates(snap.studiedDates);
      setFrozenDates(snap.frozenDates);
    });
  }, []);

  useEffect(() => subscribeXP(setTotalXP), []);

  const reloadStats = useCallback(async () => {
    try {
      setStats(await getStatsSnapshot());
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([refreshDashboard(), reloadStats()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadStats]);

  const onRefresh = useCallback(async () => {
    haptic.tap();
    setRefreshing(true);
    try {
      await Promise.all([refreshDashboard(), reloadStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [reloadStats]);

  const levelInfo = getLevel(totalXP);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <ActivityIndicator color="#2EC4A5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <TabletContainer>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2EC4A5"
              colors={['#2EC4A5']}
            />
          }
        >
          <View className="h-11 flex-row items-center mb-4">
            <Pressable
              onPress={() => { haptic.tap(); router.back(); }}
              className="mr-2 p-1"
              accessibilityLabel={t('common.back')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
            </Pressable>
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">
              {t('stats.title')}
            </Text>
          </View>

          {/* Top headline chips: streak + level. Visible above the fold so
              the page opens with something motivating before the bigger
              widgets render. */}
          <View className="flex-row gap-3">
            <HeadlineChip
              icon="🔥"
              value={String(streak?.current ?? 0)}
              label={t('stats.streak_label')}
              dark={dark}
            />
            <HeadlineChip
              icon="⭐"
              value={`Lv ${levelInfo.level}`}
              label={`${totalXP.toLocaleString()} XP`}
              dark={dark}
            />
          </View>

          {/* Year heatmap — last 52 weeks, GitHub-style. */}
          <Card className="mt-5 p-5">
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
              {t('stats.heatmap_title')}
            </Text>
            <Text className="mt-1 text-xs text-muted">
              {t('stats.heatmap_subtitle')}
            </Text>
            <YearHeatmap studiedDates={studiedDates} frozenDates={frozenDates} dark={dark} lang={i18n.language || 'en'} />
          </Card>

          {/* SRS mastery distribution. */}
          {stats && stats.srs.total > 0 ? (
            <Card className="mt-5 p-5">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                {t('stats.mastery_title')}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {t('stats.total_cards', { count: stats.srs.total })}
              </Text>
              <MasteryDetail dist={stats.srs} dark={dark} t={t} />
            </Card>
          ) : null}

          {/* Per-language breakdown. */}
          {stats && stats.byLanguage.length > 0 ? (
            <Card className="mt-5 p-5">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                {t('stats.languages_title')}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {t('stats.languages_subtitle')}
              </Text>
              <LanguageBreakdown rows={stats.byLanguage} t={t} dark={dark} />
            </Card>
          ) : null}

          {/* Empty state: brand-new user with no cards yet. */}
          {stats && stats.srs.total === 0 ? (
            <View className="mt-12 items-center px-8">
              <MaterialIcons name="insights" size={48} color="#A79E90" />
              <Text className="mt-3 text-center text-base font-semibold text-ink dark:text-ink-dark">
                {t('stats.empty_title')}
              </Text>
              <Text className="mt-1 text-center text-sm text-muted">
                {t('stats.empty_subtitle')}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </TabletContainer>
    </SafeAreaView>
  );
}

function HeadlineChip({
  icon,
  value,
  label,
  dark,
}: {
  icon: string;
  value: string;
  label: string;
  dark: boolean;
}) {
  return (
    <View
      className="flex-1 rounded-2xl border border-line p-4 dark:border-line-dark"
      style={{ backgroundColor: dark ? '#1E1B15' : '#FCFBF7' }}
    >
      <Text className="text-2xl">{icon}</Text>
      <Text className="mt-1 text-xl font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * Last 52 weeks of study activity rendered as a GitHub-style cell grid.
 *
 * Column = week (oldest left, current week right), row = weekday (Sun…Sat).
 * Each cell is mint when studied, mint-ring on today, red border on a
 * frozen day. Future cells render empty so the rightmost column looks
 * partial until the week is over.
 */
function YearHeatmap({
  studiedDates,
  frozenDates,
  dark,
  lang,
}: {
  studiedDates: Set<string>;
  frozenDates: Set<string>;
  dark: boolean;
  lang: string;
}) {
  const today = getTodayStreakDate();
  const todayDate = new Date(`${today}T00:00:00`);

  // Anchor the rightmost column to the current week (Sun…Sat). We render
  // 52 columns counting back from the most recent Saturday so the layout
  // is stable even when "today" is mid-week (right column shows partial
  // current week with future cells blank).
  const grid = useMemo(() => {
    const COLS = 52;
    const cells: { dateStr: string | null; studied: boolean; frozen: boolean; isToday: boolean; isFuture: boolean }[] = [];
    // Find the Saturday on or after today (anchor for the current column).
    const anchor = new Date(todayDate);
    anchor.setDate(anchor.getDate() + (6 - anchor.getDay()));
    for (let col = COLS - 1; col >= 0; col--) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(anchor);
        // Subtract weeks for older columns, then offset back to Sunday-row.
        d.setDate(anchor.getDate() - col * 7 - (6 - row));
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dd}`;
        const isFuture = d.getTime() > todayDate.getTime();
        cells.push({
          dateStr: isFuture ? null : dateStr,
          studied: !isFuture && studiedDates.has(dateStr),
          frozen: !isFuture && frozenDates.has(dateStr),
          isToday: dateStr === today,
          isFuture,
        });
      }
    }
    return cells;
  }, [studiedDates, frozenDates, today, todayDate]);

  // Compute month labels: print the localized short-month name above the
  // first column whose first row falls in a new month.
  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let prevMonth = -1;
    for (let col = 0; col < 52; col++) {
      // Row 0 = Sunday of that week
      const cellIdx = col * 7;
      const dateStr = grid[cellIdx]?.dateStr;
      if (!dateStr) continue;
      const m = Number(dateStr.slice(5, 7)) - 1;
      if (m !== prevMonth) {
        prevMonth = m;
        const d = new Date(`${dateStr}T00:00:00`);
        labels.push({ col, label: d.toLocaleDateString(lang, { month: 'short' }) });
      }
    }
    return labels;
  }, [grid, lang]);

  const cellBg = dark ? '#2A261E' : '#ECE6DA';
  const studiedBg = '#2EC4A5';
  const frozenBorder = '#EF4444';
  const todayBorder = studiedBg;

  // Land at the rightmost column on first mount so "today" is visible
  // without the user having to scroll. onContentSizeChange fires once the
  // grid has measured its width — scrolling earlier (in useEffect) races
  // the layout pass and snaps back to 0.
  const scrollRef = useRef<ScrollView>(null);
  const didInitialScrollRef = useRef(false);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-3"
      contentContainerStyle={{ paddingRight: 4 }}
      onContentSizeChange={() => {
        if (!didInitialScrollRef.current) {
          scrollRef.current?.scrollToEnd({ animated: false });
          didInitialScrollRef.current = true;
        }
      }}
    >
      <View>
        {/* Month label row */}
        <View className="mb-1 flex-row" style={{ height: 14 }}>
          {Array.from({ length: 52 }, (_, col) => {
            const label = monthLabels.find((l) => l.col === col)?.label;
            return (
              <View key={col} style={{ width: 14, marginRight: 2 }}>
                {label ? (
                  <Text className="text-[10px] text-faint">{label}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* 7 rows × 52 cols */}
        {Array.from({ length: 7 }, (_, row) => (
          <View key={row} className="flex-row" style={{ marginBottom: 2 }}>
            {Array.from({ length: 52 }, (_, col) => {
              const cell = grid[col * 7 + row];
              const filled = cell?.studied;
              const hasBorder = cell?.isToday || cell?.frozen;
              const borderColor = cell?.isToday ? todayBorder : cell?.frozen ? frozenBorder : 'transparent';
              return (
                <View
                  key={col}
                  style={{
                    width: 14,
                    height: 14,
                    marginRight: 2,
                    backgroundColor: cell?.isFuture ? 'transparent' : filled ? studiedBg : cellBg,
                    borderRadius: 3,
                    borderWidth: hasBorder ? 1.5 : 0,
                    borderColor,
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MasteryDetail({
  dist,
  dark,
  t,
}: {
  dist: { new: number; learning: number; reviewing: number; mastered: number; total: number };
  dark: boolean;
  t: (k: string, opts?: { count?: number }) => string;
}) {
  const segments: { key: Stage; count: number }[] = [
    { key: 'mastered', count: dist.mastered },
    { key: 'reviewing', count: dist.reviewing },
    { key: 'learning', count: dist.learning },
    { key: 'new', count: dist.new },
  ];
  return (
    <View className="mt-3">
      <View
        className="h-3 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: dark ? '#2A261E' : '#ECE6DA', flexDirection: 'row' }}
      >
        {segments.map((s) =>
          s.count > 0 ? (
            <View
              key={s.key}
              style={{ flex: s.count, backgroundColor: STAGE_COLORS[s.key] }}
            />
          ) : null,
        )}
      </View>
      <View className="mt-3">
        {segments.map((s) => {
          const pct = dist.total > 0 ? Math.round((s.count / dist.total) * 100) : 0;
          return (
            <View key={s.key} className="mt-2 flex-row items-center">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[s.key] }} />
              <Text className="ml-2 flex-1 text-sm text-ink dark:text-ink-dark">
                {t(`stats.stage_${s.key}` as const)}
              </Text>
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                {s.count.toLocaleString()}
              </Text>
              <Text className="ml-2 w-10 text-right text-xs text-muted">
                {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LanguageBreakdown({
  rows,
  t,
  dark,
}: {
  rows: { lang: string; wordCount: number }[];
  t: (k: string) => string;
  dark: boolean;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.wordCount), 0);
  if (max <= 0) return null;
  return (
    <View className="mt-3">
      {rows.map((r) => {
        const meta = findLanguage(r.lang);
        const label = meta?.nativeName ?? t(`languages.${r.lang}`) ?? r.lang;
        const pct = r.wordCount / max;
        return (
          <View key={r.lang} className="mt-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-ink dark:text-ink-dark" numberOfLines={1}>
                {label}
              </Text>
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                {r.wordCount.toLocaleString()}
              </Text>
            </View>
            <View
              className="mt-1 h-2 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: dark ? '#2A261E' : '#ECE6DA' }}
            >
              <View
                className="h-2 rounded-full bg-[#2EC4A5]"
                style={{ width: `${Math.max(2, Math.round(pct * 100))}%` }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
