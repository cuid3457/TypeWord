/**
 * Drop-in replacement for React Native's native Switch with controllable
 * animation duration. The OS Switch animates in ~150-200ms and exposes no
 * way to slow that down; users perceive that as abrupt rather than smooth.
 *
 * Same props shape as the parts of Switch we use elsewhere so existing
 * call sites just swap the import.
 */
import { useEffect } from 'react';
import { AccessibilityRole, Pressable } from 'react-native';
import { haptic } from '@src/services/hapticService';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface TrackColor {
  false: string;
  true: string;
}

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  trackColor?: TrackColor;
  thumbColorOn?: string;
  thumbColorOff?: string;
  /** Animation duration in ms. Default 400ms — roughly half-speed vs OS. */
  duration?: number;
  accessibilityLabel?: string;
  disabled?: boolean;
}

const TRACK_WIDTH = 42;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 22;
const PADDING = 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - PADDING * 2;

const DEFAULT_TRACK: TrackColor = { false: '#d1d5db', true: '#A7E8D8' };
const DEFAULT_THUMB_ON = '#2EC4A5';
const DEFAULT_THUMB_OFF = '#f4f4f5';

export function SmoothSwitch({
  value,
  onValueChange,
  trackColor = DEFAULT_TRACK,
  thumbColorOn = DEFAULT_THUMB_ON,
  thumbColorOff = DEFAULT_THUMB_OFF,
  duration = 400,
  accessibilityLabel,
  disabled = false,
}: Props) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration });
  }, [value, duration, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [trackColor.false, trackColor.true],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [thumbColorOff, thumbColorOn],
    ),
  }));

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptic.selection();
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole={'switch' as AccessibilityRole}
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            padding: PADDING,
            justifyContent: 'center',
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.2,
              shadowRadius: 1.5,
              elevation: 2,
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
