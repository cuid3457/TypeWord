import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';

export default function OnboardingWelcome() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <TabletContainer>
      <View className="flex-1 justify-between px-6 pb-8 pt-12">
        <View>
          <View className="items-center">
            <View className="h-36 w-36 items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
              <Image
                source={require('../../assets/images/android-icon-foreground.png')}
                style={{ width: 116, height: 116 }}
                resizeMode="contain"
              />
            </View>
            <Text className="mt-6 text-4xl font-extrabold tracking-tight text-ink dark:text-ink-dark">
              MoaVoca
            </Text>
            <Text className="mt-3 text-center text-lg text-muted">
              {t('onboarding.welcome.description')}
            </Text>
          </View>
          <View className="mt-10 gap-5">
            <Bullet icon="search" text={t('onboarding.welcome.bullet1')} />
            <Bullet icon="sort" text={t('onboarding.welcome.bullet2')} />
            <Bullet icon="refresh" text={t('onboarding.welcome.bullet3')} />
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/onboarding/setup')}
          className="items-center rounded-xl bg-accent py-4"
        >
          <Text className="text-base font-bold text-white">
            {t('onboarding.start')}
          </Text>
        </Pressable>
      </View>
      </TabletContainer>
    </SafeAreaView>
  );
}

function Bullet({ icon, text }: { icon: string; text: string }) {
  return (
    <View className="flex-row items-center">
      <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-accent-soft dark:bg-accent-soft-dark">
        <MaterialIcons
          name={icon as keyof typeof MaterialIcons.glyphMap}
          size={20}
          color="#1E9E84"
        />
      </View>
      <Text className="flex-1 text-base text-ink dark:text-ink-dark">{text}</Text>
    </View>
  );
}
