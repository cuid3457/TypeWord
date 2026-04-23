import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const COLORS = ['#2EC4A5', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];
const { width: SW, height: SH } = Dimensions.get('window');

function Piece({
  delay,
  color,
  x,
  w,
  h,
  dur,
  rotation,
  round,
  sway,
}: {
  delay: number;
  color: string;
  x: number;
  w: number;
  h: number;
  dur: number;
  rotation: number;
  round: boolean;
  sway: number;
}) {
  const ty = useSharedValue(-20);
  const tx = useSharedValue(0);
  const rot = useSharedValue(0);
  const op = useSharedValue(1);

  useEffect(() => {
    ty.value = withDelay(
      delay,
      withTiming(SH, { duration: dur, easing: Easing.in(Easing.quad) }),
    );
    tx.value = withDelay(delay, withTiming(sway, { duration: dur }));
    rot.value = withDelay(delay, withTiming(rotation, { duration: dur }));
    op.value = withDelay(
      delay + dur * 0.6,
      withTiming(0, { duration: dur * 0.4 }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: ty.value },
      { translateX: tx.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: op.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: -10,
          width: w,
          height: h,
          backgroundColor: color,
          borderRadius: round ? w / 2 : 2,
        },
        style,
      ]}
    />
  );
}

export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        delay: Math.random() * 600,
        color: COLORS[i % COLORS.length],
        x: Math.random() * SW,
        w: 6 + Math.random() * 6,
        h: 6 + Math.random() * 10,
        dur: 1800 + Math.random() * 1200,
        rotation: (Math.random() - 0.5) * 720,
        round: Math.random() > 0.5,
        sway: (Math.random() - 0.5) * 120,
      })),
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p) => (
        <Piece key={p.id} {...p} />
      ))}
    </View>
  );
}
