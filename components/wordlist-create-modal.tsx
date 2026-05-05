/**
 * Entry-point sheet for creating a wordlist. Two paths:
 *   - blank: existing manual creation flow
 *   - browse: curated wordlist library (category + language picked inside)
 *
 * Slide-up bottom sheet with drag-to-dismiss — same pattern as
 * ReviewSettingsSheet and ReportModal for visual consistency.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={dismissSheet} className="flex-1 justify-end bg-black/50">
          <GestureDetector gesture={panGesture}>
            <Animated.View
              className="rounded-t-3xl bg-white px-6 pt-5 dark:bg-gray-900"
              style={[{ paddingBottom: Math.max(insets.bottom, 16) + 16 }, sheetAnimStyle]}
            >
              <Pressable onPress={() => {}}>
                <View className="mb-4 items-center">
                  <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                </View>

                <Text className="text-xl font-bold text-black dark:text-white">
                  {t('create_modal.title')}
                </Text>
                <Text className="mt-1 text-sm text-gray-500">
                  {t('create_modal.subtitle')}
                </Text>

                <View className="mt-5 gap-3">
                  <Pressable
                    onPress={() => pickAndDismiss(onPickBlank)}
                    className="flex-row items-center rounded-xl border-2 border-gray-200 p-4 dark:border-gray-700"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <MaterialIcons name="edit" size={22} color="#6b7280" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-base font-semibold text-black dark:text-white">
                        {t('create_modal.blank_title')}
                      </Text>
                      <Text className="mt-0.5 text-xs text-gray-500">
                        {t('create_modal.blank_description')}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => pickAndDismiss(onPickBrowse)}
                    className="flex-row items-center rounded-xl border-2 border-gray-200 p-4 dark:border-gray-700"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <MaterialIcons name="auto-stories" size={22} color="#6b7280" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-base font-semibold text-black dark:text-white">
                        {t('create_modal.browse_title')}
                      </Text>
                      <Text className="mt-0.5 text-xs text-gray-500">
                        {t('create_modal.browse_description')}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
