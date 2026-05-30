import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppModal } from '@/components/app-modal';
import { TabletContainer } from '@/components/tablet-container';
import { showAdsPrivacyOptions } from '@src/services/adsConsent';

interface Entry {
  key: string;
  onPress: () => void;
}

export default function LegalPoliciesScreen() {
  const { t } = useTranslation();
  const [adModal, setAdModal] = useState(false);

  const entries: Entry[] = [
    { key: 'terms', onPress: () => router.push('/terms') },
    { key: 'privacy', onPress: () => router.push('/privacy') },
    { key: 'probability_policy', onPress: () => router.push('/probability-policy') },
    { key: 'business_info', onPress: () => router.push('/business-info') },
    ...(Platform.OS !== 'web' ? [{
      key: 'ad_privacy',
      onPress: async () => {
        const shown = await showAdsPrivacyOptions();
        if (!shown) setAdModal(true);
      },
    }] : []),
    { key: 'licenses', onPress: () => router.push('/licenses') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
          <View className="h-11 flex-row items-center mb-4">
            <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityRole="button">
              <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
            </Pressable>
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">
              {t('settings.legal_policies')}
            </Text>
          </View>

          {entries.map((entry, i) => (
            <Pressable
              key={entry.key}
              onPress={entry.onPress}
              className={`flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-4 dark:border-line-dark dark:bg-surface-dark ${i === 0 ? '' : 'mt-3'}`}
              accessibilityRole="button"
            >
              <Text className="text-sm font-medium text-ink dark:text-ink-dark">
                {t(`settings.${entry.key}`)}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color="#7B7366" />
            </Pressable>
          ))}
        </ScrollView>
      </TabletContainer>

      <AppModal
        visible={adModal}
        title={t('settings.ad_privacy')}
        message={t('settings.ad_privacy_unavailable')}
        buttonText={t('review.check')}
        onClose={() => setAdModal(false)}
      />
    </SafeAreaView>
  );
}
