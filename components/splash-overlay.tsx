import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { fetchActivePromo, type PromoSplash } from '@src/services/promoSplashService';

// Matches the native splash (app.json: image 200px contain on #2EC4A5) so the
// handoff from the OS splash to this JS overlay is seamless.
const MINT = '#2EC4A5';
const CHARACTER = require('../assets/images/splash-icon.png');

// No-promo path: just long enough to paint over the native→JS seam, then fade.
const MIN_HOLD_MS = 250;
const FADE_MS = 300;
const PROMO_DEFAULT_MS = 3000;

export function SplashOverlay() {
  const insets = useSafeAreaInsets();
  const [done, setDone] = useState(false);
  const [promo, setPromo] = useState<PromoSplash | null>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const dismissedRef = useRef(false);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
      .start(() => setDone(true));
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      const p = await fetchActivePromo();
      if (cancelled) return;
      setPromo(p);
      timer = setTimeout(dismiss, p ? (p.durationMs ?? PROMO_DEFAULT_MS) : MIN_HOLD_MS);
    })();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (done) return null;

  const onCtaPress = () => {
    const route = promo?.ctaRoute;
    dismiss();
    if (route) {
      try { router.push(route as never); } catch { /* invalid route — just dismiss */ }
    }
  };

  return (
    <Animated.View
      pointerEvents={promo ? 'auto' : 'none'}
      style={{
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        opacity,
        backgroundColor: promo?.backgroundColor ?? MINT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {promo ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCtaPress}>
            <Image source={{ uri: promo.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </Pressable>
          <Pressable
            onPress={dismiss}
            hitSlop={16}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialIcons name="close" size={22} color="#fff" />
          </Pressable>
        </>
      ) : (
        <Image source={CHARACTER} style={{ width: 200, height: 200 }} resizeMode="contain" />
      )}
    </Animated.View>
  );
}
