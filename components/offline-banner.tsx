import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStatus } from '@src/hooks/useNetworkStatus';

export function OfflineBanner() {
  const isConnected = useNetworkStatus();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const wasOffline = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mode, setMode] = useState<'offline' | 'online' | null>(null);

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!isConnected) {
      timerRef.current = setTimeout(() => {
        wasOffline.current = true;
        setMode('offline');
        opacity.setValue(0);
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        timerRef.current = setTimeout(() => {
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMode(null));
        }, 2000);
      }, 5000);
    } else if (wasOffline.current) {
      wasOffline.current = false;
      setMode('online');
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMode(null));
      }, 2000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isConnected]);

  if (!mode) return null;

  const bg = mode === 'offline' ? '#ef4444' : '#2EC4A5';
  const icon = mode === 'offline' ? 'wifi-off' : 'wifi';
  const text = mode === 'offline' ? t('error.offline_title') : t('error.online_title');

  return (
    <Animated.View style={{ position: 'absolute', bottom: insets.bottom + 132, left: 0, right: 0, alignItems: 'center', opacity, pointerEvents: 'none' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bg, borderRadius: 9999, paddingHorizontal: 24, paddingVertical: 12 }}>
        <MaterialIcons name={icon} size={14} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 8 }}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}
