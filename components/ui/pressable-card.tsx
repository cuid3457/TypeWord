import { useState } from 'react';
import { Platform, Pressable, type PressableProps } from 'react-native';

type Props = Omit<PressableProps, 'children'> & {
  children: React.ReactNode;
  className?: string;
};

const webCursorStyle = Platform.OS === 'web'
  ? ({ cursor: 'pointer', transitionDuration: '120ms', transitionProperty: 'background-color, border-color' } as const)
  : null;

/**
 * Spread on any Pressable that's not card-shaped (icon buttons, chips,
 * pill toggles) so the desktop cursor and a soft transition match the
 * rest of the affordance system.
 */
export const webCursor = webCursorStyle;

/**
 * Interactive Card. Mirrors Card's surface tokens but is a Pressable
 * with explicit web hover/cursor/focus affordance — desktop browsers
 * otherwise show no signal that a card is clickable. On native the
 * Pressable's own press feedback continues to apply.
 */
export function PressableCard({ children, className, style, ...rest }: Props) {
  const [hovered, setHovered] = useState(false);
  const isWeb = Platform.OS === 'web';
  const surface = isWeb && hovered
    ? 'bg-clay dark:bg-clay-dark border-faint dark:border-line-dark'
    : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark';
  return (
    <Pressable
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      onHoverIn={isWeb ? () => setHovered(true) : undefined}
      onHoverOut={isWeb ? () => setHovered(false) : undefined}
      // @ts-expect-error — web-only css fields
      style={[webCursorStyle, style]}
      className={`rounded-[20px] border ${surface} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
