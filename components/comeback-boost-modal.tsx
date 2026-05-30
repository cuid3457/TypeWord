import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheetShell } from '@/components/bottom-sheet-shell';

interface ComebackBoostModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ComebackBoostModal({ visible, onClose }: ComebackBoostModalProps) {
  const { t } = useTranslation();

  return (
    <BottomSheetShell
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
    >
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50"
        style={{ paddingHorizontal: 23 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full max-w-md rounded-2xl bg-surface p-6 dark:bg-surface-dark"
        >
          <View className="items-center">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-[#2EC4A510]">
              <MaterialIcons name="waving-hand" size={32} color="#2EC4A5" />
            </View>
            <Text className="text-lg font-bold text-ink dark:text-ink-dark">
              {t('comeback.title')}
            </Text>
            <Text className="mt-2 text-center text-sm leading-5 text-muted">
              {t('comeback.subtitle')}
            </Text>
          </View>

          <View className="mt-5 rounded-xl border border-[#2EC4A5] bg-[#2EC4A510] p-4">
            <View className="flex-row items-start gap-3">
              <MaterialIcons name="bolt" size={22} color="#2EC4A5" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                  {t('comeback.reward_points_title')}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  {t('comeback.reward_points_desc')}
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row items-start gap-3">
              <MaterialIcons name="ac-unit" size={22} color="#2EC4A5" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                  {t('comeback.reward_freeze_title')}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  {t('comeback.reward_freeze_desc')}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={onClose}
            className="mt-5 items-center rounded-xl bg-ink py-3 dark:bg-ink-dark"
          >
            <Text className="text-sm font-semibold text-canvas dark:text-canvas-dark">
              {t('comeback.cta')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </BottomSheetShell>
  );
}
