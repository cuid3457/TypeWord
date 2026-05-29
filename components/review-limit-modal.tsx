import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetShell } from '@/components/bottom-sheet-shell';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface Props {
  visible: boolean;
  canWatchAd: boolean;
  onWatchAd: () => void;
  onPremium: () => void;
  onEnd: () => void;
}

export function ReviewLimitModal({
  visible,
  canWatchAd,
  onWatchAd,
  onPremium,
  onEnd,
}: Props) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();

  return (
    <BottomSheetShell visible={visible} onRequestClose={() => {}} animationType="fade">
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full max-w-md rounded-2xl bg-surface p-6 dark:bg-surface-dark">
          <View className="items-center">
            <View className="rounded-full bg-warm-amber-soft p-3 dark:bg-warm-amber-soft-dark">
              <MaterialIcons name="lock-clock" size={32} color="#D9A441" />
            </View>
            <Text className="mt-4 text-center text-lg font-bold text-ink dark:text-ink-dark">
              {t('review_limit.title')}
            </Text>
            <Text className="mt-2 text-center text-sm text-muted">
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
              <View>
                <Pressable
                  onPress={onWatchAd}
                  className="flex-row items-center rounded-xl border border-line py-4 px-4 dark:border-line-dark"
                >
                  <MaterialIcons name="play-circle-outline" size={20} color="#7B7366" />
                  <Text className="ml-3 flex-1 text-base font-medium text-ink dark:text-ink-dark">
                    {t('review_limit.watch_ad')}
                  </Text>
                </Pressable>
                <Text className="mt-1.5 text-center text-xs text-faint">
                  {t('review_limit.watch_ad_hint')}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={onEnd}
              className="items-center py-3"
            >
              <Text className="text-sm text-faint">
                {t('review_limit.end_session')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </BottomSheetShell>
  );
}
