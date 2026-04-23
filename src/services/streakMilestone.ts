import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CELEBRATE_EVENT = 'streak_celebrate';

const MILESTONE_INTERVAL = 10;

const CELEBRATED_KEY = 'streak_last_celebrated';
const DAILY_CELEBRATED_KEY = 'streak_daily_celebrated';
const AD_FREE_UNTIL_KEY = 'ad_free_until';

export interface CelebrateInfo {
  type: 'milestone' | 'daily';
  streak: number;
  variant: number;
}

const DAILY_EMOJIS = ['\u2728', '\uD83D\uDCAA', '\uD83C\uDFAF'];

export function getDailyEmoji(variant: number): string {
  return DAILY_EMOJIS[variant] ?? '\u2728';
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
  const until = Date.now() + 24 * 60 * 60 * 1000;
  await AsyncStorage.setItem(AD_FREE_UNTIL_KEY, String(until));
}

export async function markDailyCelebrated(todayDate: string): Promise<void> {
  await AsyncStorage.setItem(DAILY_CELEBRATED_KEY, todayDate);
}

export async function isAdFree(): Promise<boolean> {
  const { isPremium } = require('./subscriptionService');
  if (isPremium()) return true;
  const until = await AsyncStorage.getItem(AD_FREE_UNTIL_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

export async function clearAdFree(): Promise<void> {
  await AsyncStorage.removeItem(AD_FREE_UNTIL_KEY);
  await AsyncStorage.removeItem(CELEBRATED_KEY);
  await AsyncStorage.removeItem(DAILY_CELEBRATED_KEY);
}
