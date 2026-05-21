import { View, type ViewProps } from 'react-native';
import { useTablet } from '@src/hooks/useTablet';

/**
 * Centered, width-capped content wrapper for tablet displays. On phones
 * it's a transparent pass-through (no layout change). On tablets the
 * content is capped at the device's portrait width — landscape mode
 * shows the same usable column with extra empty space on the sides, so
 * the layout density stays identical between rotations.
 *
 * Drop in as the outermost child of a screen container (typically inside
 * SafeAreaView), wrapping the ScrollView or main content.
 */
export function TabletContainer({ children, style, ...rest }: ViewProps) {
  const { isTablet, contentWidth } = useTablet();
  if (!isTablet) return <>{children}</>;
  return (
    <View
      style={[
        { flex: 1, width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
