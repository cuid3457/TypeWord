import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { submitReport } from '@src/services/reportService';

type Reason = 'wrong_meaning' | 'wrong_example' | 'other';

interface Props {
  visible: boolean;
  onClose: () => void;
  word: string;
  wordId?: string;
  context: 'search' | 'detail' | 'review';
  onSubmitted?: (thanksMessage: string) => void;
}

const REASONS: Reason[] = ['wrong_meaning', 'wrong_example', 'other'];

export function ReportModal({ visible, onClose, word, wordId, context, onSubmitted }: Props) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [reason, setReason] = useState<Reason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 1000;
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 300 });
      });
    }
  }, [visible]);

  const hideSheet = useCallback(() => {
    setReason(null);
    setDescription('');
    onClose();
  }, [onClose]);

  const dismissSheet = useCallback(() => {
    translateY.value = withTiming(1000, { duration: 250 }, () => {
      runOnJS(hideSheet)();
    });
  }, [hideSheet]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onUpdate((e) => {
        if (e.translationY > 0) translateY.value = e.translationY;
      })
      .onEnd((e) => {
        if (e.translationY > 400 || e.velocityY > 800) {
          translateY.value = withTiming(1000, { duration: 200 }, () => {
            runOnJS(hideSheet)();
          });
        } else {
          translateY.value = withTiming(0, { duration: 250 });
        }
      }),
    [hideSheet],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    await submitReport({ word, wordId, reason, description: description.trim(), context });
    setSubmitting(false);
    const idx = Math.floor(Math.random() * 3) + 1;
    const msg = t(`report.thanks_${idx}`);
    setReason(null);
    setDescription('');
    onClose();
    onSubmitted?.(msg);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable
          onPress={dismissSheet}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                {
                  backgroundColor: dark ? '#1a1a2e' : '#fff',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingHorizontal: 24,
                  paddingTop: 20,
                  paddingBottom: Math.max(insets.bottom, 16) + 16,
                },
                sheetAnimStyle,
              ]}
            >
              <Pressable onPress={() => {}}>
                {/* Drag handle */}
                <View className="mb-4 items-center">
                  <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                </View>

                {/* Title */}
                <Text className="text-lg font-bold text-black dark:text-white">
                  {t('report.title')}
                </Text>
                <Text className="mt-1 text-sm text-gray-500">
                  "{word}"
                </Text>

                {/* Reason buttons */}
                <View className="mt-5 gap-2">
                  {REASONS.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setReason(r)}
                      className={`flex-row items-center rounded-xl border-2 px-4 py-3 ${
                        reason === r
                          ? 'border-[#2EC4A5]'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <MaterialIcons
                        name={reason === r ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={reason === r ? '#2EC4A5' : '#9ca3af'}
                      />
                      <Text className="ml-3 text-base text-black dark:text-white">
                        {t(`report.${r}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Description */}
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('report.description_placeholder')}
                  placeholderTextColor="#9ca3af"
                  multiline
                  className="mt-4 rounded-xl border border-gray-200 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />

                {/* Submit */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={!reason || submitting}
                  className={`mt-4 items-center rounded-xl py-4 ${
                    !reason || submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-black dark:bg-white'
                  }`}
                >
                  {submitting ? (
                    <ActivityIndicator color={dark ? '#000' : '#fff'} />
                  ) : (
                    <Text className={`text-base font-semibold ${
                      !reason ? 'text-gray-400' : 'text-white dark:text-black'
                    }`}>
                      {t('report.submit')}
                    </Text>
                  )}
                </Pressable>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
