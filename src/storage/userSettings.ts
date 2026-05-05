/**
 * Persists user-level preferences (native language, default study pair, etc.)
 * in AsyncStorage. Kept here — not in SQLite — because there's only ever one
 * settings record and we want zero-latency reads during app boot.
 *
 * Phase 3 will sync this to Supabase `profiles`, preserving the same shape.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleSync } from '@src/services/syncService';
import { migrateNativeLang } from '@src/constants/languages';

const KEY = 'typeword.userSettings.v1';

export interface UserSettings {
  nativeLanguage: string;
  primarySourceLang: string;
  primaryTargetLang: string;
  onboardedAt: string;
  countryCode?: string;
  timezone?: string;
  fontSize?: 'small' | 'medium' | 'large';
  theme?: 'system' | 'light' | 'dark';
  sessionCount?: number;
  /** Last review mode the user chose. Restored as the default selection
   *  on the next session so users don't have to re-pick every time. */
  reviewMode?: 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank' | 'auto';
  notificationsEnabled?: boolean;
  /** 'F' or 'M' — chosen TTS voice gender, applied across all languages. */
  voiceGender?: 'F' | 'M';
  /** TTS playback rate. 1.0 = natural per-voice speed (with correction); 0.8/1.2 = ±20%. */
  voiceRate?: 0.8 | 1.0 | 1.2;
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
    const parsed = JSON.parse(raw) as UserSettings;
    // Migrate legacy native-language codes (vi/id/th/ar/hi/tr) → 'en'.
    // Persist the migration so later reads stay consistent and the picker
    // selection matches what the UI actually renders in.
    const migrated = migrateNativeLang(parsed.nativeLanguage);
    if (migrated !== parsed.nativeLanguage) {
      const next: UserSettings = { ...parsed, nativeLanguage: migrated };
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      return next;
    }
    return parsed;
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
