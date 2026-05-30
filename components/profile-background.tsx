import { LinearGradient } from 'expo-linear-gradient';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { MysteryBoxItem } from '@src/services/mysteryBoxService';

interface Props {
  /** Resolved catalog item, or null to render the neutral fallback. */
  item: MysteryBoxItem | null | undefined;
  /** Extra wrapper class names (NativeWind). */
  className?: string;
  /** Border radius override; defaults to the wrapper's class-based radius. */
  borderRadius?: number;
  /** Inline style merged onto the wrapper. */
  style?: StyleProp<ViewStyle>;
  /** Render children layered on top of the background. */
  children?: React.ReactNode;
}

const FALLBACK_COLOR = '#EDEAE4';

/**
 * Renders a profile-background slot. Solid colors fill the slot; gradients
 * use expo-linear-gradient for a true smooth blend (no banding). Gradient
 * direction is vertical by default — `payload.direction = 'horizontal' |
 * 'diagonal' | 'vertical'` overrides per item.
 */
export function ProfileBackground({ item, className, borderRadius, style, children }: Props) {
  const radius = typeof borderRadius === 'number' ? { borderRadius } : null;
  const payload = (item?.payload ?? {}) as Record<string, unknown>;
  const type = payload.type;

  if (item && type === 'solid' && typeof payload.color === 'string') {
    return (
      <View
        className={className}
        style={[{ backgroundColor: payload.color }, radius, style].filter(Boolean) as object[]}
      >
        {children}
      </View>
    );
  }

  if (item && type === 'gradient'
    && typeof payload.from === 'string' && typeof payload.to === 'string') {
    const direction = payload.direction === 'horizontal'
      ? { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } }
      : payload.direction === 'diagonal'
        ? { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }
        : { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } };
    return (
      <View
        className={className}
        style={[{ overflow: 'hidden' }, radius, style].filter(Boolean) as object[]}
      >
        <LinearGradient
          colors={[payload.from as string, payload.to as string]}
          start={direction.start}
          end={direction.end}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        />
        {children}
      </View>
    );
  }

  return (
    <View
      className={className}
      style={[{ backgroundColor: FALLBACK_COLOR }, radius, style].filter(Boolean) as object[]}
    >
      {children}
    </View>
  );
}
