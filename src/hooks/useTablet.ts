import { useWindowDimensions } from 'react-native';

/**
 * Tablet breakpoint + content-width detection.
 *
 * Breakpoint: 600dp on the smaller dimension — aligns with the Material
 * Design "Medium" window size class. This catches iPads, Galaxy Tabs,
 * AND foldables in their unfolded state (Z Fold inner ~673dp min) while
 * keeping all phones in compact mode (Pixel 8 Pro / Pro Max max ~430dp
 * portrait — width and height both stay under 600 in both orientations).
 *
 * contentWidth: matches the device's PORTRAIT width regardless of
 * current orientation. Portrait uses full width; landscape caps at the
 * portrait width so the layout density feels identical in both
 * orientations — no awkward stretching or asymmetric empty space.
 */
export function useTablet() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const contentWidth = Math.min(width, height);
  return { isTablet, width, contentWidth };
}
