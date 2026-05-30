import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

// Cap matches the native variant — see useTablet.ts.
const WEB_CONTENT_MAX = 720;

/**
 * Web variant of useTablet.
 *
 * Expo static export pre-renders this hook with useWindowDimensions
 * returning 0 (no window during build). On desktop the first client
 * render then sees real viewport width >= 600 and flips isTablet from
 * false → true. Any consumer that branches *structurally* on isTablet
 * — TabletContainer wraps in <View/> vs returns bare children; home
 * tab FlatList key='list'↔'grid' + numColumns 1↔2 — ends up with a
 * different DOM tree at SSR vs first client render → React #418.
 *
 * Fix mirrors useColorScheme.web: return the phone defaults
 * (isTablet=false, width=0, contentWidth=0) until after hydration so
 * the first client render matches SSR. A follow-up render triggered by
 * setHasHydrated then picks up the real viewport and consumers
 * re-render naturally.
 *
 * Cost: one extra render on the client; desktop users see a brief
 * "phone" layout flash before the tablet/desktop layout kicks in.
 * Acceptable trade-off for clean hydration.
 */
export function useTablet() {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => { setHasHydrated(true); }, []);

  const { width } = useWindowDimensions();
  if (!hasHydrated) {
    return { isTablet: false, width: 0, contentWidth: 0 };
  }
  const isTablet = width >= 600;
  const contentWidth = Math.min(width, WEB_CONTENT_MAX);
  return { isTablet, width, contentWidth };
}
