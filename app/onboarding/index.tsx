import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingWelcome() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-1 justify-between px-6 pb-8 pt-12">
        <View>
          <Text className="text-4xl font-bold text-black dark:text-white">
            TypeWord
          </Text>
          <Text className="mt-3 text-lg text-gray-600 dark:text-gray-300">
            {t('onboarding.welcome.description')}
          </Text>
          <View className="mt-10 gap-5">
            <Bullet icon="search" text={t('onboarding.welcome.bullet1')} />
            <Bullet icon="sort" text={t('onboarding.welcome.bullet2')} />
            <Bullet icon="refresh" text={t('onboarding.welcome.bullet3')} />
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/onboarding/setup')}
          className="items-center rounded-xl bg-black py-4 dark:bg-white"
        >
          <Text className="text-base font-semibold text-white dark:text-black">
            {t('onboarding.start')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Bullet({ icon, text }: { icon: string; text: string }) {
  return (
    <View className="flex-row items-center">
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <MaterialIcons
          name={icon as keyof typeof MaterialIcons.glyphMap}
          size={20}
          color="#6b7280"
        />
      </View>
      <Text className="flex-1 text-base text-black dark:text-white">{text}</Text>
    </View>
  );
}
