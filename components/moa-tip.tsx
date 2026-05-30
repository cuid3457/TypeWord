import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, View, type ImageSourcePropType } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getAllTips } from '@src/data/moaTips';

// Placeholder character: the splash artwork (mint bg baked in) shown inside a
// rounded badge for now. Swap in dedicated transparent Moa art later via the
// `character` prop — no other change needed.
const DEFAULT_CHARACTER = require('../assets/images/splash-icon.png');
const MINT = '#2EC4A5';
const ROTATE_MS = 4500;

interface MoaTipProps {
  /** Override the character art (e.g., a seasonal Moa). Defaults to splash art. */
  character?: ImageSourcePropType;
  /** Badge size in px. */
  size?: number;
}

/**
 * A reusable "loading companion": Moa character + a short fact/TMI about any
 * of the supported languages, in the user's display language. Picks a random
 * tip per mount and gently rotates so longer waits stay fresh. Renders nothing
 * when no tips resolve. Drop into any loading/empty state.
 */
export function MoaTip({ character, size = 92 }: MoaTipProps) {
  const { i18n } = useTranslation();
  const tips = useMemo(
    () => getAllTips(i18n.language),
    [i18n.language],
  );
  const [idx, setIdx] = useState(() =>
    tips.length ? Math.floor(Math.random() * tips.length) : 0,
  );
  const fade = useRef(new Animated.Value(0)).current;

  // Fade the whole block in on mount.
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [fade]);

  // Rotate tips on an interval (matters only for longer waits); crossfade the
  // text between tips.
  useEffect(() => {
    if (tips.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % tips.length);
        Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [tips, fade]);

  if (tips.length === 0) return null;

  return (
    <Animated.View style={{ opacity: fade }} className="mt-6 items-center px-4">
      <View
        style={{ width: size, height: size, borderRadius: 24, overflow: 'hidden', backgroundColor: MINT }}
      >
        <Image source={character ?? DEFAULT_CHARACTER} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
      <Animated.Text
        style={{ opacity: fade }}
        className="mt-3 text-center text-sm leading-relaxed text-muted"
      >
        {tips[idx % tips.length]}
      </Animated.Text>
    </Animated.View>
  );
}
