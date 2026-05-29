/**
 * Entry-point modal for creating a wordlist. Two paths:
 *   - blank: existing manual creation flow
 *   - browse: curated wordlist library (category + language picked inside)
 *
 * Layout adapts to platform:
 *   - Native + mobile web (<600dp):  slide-up bottom sheet, drag-to-dismiss
 *   - Tablet+ web (>=600dp):         centered card dialog, click-outside / Esc
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTablet } from '@src/hooks/useTablet';
import { BottomSheetShell } from '@/components/bottom-sheet-shell';

interface Props {
  visible: boolean;
  onPickBlank: () => void;
  onPickBrowse: () => void;
  onClose: () => void;
}

export function WordlistCreateModal({
  visible,
  onPickBlank,
  onPickBrowse,
  onClose,
}: Props) {
  const { isTablet } = useTablet();
  const useCard = Platform.OS === 'web' && isTablet;
  if (useCard) {
    return (
      <CenteredCardLayout
        visible={visible}
        onPickBlank={onPickBlank}
        onPickBrowse={onPickBrowse}
        onClose={onClose}
      />
    );
  }
  return (
    <BottomSheetLayout
      visible={visible}
      onPickBlank={onPickBlank}
      onPickBrowse={onPickBrowse}
      onClose={onClose}
    />
  );
}

function OptionRows({
  onPickBlank,
  onPickBrowse,
}: {
  onPickBlank: () => void;
  onPickBrowse: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="mt-5 gap-3">
      <Pressable
        onPress={onPickBlank}
        className="flex-row items-center rounded-xl border-2 border-line p-4 dark:border-line-dark"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-clay dark:bg-clay-dark">
          <MaterialIcons name="edit" size={22} color="#7B7366" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            {t('create_modal.blank_title')}
          </Text>
          <Text className="mt-0.5 text-xs text-muted">
            {t('create_modal.blank_description')}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onPickBrowse}
        className="flex-row items-center rounded-xl border-2 border-line p-4 dark:border-line-dark"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-clay dark:bg-clay-dark">
          <MaterialIcons name="auto-stories" size={22} color="#7B7366" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            {t('create_modal.browse_title')}
          </Text>
          <Text className="mt-0.5 text-xs text-muted">
            {t('create_modal.browse_description')}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function CenteredCardLayout({ visible, onPickBlank, onPickBrowse, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <BottomSheetShell visible={visible} onRequestClose={onClose} animationType="fade">
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <Pressable
          onPress={() => {}}
          className="w-full max-w-md rounded-2xl bg-surface p-6 dark:bg-surface-dark"
        >
          <Text className="text-xl font-bold text-ink dark:text-ink-dark">
            {t('create_modal.title')}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {t('create_modal.subtitle')}
          </Text>
          <OptionRows
            onPickBlank={() => {
              onClose();
              onPickBlank();
            }}
            onPickBrowse={() => {
              onClose();
              onPickBrowse();
            }}
          />
          <Pressable
            onPress={onClose}
            className="mt-4 items-center rounded-xl border border-line py-3 dark:border-line-dark"
          >
            <Text className="text-sm font-medium text-muted">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </BottomSheetShell>
  );
}

function BottomSheetLayout({ visible, onPickBlank, onPickBrowse, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isTablet, contentWidth } = useTablet();
  const translateY = useSharedValue(1000);

  useEffect(() => {
    if (visible) {
      translateY.value = 1000;
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 300 });
      });
    }
  }, [visible]);

  const dismissSheet = useCallback(() => {
    translateY.value = withTiming(1000, { duration: 250 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose]);

  const pickAndDismiss = useCallback((pick: () => void) => {
    translateY.value = withTiming(1000, { duration: 250 }, () => {
      runOnJS(onClose)();
      runOnJS(pick)();
    });
  }, [onClose]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onUpdate((e) => {
        if (e.translationY > 0) translateY.value = e.translationY;
      })
      .onEnd((e) => {
        if (e.translationY > 200 || e.velocityY > 800) {
          translateY.value = withTiming(1000, { duration: 200 }, () => {
            runOnJS(onClose)();
          });
        } else {
          translateY.value = withTiming(0, { duration: 250 });
        }
      }),
    [onClose],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <BottomSheetShell visible={visible} onRequestClose={dismissSheet} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={dismissSheet} className="flex-1 justify-end bg-black/50">
          <GestureDetector gesture={panGesture}>
            <Animated.View
              className="rounded-t-3xl bg-surface px-6 pt-5 dark:bg-surface-dark"
              style={[
                { paddingBottom: Math.max(insets.bottom, 16) + 16, width: '100%' },
                isTablet ? { maxWidth: contentWidth, alignSelf: 'center' } : null,
                sheetAnimStyle,
              ]}
            >
              <Pressable onPress={() => {}}>
                <View className="mb-4 items-center">
                  <View className="h-1 w-10 rounded-full bg-line dark:bg-line-dark" />
                </View>

                <Text className="text-xl font-bold text-ink dark:text-ink-dark">
                  {t('create_modal.title')}
                </Text>
                <Text className="mt-1 text-sm text-muted">
                  {t('create_modal.subtitle')}
                </Text>

                <OptionRows
                  onPickBlank={() => pickAndDismiss(onPickBlank)}
                  onPickBrowse={() => pickAndDismiss(onPickBrowse)}
                />
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </BottomSheetShell>
  );
}
