/**
 * Word Pearl ("진주 캐기") — re-engages dormant words.
 *
 * Concept: words you haven't touched in 14+ days are "pearls" buried inside
 * shells. Open the shell, see if you still remember the word, mark it. Either
 * answer flows back into the regular SRS schedule so the pearl re-enters
 * normal rotation instead of staying buried.
 *
 * Visuals are intentionally placeholder (emoji 🦪 → 💎). The brand-mark image
 * swap happens later — this file's job is to nail the behavior.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDormantWords, updateReviewResult, type DormantWord } from '@src/db/queries';
import { haptic } from '@src/services/hapticService';
import { markPearlCompletedToday } from '@src/services/pearlDailyService';
import type { WordLookupResult } from '@src/types/word';

const PEARL_BATCH_SIZE = 5;
type Phase = 'closed' | 'opened' | 'judged';

interface ParsedPearl extends DormantWord {
  parsed: WordLookupResult;
}

function parsePearls(rows: DormantWord[]): ParsedPearl[] {
  return rows.map((r) => {
    let parsed: WordLookupResult = { meanings: [] };
    try { parsed = JSON.parse(r.result_json) as WordLookupResult; } catch { /* keep empty */ }
    return { ...r, parsed };
  });
}

function firstMeaning(p: WordLookupResult): string {
  return p.meanings?.[0]?.definition ?? '';
}

export default function WordPearlScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [pearls, setPearls] = useState<ParsedPearl[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('closed');
  const [judgedResult, setJudgedResult] = useState<'got_it' | 'still_learning' | null>(null);
  const [recoveredCount, setRecoveredCount] = useState(0);

  useEffect(() => {
    (async () => {
      const rows = await getDormantWords(PEARL_BATCH_SIZE);
      setPearls(parsePearls(rows));
    })();
  }, []);

  const total = pearls?.length ?? 0;
  const current = pearls?.[idx] ?? null;
  const allDone = pearls !== null && idx >= total;

  // The moment the batch completes, lock the dashboard card until tomorrow.
  // Fires once per batch (the effect re-runs only when allDone flips true).
  useEffect(() => {
    if (allDone && total > 0) {
      markPearlCompletedToday().catch(() => { /* silent */ });
    }
  }, [allDone, total]);

  function openShell() {
    if (phase !== 'closed') return;
    haptic.selection();
    setPhase('opened');
  }

  async function judge(result: 'got_it' | 'still_learning') {
    if (!current || phase !== 'opened') return;
    haptic.success();
    setPhase('judged');
    setJudgedResult(result);
    if (result === 'got_it') setRecoveredCount((c) => c + 1);
    updateReviewResult(current.id, result, 'flashcard').catch(() => { /* best-effort */ });
    setTimeout(() => {
      setIdx((i) => i + 1);
      setPhase('closed');
      setJudgedResult(null);
    }, 1100);
  }

  // Body content per phase. Header is rendered once at the outer SafeAreaView
  // so back-arrow + title match terms.tsx and the rest of the stack.
  function renderBody() {
    if (pearls === null) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: isDark ? '#A79E90' : '#7B7366', fontSize: 14 }}>…</Text>
        </View>
      );
    }

    if (total === 0) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 64 }}>🌊</Text>
          <Text style={{ marginTop: 20, fontSize: 18, fontWeight: '700', color: isDark ? '#F1ECE2' : '#2A2620', textAlign: 'center' }}>
            {t('pearl.empty_title')}
          </Text>
          <Text style={{ marginTop: 10, fontSize: 14, color: isDark ? '#A79E90' : '#7B7366', textAlign: 'center', lineHeight: 20 }}>
            {t('pearl.empty_message')}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 32, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, backgroundColor: isDark ? '#F1ECE2' : '#2A2620' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#15130E' : '#F4F1EA' }}>
              {t('pearl.close')}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (allDone) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 72 }}>💎</Text>
          <Text style={{ marginTop: 20, fontSize: 22, fontWeight: '800', color: isDark ? '#F1ECE2' : '#2A2620', textAlign: 'center' }}>
            {t('pearl.completed_title')}
          </Text>
          <Text style={{ marginTop: 12, fontSize: 15, color: isDark ? '#A79E90' : '#7B7366', textAlign: 'center', lineHeight: 22 }}>
            {t('pearl.completed_summary', { recovered: recoveredCount, total })}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 36, paddingHorizontal: 36, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2EC4A5' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>
              {t('pearl.close')}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (!current) return null;
    const meaning = firstMeaning(current.parsed);

    return (
      <View style={{ flex: 1 }}>
        {/* Progress dots */}
        <View style={{ paddingHorizontal: 24, paddingTop: 4, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {pearls.map((_, i) => (
            <View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor:
                  i < idx ? '#2EC4A5' : i === idx ? (isDark ? '#F1ECE2' : '#2A2620') : (isDark ? '#3A352B' : '#D9D2C2'),
              }}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable
            onPress={openShell}
            disabled={phase !== 'closed'}
            style={{
              width: 160,
              height: 160,
              borderRadius: 80,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? '#2A261E' : '#FFFFFF',
              borderWidth: 2,
              borderColor: phase === 'judged' && judgedResult === 'got_it'
                ? '#2EC4A5'
                : phase === 'judged' && judgedResult === 'still_learning'
                ? '#E0654F'
                : isDark ? '#3A352B' : '#ECE6DA',
            }}
          >
            <Text style={{ fontSize: 72 }}>
              {phase === 'closed' ? '🦪' : phase === 'judged' && judgedResult === 'got_it' ? '💎' : '🦪'}
            </Text>
          </Pressable>

          {phase === 'closed' ? (
            <>
              <Text style={{ marginTop: 28, fontSize: 17, fontWeight: '600', color: isDark ? '#F1ECE2' : '#2A2620' }}>
                {t('pearl.tap_to_open')}
              </Text>
              <Text style={{ marginTop: 8, fontSize: 13, color: isDark ? '#A79E90' : '#7B7366', textAlign: 'center' }}>
                {t('pearl.dormant_hint')}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ marginTop: 28, fontSize: 28, fontWeight: '800', color: isDark ? '#F1ECE2' : '#2A2620', textAlign: 'center' }}>
                {current.word}
              </Text>
              {meaning ? (
                <Text style={{ marginTop: 10, fontSize: 15, color: isDark ? '#C4BEB2' : '#3A352B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 }}>
                  {meaning}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>

        {phase === 'opened' ? (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) }}>
            <Pressable
              onPress={() => judge('still_learning')}
              style={{
                flex: 1,
                paddingVertical: 16,
                borderRadius: 14,
                backgroundColor: isDark ? '#2A261E' : '#FFFFFF',
                borderWidth: 1,
                borderColor: isDark ? '#3A352B' : '#ECE6DA',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <MaterialIcons name="refresh" size={18} color={isDark ? '#A79E90' : '#7B7366'} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#A79E90' : '#7B7366' }}>
                {t('pearl.still_learning')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => judge('got_it')}
              style={{
                flex: 1,
                paddingVertical: 16,
                borderRadius: 14,
                backgroundColor: '#2EC4A5',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <MaterialIcons name="check" size={18} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {t('pearl.remembered')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="h-11 flex-row items-center mt-6 mb-4 px-6">
        <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('pearl.close')}>
          <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
        </Pressable>
        <Text className="text-base font-semibold text-ink dark:text-ink-dark">
          {t('pearl.title')}
        </Text>
      </View>
      {renderBody()}
    </SafeAreaView>
  );
}
