import { Platform, View, type ViewProps } from 'react-native';

/**
 * Soft warm shadow for UI that genuinely floats above the page —
 * modals, sheets, popovers, floating action bars. Content cards stay
 * flat so elevation reads as a hierarchy signal, not decoration.
 * Dark mode renders no shadow; a hairline border carries separation.
 */
export const floatingShadow = Platform.select({
  ios: {
    shadowColor: '#1A1206',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
  default: {},
});

/**
 * Warm-premium surface container. A flat filled card separated from the
 * page by a faint hairline and a subtle surface-tone lift — no shadow,
 * which stays reserved for genuinely floating UI. Pass spacing/margin
 * via `className`; the card owns only surface, border, and radius so
 * caller utilities never conflict with its own.
 */
export function Card({ children, className, style, ...rest }: ViewProps) {
  return (
    <View
      className={`rounded-[20px] border border-line bg-surface dark:border-line-dark dark:bg-surface-dark ${className ?? ''}`}
      style={style}
      {...rest}
    >
      {children}
    </View>
  );
}
