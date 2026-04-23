import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface Props {
  visible: boolean;
  modeName: string;
  canWatchAd: boolean;
  onWatchAd: () => void;
  onPremium: () => void;
  onSwitchMode: () => void;
  onEnd: () => void;
}

export function ReviewLimitModal({
  visible,
  modeName,
  canWatchAd,
  onWatchAd,
  onPremium,
  onSwitchMode,
  onEnd,
}: Props) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full rounded-2xl bg-white p-6 dark:bg-gray-900">
          <View className="items-center">
            <View className="rounded-full bg-amber-100 p-3 dark:bg-amber-900">
              <MaterialIcons name="lock-clock" size={32} color="#f59e0b" />
            </View>
            <Text className="mt-4 text-center text-lg font-bold text-black dark:text-white">
              {t('review_limit.title', { mode: modeName })}
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              {t('review_limit.description')}
            </Text>
          </View>

          <View className="mt-6 gap-3">
            <Pressable
              onPress={onPremium}
              className="flex-row items-center rounded-xl py-4 px-4"
              style={{ backgroundColor: '#2EC4A5' }}
            >
              <MaterialIcons name="star" size={20} color="#fff" />
              <Text className="ml-3 flex-1 text-base font-semibold text-white">
                {t('review_limit.premium')}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color="#fff" />
            </Pressable>

            {canWatchAd ? (
              <Pressable
                onPress={onWatchAd}
                className="flex-row items-center rounded-xl border border-gray-300 py-4 px-4 dark:border-gray-700"
              >
                <MaterialIcons name="play-circle-outline" size={20} color="#6b7280" />
                <Text className="ml-3 flex-1 text-base font-medium text-black dark:text-white">
                  {t('review_limit.watch_ad')}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={onSwitchMode}
              className="flex-row items-center rounded-xl border border-gray-300 py-4 px-4 dark:border-gray-700"
            >
              <MaterialIcons name="swap-horiz" size={20} color="#6b7280" />
              <Text className="ml-3 flex-1 text-base font-medium text-black dark:text-white">
                {t('review_limit.switch_mode')}
              </Text>
            </Pressable>

            <Pressable
              onPress={onEnd}
              className="items-center py-3"
            >
              <Text className="text-sm text-gray-400">
                {t('review_limit.end_session')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
