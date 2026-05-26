import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { colorScheme as colorSchemeObservable } from 'react-native-css-interop';
import { useEffect, useState } from 'react';

/**
 * Web variant. Returns 'light' until the client has hydrated so the
 * static-rendered HTML doesn't flicker when the bundle picks up the
 * user's actual scheme. After hydration, defers to NativeWind so the
 * Tailwind dark: prefix stays in sync with the rest of the app.
 */
export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => { setHasHydrated(true); }, []);

  const { colorScheme } = useNativeWindColorScheme();
  if (!hasHydrated) return 'light';
  return colorScheme ?? 'light';
}

/**
 * Mirror of the native export. react-native-css-interop's colorScheme
 * observable is the same module NativeWind uses on web, so theme
 * propagation works the same way as on iOS/Android.
 */
export function syncTheme(theme: 'system' | 'light' | 'dark') {
  colorSchemeObservable.set(theme);
}
