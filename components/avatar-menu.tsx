import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as NavigationBar from 'expo-navigation-bar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetShell } from '@/components/bottom-sheet-shell';
import { fetchCatalog } from '@src/services/mysteryBoxService';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fired after the menu closes and the caller should open the background picker. */
  onPickBackground: () => void;
  /** Fired after the menu closes and the caller should route to the character flow. */
  onPickCharacter: () => void;
}

const DISMISS_THRESHOLD = 100;

/**
 * Avatar customization menu — a small bottom sheet exposing the two
 * profile-cosmetic flows in one place. Used by both the dashboard
 * profile card and the profile page hero so the entry point is identical.
 * Character row shows a "coming soon" hint when no character is yet in
 * the catalog (assets land in a later migration).
 */
export function AvatarMenu({ visible, onClose, onPickBackground, onPickCharacter }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const [hasCharacters, setHasCharacters] = useState(false);

  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && g.dy > 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_THRESHOLD || g.vy > 1.2) {
          Animated.timing(translateY, {
            toValue: 600,
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

  useEffect(() => {
    if (!visible) {
      translateY.setValue(0);
      return;
    }
    fetchCatalog().then((c) => {
      setHasCharacters(c.some((item) => item.kind === 'character'));
    }).catch(() => {});
  }, [visible, translateY]);

  // Match the system nav-bar background to the sheet surface while the
  // menu is up (see background-picker for the rationale).
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const surface = colorScheme === 'dark' ? '#1F1A14' : '#FFFFFF';
    NavigationBar.setBackgroundColorAsync(surface).catch(() => {});
    return () => {
      NavigationBar.setBackgroundColorAsync('#00000000').catch(() => {});
    };
  }, [visible, colorScheme]);

  const handlePickBackground = () => {
    onClose();
    onPickBackground();
  };
  const handlePickCharacter = () => {
    onClose();
    onPickCharacter();
  };

  return (
    <BottomSheetShell visible={visible} onRequestClose={onClose} animationType="fade">
      <View style={StyleSheet.absoluteFillObject}>
        <Pressable
          onPress={onClose}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          accessibilityRole="button"
        />

        {/* Centering wrapper: keeps the sheet a phone-width column on
            wide web viewports while remaining full-bleed on native. */}
        <View
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}
          pointerEvents="box-none"
        >
          <Animated.View
            style={{
              width: '100%',
              maxWidth: 480,
              transform: [{ translateY }],
            }}
            className="rounded-t-3xl bg-surface dark:bg-surface-dark"
          >
            <View {...panResponder.panHandlers} className="px-6 pt-3 pb-2">
              <View className="mb-3 self-center h-1 w-10 rounded-full bg-line dark:bg-line-dark" />
              <Text className="text-lg font-bold text-ink dark:text-ink-dark">
                {t('avatar_menu.title')}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: Math.max(20, insets.bottom + 12),
              }}
            >
              <MenuRow
                icon="palette"
                iconColor="#2EC4A5"
                title={t('avatar_menu.background_title')}
                subtitle={t('avatar_menu.background_subtitle')}
                onPress={handlePickBackground}
              />
              <View className="h-2" />
              <MenuRow
                icon="card-giftcard"
                iconColor="#D9A441"
                title={t('avatar_menu.character_title')}
                subtitle={
                  hasCharacters
                    ? t('avatar_menu.character_subtitle')
                    : t('avatar_menu.character_coming_soon')
                }
                onPress={handlePickCharacter}
                badge={!hasCharacters ? t('avatar_menu.coming_soon_badge') : undefined}
              />
            </View>
          </Animated.View>
        </View>

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

function MenuRow({
  icon,
  iconColor,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-2xl bg-clay px-4 py-3.5 active:opacity-80 dark:bg-clay-dark"
      accessibilityRole="button"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: `${iconColor}22` }}
      >
        <MaterialIcons name={icon} size={22} color={iconColor} />
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
            {title}
          </Text>
          {badge ? (
            <View
              className="rounded-md px-1.5 py-0.5"
              style={{ backgroundColor: 'rgba(217,164,65,0.16)' }}
            >
              <Text className="text-[10px] font-bold" style={{ color: '#D9A441' }}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#7B7366" />
    </Pressable>
  );
}
