import AsyncStorage from '@react-native-async-storage/async-storage';
import { awardStreakMilestone } from './pointsService';

export const CELEBRATE_EVENT = 'streak_celebrate';

const MILESTONE_INTERVAL = 10;

const CELEBRATED_KEY = 'streak_last_celebrated';
const DAILY_CELEBRATED_KEY = 'streak_daily_celebrated';

/** Flat point reward granted every 10-day milestone. Mirrors server constant. */
export const MILESTONE_REWARD_POINTS = 200;

export interface CelebrateInfo {
  type: 'milestone' | 'daily';
  streak: number;
  variant: number;
}

const DAILY_EMOJIS = ['✨', '💪', '🎯'];

export function getDailyEmoji(variant: number): string {
  return DAILY_EMOJIS[variant] ?? '✨';
}

export function isMilestone(streak: number): boolean {
  return streak > 0 && streak % MILESTONE_INTERVAL === 0;
}

export async function shouldCelebrate(streak: number): Promise<boolean> {
  if (!isMilestone(streak)) return false;
  const last = await AsyncStorage.getItem(CELEBRATED_KEY);
  return last !== String(streak);
}

export async function shouldCelebrateDaily(todayDate: string): Promise<boolean> {
  const last = await AsyncStorage.getItem(DAILY_CELEBRATED_KEY);
  return last !== todayDate;
}

export function getDailyVariant(todayDate: string): number {
  const d = new Date(todayDate);
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return dayOfYear % 3;
}

export async function markCelebrated(streak: number): Promise<void> {
  await AsyncStorage.setItem(CELEBRATED_KEY, String(streak));
  // Grant the milestone bonus. Server is idempotent on `streak`, so this is
  // safe to call even if the local key was cleared/reinstall'd.
  await awardStreakMilestone(streak);
}

export async function markDailyCelebrated(todayDate: string): Promise<void> {
  await AsyncStorage.setItem(DAILY_CELEBRATED_KEY, todayDate);
}
