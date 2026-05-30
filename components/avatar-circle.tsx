import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ProfileBackground } from '@/components/profile-background';
import {
  fetchCatalog,
  type MysteryBoxItem,
} from '@src/services/mysteryBoxService';

interface Props {
  /** Display name; first letter is rendered as the initial. */
  name: string | null | undefined;
  /** Equipped background item id (kind='background'). Null = neutral fallback. */
  backgroundId?: string | null;
  /** Outer diameter in pixels. */
  size?: number;
  /** Initial-letter font size; defaults to size × 0.42. */
  fontSize?: number;
  /** Optional white ring around the avatar — useful when laid over a colored hero. */
  ring?: boolean;
}

let _catalogCache: MysteryBoxItem[] | null = null;
const subscribers = new Set<(c: MysteryBoxItem[]) => void>();

function ensureCatalog() {
  if (_catalogCache) return;
  fetchCatalog().then((c) => {
    _catalogCache = c;
    for (const fn of subscribers) fn(c);
  }).catch(() => {});
}

function useBackgroundItem(id: string | null | undefined): MysteryBoxItem | null {
  const [item, setItem] = useState<MysteryBoxItem | null>(() => {
    if (!id || !_catalogCache) return null;
    return _catalogCache.find((c) => c.id === id) ?? null;
  });
  useEffect(() => {
    if (!id) { setItem(null); return; }
    if (_catalogCache) {
      setItem(_catalogCache.find((c) => c.id === id) ?? null);
      return;
    }
    const sub = (cat: MysteryBoxItem[]) => {
      setItem(cat.find((c) => c.id === id) ?? null);
    };
    subscribers.add(sub);
    ensureCatalog();
    return () => { subscribers.delete(sub); };
  }, [id]);
  return item;
}

/**
 * Avatar circle showing the first letter of the user's display name, with
 * optional equipped background. Used everywhere a user is represented
 * before character art is shipped — profile, friends list, dashboard, etc.
 */
export function AvatarCircle({ name, backgroundId, size = 48, fontSize, ring }: Props) {
  const item = useBackgroundItem(backgroundId);
  const letter = (name || '?').charAt(0).toUpperCase();
  const fs = fontSize ?? Math.round(size * 0.42);

  const ringStyle = ring
    ? { borderWidth: Math.max(2, Math.round(size * 0.055)), borderColor: '#FFFFFF' }
    : null;

  return (
    <ProfileBackground
      item={item}
      borderRadius={size / 2}
      style={[
        {
          width: size,
          height: size,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        ringStyle,
      ]}
    >
      <Text
        style={{ fontSize: fs, fontWeight: '800', color: '#2A2620' }}
      >
        {letter}
      </Text>
    </ProfileBackground>
  );
}
