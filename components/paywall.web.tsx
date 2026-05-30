/**
 * Web variant of the premium paywall. Web checkout is intentionally
 * absent in v1 — Apple/Google IAP remains the only purchase path. This
 * screen shows the value proposition and directs users to the mobile
 * app for actual subscription.
 *
 * Anti-steering note: this is the web app linking OUT to the mobile
 * app's store listing. That's allowed. Apple/Google only restrict the
 * opposite direction (mobile app linking out to web payments).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePremium } from '@src/hooks/usePremium';
import {
  purchaseAnnual,
  purchaseMonthly,
  refreshBonusPremium,
} from '@src/services/subscriptionService';

// Phase 2 web checkout. When EXPO_PUBLIC_WEB_CHECKOUT_PROVIDER is unset or
// 'none', we hide the web-buy buttons and keep the mobile-store CTAs. When
// set to 'paddle' / 'toss' / etc, subscriptionService.web.ts routes through
// the corresponding hosted checkout.
const WEB_CHECKOUT_PROVIDER = (process.env.EXPO_PUBLIC_WEB_CHECKOUT_PROVIDER ?? 'none') as
  | 'none'
  | 'paddle'
  | 'toss'
  | 'stripe';
const WEB_CHECKOUT_ENABLED = WEB_CHECKOUT_PROVIDER !== 'none';

// Until the app ships to the stores with public listings, the search
// URLs work for both web (returns the search results page) and as
// universal links on the respective device (opens the store app).
// Once App Store / Play Console listings are live, swap with the
// canonical product URLs.
const STORE_URLS = {
  ios: 'https://apps.apple.com/search?term=MoaVoca',
  android: 'https://play.google.com/store/search?q=MoaVoca&c=apps',
};

export function Paywall() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const premium = usePremium();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const closePage = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      await refreshBonusPremium();
      // usePremium() updates reactively via its own subscription —
      // show a generic acknowledgement either way.
      setMessage(t('premium.status_refreshed') || 'Status refreshed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleWebPurchase = async (plan: 'monthly' | 'annual') => {
    setRefreshing(true);
    setMessage(null);
    try {
      const ok = plan === 'annual' ? await purchaseAnnual() : await purchaseMonthly();
      if (!ok) {
        setMessage(t('premium.web_checkout_unavailable') || 'Checkout temporarily unavailable');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const features = [
    { icon: 'all-inclusive' as const, text: t('premium.feature_unlimited') },
    { icon: 'photo-camera' as const, text: t('premium.feature_image') },
    { icon: 'folder' as const, text: t('premium.feature_wordlists') },
    { icon: 'file-download' as const, text: t('premium.feature_export') },
    { icon: 'block' as const, text: t('premium.feature_no_ads') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <TabletContainer>
      {/* Header */}
      <View style={{ paddingTop: 24, paddingHorizontal: 24 }}>
        <View className="mb-4 h-11 flex-row items-center">
          <Pressable
            onPress={closePage}
            className="mr-2 p-1"
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 32,
        }}
      >
        {/* Title */}
        <Text className="text-center text-2xl font-bold text-ink dark:text-ink-dark">
          MoaVoca {t('premium.title')}
        </Text>

        {/* Premium-active badge — shown when user already has an entitlement */}
        {premium ? (
          <View className="mt-6 items-center rounded-2xl border-2 border-[#2EC4A5] bg-[#2EC4A510] p-5">
            <MaterialIcons name="verified" size={40} color="#2EC4A5" />
            <Text className="mt-3 text-center text-base font-semibold text-ink dark:text-ink-dark">
              {t('premium.active')}
            </Text>
          </View>
        ) : null}

        {/* Features */}
        <View className="mt-6 gap-3">
          {features.map((f) => (
            <View key={f.icon} className="flex-row items-center">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-[#2EC4A520]">
                <MaterialIcons name={f.icon} size={20} color="#2EC4A5" />
              </View>
              <Text className="ml-3 flex-1 text-base text-ink dark:text-ink-dark">
                {f.text}
              </Text>
            </View>
          ))}
        </View>

        {/* Web CTA — subscribe in the mobile app (or directly on web when enabled) */}
        {!premium ? (
          <View className="mt-8">
            {WEB_CHECKOUT_ENABLED ? (
              <>
                <Pressable
                  onPress={() => handleWebPurchase('annual')}
                  disabled={refreshing}
                  className="flex-row items-center justify-center rounded-xl bg-[#2EC4A5] py-4"
                  accessibilityRole="button"
                  accessibilityLabel={t('premium.subscribe_annual') || 'Subscribe annual'}
                >
                  <Text className="text-base font-semibold text-white">
                    {t('premium.subscribe_annual') || 'Subscribe annual'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleWebPurchase('monthly')}
                  disabled={refreshing}
                  className="mt-3 flex-row items-center justify-center rounded-xl border border-[#2EC4A5] py-4"
                  accessibilityRole="button"
                  accessibilityLabel={t('premium.subscribe_monthly') || 'Subscribe monthly'}
                >
                  <Text className="text-base font-semibold text-[#2EC4A5]">
                    {t('premium.subscribe_monthly') || 'Subscribe monthly'}
                  </Text>
                </Pressable>
                <Text className="mt-4 text-center text-xs text-muted">
                  {t('premium.web_or_mobile') || 'Or use the mobile app:'}
                </Text>
              </>
            ) : (
              <Text className="text-center text-sm leading-5 text-muted">
                {t('premium.web_subscribe_in_app')}
              </Text>
            )}

            <Pressable
              onPress={() => Linking.openURL(STORE_URLS.ios)}
              className="mt-5 flex-row items-center justify-center rounded-xl bg-black py-4"
              accessibilityRole="link"
              accessibilityLabel="App Store"
            >
              <FontAwesome name="apple" size={22} color="#fff" style={{ marginTop: -2 }} />
              <Text className="ml-3 text-base font-semibold text-white">
                {t('premium.open_app_store')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => Linking.openURL(STORE_URLS.android)}
              className="mt-3 flex-row items-center justify-center rounded-xl border border-line py-4 dark:border-line-dark"
              accessibilityRole="link"
              accessibilityLabel="Google Play"
            >
              <MaterialIcons name="shop" size={22} color={dark ? '#fff' : '#000'} />
              <Text className="ml-3 text-base font-semibold text-ink dark:text-ink-dark">
                {t('premium.open_play_store')}
              </Text>
            </Pressable>

            {/* Refresh entitlement — for users who already subscribed on
                mobile and want their web session to reflect that. */}
            <Pressable
              onPress={handleRefreshStatus}
              disabled={refreshing}
              className="mt-4 items-center py-3"
            >
              {refreshing ? (
                <ActivityIndicator color="#7B7366" />
              ) : (
                <Text className="text-sm font-medium text-[#2EC4A5]">
                  {t('premium.web_refresh_status')}
                </Text>
              )}
            </Pressable>

            {message ? (
              <Text className="mt-2 text-center text-xs text-muted">{message}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      </TabletContainer>
    </SafeAreaView>
  );
}
