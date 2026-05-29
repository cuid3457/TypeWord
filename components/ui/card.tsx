import { Platform, View, type ViewProps } from 'react-native';

/**
 * Warm-premium surface container. A filled card with a faint hairline
 * and a soft, low shadow (light mode) — the hairline carries separation
 * in dark mode where shadows don't render. Pass spacing/margin via
 * `className`; the card owns only surface, border, and radius so caller
 * utilities never conflict with its own.
 */
const cardShadow = Platform.select({
  ios: {
    shadowColor: '#1A1206',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
  default: {},
});

export function Card({ children, className, style, ...rest }: ViewProps) {
  return (
    <View
      className={`rounded-[20px] border border-line bg-surface dark:border-line-dark dark:bg-surface-dark ${className ?? ''}`}
      style={[cardShadow, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
