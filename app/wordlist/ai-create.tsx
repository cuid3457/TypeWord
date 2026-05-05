import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WordlistAiCreateScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-6 pt-2">
        <Pressable onPress={() => router.back()} className="mr-2 p-1">
          <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
        </Pressable>
        <Text className="text-3xl font-bold text-black dark:text-white">
          {t('ai_create.title')}
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <MaterialIcons name="auto-awesome" size={64} color="#2EC4A5" />
        <Text className="mt-4 text-center text-base text-gray-500">
          {t('ai_create.coming_soon')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
