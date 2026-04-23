import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface License {
  name: string;
  version: string;
  license: string;
}

const LICENSES: License[] = [
  { name: '@expo/vector-icons', version: '15.1.1', license: 'MIT' },
  { name: '@react-native-async-storage/async-storage', version: '2.2.0', license: 'MIT' },
  { name: '@react-native-community/netinfo', version: '11.4.1', license: 'MIT' },
  { name: '@react-native-google-signin/google-signin', version: '16.1.2', license: 'MIT' },
  { name: '@react-navigation/bottom-tabs', version: '7.15.9', license: 'MIT' },
  { name: '@react-navigation/elements', version: '2.9.14', license: 'MIT' },
  { name: '@react-navigation/native', version: '7.2.2', license: 'MIT' },
  { name: '@sentry/react-native', version: '7.2.0', license: 'MIT' },
  { name: '@supabase/supabase-js', version: '2.103.2', license: 'MIT' },
  { name: 'expo', version: '54.0.33', license: 'MIT' },
  { name: 'expo-constants', version: '18.0.13', license: 'MIT' },
  { name: 'expo-font', version: '14.0.11', license: 'MIT' },
  { name: 'expo-haptics', version: '15.0.8', license: 'MIT' },
  { name: 'expo-image', version: '3.0.11', license: 'MIT' },
  { name: 'expo-image-manipulator', version: '14.0.8', license: 'MIT' },
  { name: 'expo-image-picker', version: '17.0.10', license: 'MIT' },
  { name: 'expo-linking', version: '8.0.11', license: 'MIT' },
  { name: 'expo-localization', version: '17.0.8', license: 'MIT' },
  { name: 'expo-notifications', version: '0.32.16', license: 'MIT' },
  { name: 'expo-router', version: '6.0.23', license: 'MIT' },
  { name: 'expo-speech', version: '14.0.8', license: 'MIT' },
  { name: 'expo-splash-screen', version: '31.0.13', license: 'MIT' },
  { name: 'expo-sqlite', version: '16.0.10', license: 'MIT' },
  { name: 'expo-status-bar', version: '3.0.9', license: 'MIT' },
  { name: 'expo-tracking-transparency', version: '55.0.13', license: 'MIT' },
  { name: 'expo-updates', version: '29.0.16', license: 'MIT' },
  { name: 'expo-web-browser', version: '15.0.10', license: 'MIT' },
  { name: 'i18next', version: '26.0.5', license: 'MIT' },
  { name: 'nativewind', version: '4.2.3', license: 'MIT' },
  { name: 'react', version: '19.1.0', license: 'MIT' },
  { name: 'react-i18next', version: '17.0.3', license: 'MIT' },
  { name: 'react-native', version: '0.81.5', license: 'MIT' },
  { name: 'react-native-draggable-flatlist', version: '4.0.3', license: 'MIT' },
  { name: 'react-native-gesture-handler', version: '2.28.0', license: 'MIT' },
  { name: 'react-native-google-mobile-ads', version: '16.3.2', license: 'Apache-2.0' },
  { name: 'react-native-purchases', version: '10.0.1', license: 'MIT' },
  { name: 'react-native-reanimated', version: '4.1.7', license: 'MIT' },
  { name: 'react-native-safe-area-context', version: '5.6.2', license: 'MIT' },
  { name: 'react-native-screens', version: '4.16.0', license: 'MIT' },
  { name: 'react-native-url-polyfill', version: '3.0.0', license: 'MIT' },
  { name: 'react-native-worklets', version: '0.5.1', license: 'MIT' },
  { name: 'zustand', version: '5.0.12', license: 'MIT' },
];

function openNpm(name: string) {
  Linking.openURL(`https://www.npmjs.com/package/${name}`);
}

export default function LicensesScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={LICENSES}
        keyExtractor={(item) => item.name}
        contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
        ListHeaderComponent={
          <>
            <View className="flex-row items-center">
              <Pressable onPress={() => router.back()} className="mr-2 p-1">
                <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
              </Pressable>
              <Text className="text-3xl font-bold text-black dark:text-white">
                {t('settings.licenses')}
              </Text>
            </View>
            <Text className="mt-4 mb-4 text-sm text-gray-500">
              {t('settings.licenses_description', { count: LICENSES.length })}
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openNpm(item.name)}
            className="flex-row items-center border-b border-gray-100 py-3 dark:border-gray-800"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-black dark:text-white">{item.name}</Text>
              <Text className="mt-0.5 text-xs text-gray-400">{item.version} · {item.license}</Text>
            </View>
            <MaterialIcons name="open-in-new" size={16} color="#9ca3af" />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
