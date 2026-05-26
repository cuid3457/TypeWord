import { Platform, useWindowDimensions } from 'react-native';

// On desktop browsers a 1920+px column would look like a stretched
// tablet, not an app. Cap the column at a tablet-portrait-ish width so
// every layout becomes a centered card on wide windows.
const WEB_CONTENT_MAX = 720;

/**
 * Tablet breakpoint + content-width detection.
 *
 * Native breakpoint: 600dp on the smaller dimension — aligns with the
 * Material Design "Medium" window size class. This catches iPads,
 * Galaxy Tabs, AND foldables in their unfolded state (Z Fold inner
 * ~673dp min) while keeping all phones in compact mode (Pixel 8 Pro /
 * Pro Max max ~430dp portrait — width and height both stay under 600
 * in both orientations).
 *
 * contentWidth (native): matches the device's PORTRAIT width regardless
 * of current orientation. Portrait uses full width; landscape caps at
 * the portrait width so the layout density feels identical in both
 * orientations — no awkward stretching or asymmetric empty space.
 *
 * Web: branches on viewport width instead of min(w,h). Any window
 * >= 600px wide is treated as tablet so the layout collapses to a
 * centered, max-720px column — even on ultra-wide desktops where
 * min(w,h) would otherwise be 1000+px and let content stretch to fill.
 */
export function useTablet() {
  const { width, height } = useWindowDimensions();
  if (Platform.OS === 'web') {
    const isTablet = width >= 600;
    const contentWidth = Math.min(width, WEB_CONTENT_MAX);
    return { isTablet, width, contentWidth };
  }
  const isTablet = Math.min(width, height) >= 600;
  const contentWidth = Math.min(width, height);
  return { isTablet, width, contentWidth };
}
