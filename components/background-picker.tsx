import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as NavigationBar from 'expo-navigation-bar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetShell } from '@/components/bottom-sheet-shell';
import { ProfileBackground } from '@/components/profile-background';
import { haptic } from '@src/services/hapticService';
import {
  equipCosmetic,
  fetchCatalog,
  getMysteryBoxState,
  MysteryBoxError,
  refreshMysteryBoxState,
  subscribeMysteryBox,
  type MysteryBoxItem,
} from '@src/services/mysteryBoxService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const DISMISS_THRESHOLD = 120;

/**
 * Bottom-sheet picker for the profile background. All backgrounds are free
 * and apply instantly on tap. Tap an equipped tile again to unequip it.
 *
 * Layout note: backdrop and sheet are absolutely-positioned siblings so the
 * sheet's PanResponder owns its touches outright — wrapping the sheet in a
 * Pressable (for stopPropagation) used to swallow drag gestures.
 */
export function BackgroundPicker({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const [state, setState] = useState(getMysteryBoxState());
  const [catalog, setCatalog] = useState<MysteryBoxItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Android edge-to-edge: with the sheet open, the translucent system nav
  // bar would otherwise leak the dragged sheet content through it. Match
  // its background to the sheet's surface so it reads as opaque while the
  // picker is up, and restore on close.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!visible) return;
    const surface = colorScheme === 'dark' ? '#1F1A14' : '#FFFFFF';
    NavigationBar.setBackgroundColorAsync(surface).catch(() => {});
    NavigationBar.setButtonStyleAsync(colorScheme === 'dark' ? 'light' : 'dark').catch(() => {});
    return () => {
      NavigationBar.setBackgroundColorAsync('#00000000').catch(() => {});
    };
  }, [visible, colorScheme]);

  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && g.dy > 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_THRESHOLD || g.vy > 1.2) {
          Animated.timing(translateY, {
            toValue: 800,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    }),
  ).current;

  useEffect(() => subscribeMysteryBox(setState), []);
  useEffect(() => {
    if (!visible) {
      translateY.setValue(0);
      return;
    }
    refreshMysteryBoxState().catch(() => {});
    fetchCatalog(true).then(setCatalog).catch(() => {});
  }, [visible, translateY]);

  const backgrounds = catalog.filter((c) => c.kind === 'background');
  const equippedId = state.equippedBackgroundId;

  const apply = async (item: MysteryBoxItem) => {
    if (busy) return;
    const nextId = equippedId === item.id ? null : item.id;
    setBusy(item.id);
    try {
      await equipCosmetic('background', nextId);
      haptic.success();
    } catch (e) {
      if (e instanceof MysteryBoxError) { /* swallowed */ }
    } finally {
      setBusy(null);
    }
  };

  const swatchGrid = (
    <>
      <View className="flex-row flex-wrap gap-3">
        {backgrounds.map((item) => (
          <SwatchTile
            key={item.id}
            label={t(`mystery_box.items.${item.id}`, { defaultValue: item.id })}
            isEquipped={equippedId === item.id}
            busy={busy === item.id}
            onPress={() => apply(item)}
          >
            <ProfileBackground item={item} className="flex-1" />
          </SwatchTile>
        ))}
      </View>
      {backgrounds.length === 0 ? (
        <View className="mt-2 items-center rounded-xl border border-dashed border-line px-4 py-5 dark:border-line-dark">
          <Text className="text-xs text-muted text-center">
            {t('background_picker.empty_catalog')}
          </Text>
        </View>
      ) : null}
    </>
  );

  // Web uses a centered popup (matches every other modal in the app).
  // Native keeps the drag-dismiss bottom sheet for thumb ergonomics.
  if (Platform.OS === 'web') {
    return (
      <BottomSheetShell visible={visible} onRequestClose={onClose} animationType="fade">
        <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/50 px-6">
          <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-md rounded-2xl bg-surface dark:bg-surface-dark" style={{ maxHeight: '85%' }}>
            <View className="px-6 pt-5 pb-2">
              <Text className="text-lg font-bold text-ink dark:text-ink-dark">
                {t('background_picker.title')}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {t('background_picker.subtitle')}
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 }}>
              {swatchGrid}
            </ScrollView>
          </Pressable>
        </Pressable>
      </BottomSheetShell>
    );
  }

  return (
    <BottomSheetShell visible={visible} onRequestClose={onClose} animationType="fade">
      <View style={StyleSheet.absoluteFillObject}>
        {/* Backdrop — absolute sibling so taps don't bubble through the sheet */}
        <Pressable
          onPress={onClose}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          accessibilityRole="button"
        />

        {/* Sheet — absolute sibling pinned to the bottom */}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '80%',
            transform: [{ translateY }],
          }}
          className="rounded-t-3xl bg-surface dark:bg-surface-dark"
        >
          {/* Drag handle area — PanResponder lives here so the rest of the
              sheet (taps, ScrollView) stays interactive without contention. */}
          <View {...panResponder.panHandlers} className="px-6 pt-3 pb-2">
            <View className="mb-3 self-center h-1 w-10 rounded-full bg-line dark:bg-line-dark" />
            <Text className="text-lg font-bold text-ink dark:text-ink-dark">
              {t('background_picker.title')}
            </Text>
            <Text className="mt-1 text-xs text-muted">
              {t('background_picker.subtitle')}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 12,
              paddingBottom: Math.max(28, insets.bottom + 16),
            }}
          >
            {swatchGrid}
          </ScrollView>
        </Animated.View>

        {/* Non-transforming floor: covers the area under the translucent
            system nav bar so dragged sheet content cannot leak through.
            Rendered last so it sits above the sheet's transformed layer. */}
        {insets.bottom > 0 ? (
          <View
            pointerEvents="none"
            className="bg-surface dark:bg-surface-dark"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: insets.bottom,
            }}
          />
        ) : null}
      </View>
    </BottomSheetShell>
  );
}

function SwatchTile({
  label,
  isEquipped,
  busy,
  onPress,
  children,
}: {
  label: string;
  isEquipped: boolean;
  busy: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className="overflow-hidden rounded-2xl"
      style={{
        width: '22%',
        aspectRatio: 1,
        opacity: busy ? 0.6 : 1,
        borderWidth: isEquipped ? 2 : 1,
        borderColor: isEquipped ? '#2EC4A5' : '#E2DCD0',
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View className="relative flex-1 w-full">
        {children}
        {isEquipped ? (
          <View className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full bg-accent">
            <MaterialIcons name="check" size={12} color="#fff" />
          </View>
        ) : null}
        {busy ? (
          <View
            className="absolute items-center justify-center bg-black/20"
            style={{ top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
