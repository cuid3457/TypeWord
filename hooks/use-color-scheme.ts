import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { colorScheme as colorSchemeObservable } from 'react-native-css-interop';

/**
 * Returns the current NativeWind color scheme ('light' | 'dark').
 * Theme syncing is handled separately via syncTheme().
 */
export function useColorScheme(): 'light' | 'dark' {
  const { colorScheme } = useNativeWindColorScheme();
  return colorScheme ?? 'light';
}

/**
 * Set the NativeWind/css-interop color scheme imperatively.
 * Call from a useEffect in the root layout — NOT a hook itself.
 */
export function syncTheme(theme: 'system' | 'light' | 'dark') {
  colorSchemeObservable.set(theme);
}
