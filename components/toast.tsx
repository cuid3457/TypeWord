import { useEffect, useRef } from 'react';
import { Animated, Text, View, type ViewStyle } from 'react-native';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide?: () => void;
  type?: 'error' | 'success';
  duration?: number;
  style?: ViewStyle;
  collapse?: boolean;
}

export function Toast({ message, visible, onHide, type = 'error', duration = 2000, style, collapse }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(1)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!visible) { opacity.setValue(0); height.setValue(1); return; }
    opacity.setValue(0);
    height.setValue(1);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: false }).start(({ finished }) => {
        if (finished && collapse) {
          Animated.timing(height, { toValue: 0, duration: 200, useNativeDriver: false }).start(({ finished: f2 }) => {
            if (f2) onHideRef.current?.();
          });
        } else if (finished) {
          onHideRef.current?.();
        }
      });
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, message]);

  if (!visible) return null;

  const bg = type === 'error' ? '#ef4444' : '#2EC4A5';

  return (
    <Animated.View style={[
      { alignItems: 'center', opacity, overflow: 'hidden' },
      collapse ? { maxHeight: height.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }) } : undefined,
      style,
    ]}>
      <View style={{ backgroundColor: bg, borderRadius: 9999, paddingHorizontal: 24, paddingVertical: 12 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{message}</Text>
      </View>
    </Animated.View>
  );
}
