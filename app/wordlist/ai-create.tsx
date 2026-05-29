import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';

export default function WordlistAiCreateScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <View className="flex-row items-center px-6 pt-2">
        <Pressable onPress={() => router.back()} className="mr-2 p-1">
          <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
        </Pressable>
        <Text className="text-3xl font-bold text-ink dark:text-ink-dark">
          {t('ai_create.title')}
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <MaterialIcons name="auto-awesome" size={64} color="#2EC4A5" />
        <Text className="mt-4 text-center text-base text-muted">
          {t('ai_create.coming_soon')}
        </Text>
      </View>
      </TabletContainer>
    </SafeAreaView>
  );
}
