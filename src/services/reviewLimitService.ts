import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPremium } from './subscriptionService';

const STORAGE_KEY = 'typeword.reviewLimits';

export type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank' | 'auto';

const LIMITS: Record<ReviewMode, number> = {
  flashcard: 50,
  choice: 50,
  dictation: 30,
  context: 30,
  fill_blank: 30,
  auto: 50,
};

const MAX_REWARDED_ADS_PER_DAY = 1;

interface DailyState {
  date: string;
  used: Record<ReviewMode, number>;
  adsWatched: number;
}

export function getDailyLimit(mode: ReviewMode): number {
  return LIMITS[mode];
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY_USED: Record<ReviewMode, number> = { flashcard: 0, choice: 0, dictation: 0, context: 0, fill_blank: 0, auto: 0 };

async function loadState(): Promise<DailyState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DailyState;
      if (parsed.date === todayKey()) return parsed;
    } catch { /* reset */ }
  }
  return { date: todayKey(), used: { ...EMPTY_USED }, adsWatched: 0 };
}

async function saveState(state: DailyState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function getRemaining(mode: ReviewMode): Promise<number> {
  if (isPremium()) return Infinity;
  const state = await loadState();
  return Math.max(0, LIMITS[mode] - (state.used[mode] ?? 0));
}

export async function getRemainingAll(): Promise<Record<ReviewMode, number>> {
  if (isPremium()) return { flashcard: Infinity, choice: Infinity, dictation: Infinity, context: Infinity, fill_blank: Infinity, auto: Infinity };
  const state = await loadState();
  return {
    flashcard: Math.max(0, LIMITS.flashcard - (state.used.flashcard ?? 0)),
    choice: Math.max(0, LIMITS.choice - (state.used.choice ?? 0)),
    dictation: Math.max(0, LIMITS.dictation - (state.used.dictation ?? 0)),
    context: Math.max(0, LIMITS.context - (state.used.context ?? 0)),
    fill_blank: Math.max(0, LIMITS.fill_blank - (state.used.fill_blank ?? 0)),
    auto: Math.max(0, LIMITS.auto - (state.used.auto ?? 0)),
  };
}

export async function consumeWord(mode: ReviewMode): Promise<{ allowed: boolean; remaining: number }> {
  if (isPremium()) return { allowed: true, remaining: Infinity };
  const state = await loadState();
  const used = state.used[mode] ?? 0;
  const remaining = LIMITS[mode] - used;
  if (remaining <= 0) return { allowed: false, remaining: 0 };
  state.used[mode] = used + 1;
  await saveState(state);
  return { allowed: true, remaining: remaining - 1 };
}

export async function canWatchRewardedAd(): Promise<boolean> {
  if (isPremium()) return false;
  const state = await loadState();
  return state.adsWatched < MAX_REWARDED_ADS_PER_DAY;
}

export async function recordRewardedAdWatch(): Promise<void> {
  const state = await loadState();
  state.adsWatched++;
  state.used = { ...EMPTY_USED };
  await saveState(state);
}
