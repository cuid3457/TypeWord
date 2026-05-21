import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  );
}

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

// Auth token storage. Supabase JS stores access + refresh tokens under one
// key; under the previous AsyncStorage adapter those tokens lived in the
// app's RKStorage SQLite file in plain text — extractable from a rooted
// device or via `adb backup` (Android allowBackup is also being set false).
//
// We back authoritative storage with iOS Keychain / Android EncryptedShared
// Preferences via expo-secure-store. SecureStore has a per-item size cap
// (~2 KB on iOS Keychain in practice); on rare overflow we fall through to
// AsyncStorage so auth still works rather than silently breaking the app.
// Reads check both stores so a value migrated mid-session is still found.
const tokenStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v !== null && v !== undefined) return v;
    } catch {
      // fall through to AsyncStorage
    }
    try {
      return (await AsyncStorage.getItem(key)) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
      // Clean up legacy / fallback copy so the encrypted store is canonical.
      try { await AsyncStorage.removeItem(key); } catch { /* no-op */ }
      return;
    } catch {
      // SecureStore may reject oversize values or fail on a misconfigured
      // Keychain access group. Degrade rather than break sign-in.
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    try { await SecureStore.deleteItemAsync(key); } catch { /* no-op */ }
    try { await AsyncStorage.removeItem(key); } catch { /* no-op */ }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: tokenStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
