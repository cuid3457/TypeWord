/**
 * Persists user-level preferences (native language, default study pair, etc.)
 * in AsyncStorage. Kept here — not in SQLite — because there's only ever one
 * settings record and we want zero-latency reads during app boot.
 *
 * Phase 3 will sync this to Supabase `profiles`, preserving the same shape.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleSync } from '@src/services/syncService';

const KEY = 'typeword.userSettings.v1';

export interface UserSettings {
  nativeLanguage: string;
  primarySourceLang: string;
  primaryTargetLang: string;
  onboardedAt: string;
  fontSize?: 'small' | 'medium' | 'large';
  theme?: 'system' | 'light' | 'dark';
  sessionCount?: number;
  notificationsEnabled?: boolean;
}

type Listener = (settings: UserSettings | null) => void;
const listeners = new Set<Listener>();

function notify(settings: UserSettings | null) {
  for (const l of listeners) l(settings);
}

export function subscribeUserSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getUserSettings(): Promise<UserSettings | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSettings;
  } catch {
    return null;
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  notify(settings);
  scheduleSync();
}

export async function clearUserSettings(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  notify(null);
}
