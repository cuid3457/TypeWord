import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments } from 'expo-router';
import * as Font from 'expo-font';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceEventEmitter, Modal, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { rem } from 'react-native-css-interop';
import 'react-native-reanimated';
import '../global.css';
import { deviceLang, ensureLanguageLoaded } from '@src/i18n';

import MaterialIconsFont from '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf';

SplashScreen.preventAutoHideAsync();

import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineBanner } from '@/components/offline-banner';
import { useColorScheme, syncTheme } from '@/hooks/use-color-scheme';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { requestAdsConsent } from '@src/services/adsConsent';
import { setupAudioMode } from '@src/services/audio';
import { ensureSession } from '@src/services/authService';
import { supabase } from '@src/api/supabase';
import { captureError, initSentry, setUser } from '@src/services/sentry';
import { initEdgeWarmup } from '@src/services/edgeWarmup';
import { getDb } from '@src/db';
import { markCelebrated, markDailyCelebrated, getDailyEmoji, CELEBRATE_EVENT, type CelebrateInfo } from '@src/services/streakMilestone';
import { getTodayStreakDate } from '@src/services/streakService';
import { initSubscription, identifyUser, resetUser, refreshBonusPremium } from '@src/services/subscriptionService';
import { initXP } from '@src/services/xpService';
import { syncAll } from '@src/services/syncService';

const REM_SCALE = { small: 14, medium: 17, large: 20 } as const;

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { settings, loading } = useUserSettings();
  const { t, i18n } = useTranslation();
  const segments = useSegments();
  const [celebrateInfo, setCelebrateInfo] = useState<CelebrateInfo | null>(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CELEBRATE_EVENT, (info: CelebrateInfo) => {
      setCelebrateInfo(info);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    initSentry();
    SplashScreen.hideAsync();
    Font.loadAsync({ material: MaterialIconsFont }).catch(captureError);
    setupAudioMode().catch(captureError);
    ensureSession().catch(captureError);
    getDb().catch(captureError);
    requestAdsConsent().catch(() => {});
    initSubscription().catch(captureError);
    refreshBonusPremium().catch(captureError);
    initXP().catch(captureError);
    syncAll().catch(captureError);
    initEdgeWarmup();
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        syncAll().catch(captureError);
        if (session?.user) {
          setUser(session.user.id);
          if (!session.user.is_anonymous) {
            identifyUser(session.user.id).catch(captureError);
            // Resume pending invite flow: a user who tapped a typeword://invite/...
            // link while anonymous is sent through auth; once they're signed up
            // we re-route them back to the invite screen so the friend add +
            // bonus claim can proceed.
            (async () => {
              try {
                const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                const code = await AsyncStorage.getItem('typeword.pendingInviteCode');
                if (code) router.replace(`/invite/${code}`);
              } catch { /* no-op */ }
            })();
          }
          refreshBonusPremium().catch(captureError);
        }
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
        resetUser().catch(captureError);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let NI: typeof import('@react-native-community/netinfo').default;
    try { NI = require('@react-native-community/netinfo').default; } catch { return; }
    const netInfo = NI;
    let wasOffline = false;
    const unsub = netInfo.addEventListener((state) => {
      const connected = (state.isConnected && state.isInternetReachable) ?? false;
      if (connected && wasOffline) syncAll().catch(captureError);
      wasOffline = !connected;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (!url.includes('auth/callback')) return;
      const fragment = url.split('#')[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        router.replace('/(tabs)/settings');
      }
    };

    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (settings?.nativeLanguage) {
      ensureLanguageLoaded(settings.nativeLanguage);
      i18n.changeLanguage(settings.nativeLanguage);
    } else {
      ensureLanguageLoaded(deviceLang);
      i18n.changeLanguage(deviceLang);
    }
  }, [loading, settings?.nativeLanguage]);

  // Sync NativeWind dark/light mode with user's theme preference
  useEffect(() => {
    syncTheme(settings?.theme ?? 'system');
  }, [settings?.theme]);

  // Scale all rem-based sizes (text, spacing) based on user's font preference
  useEffect(() => {
    const size = settings?.fontSize ?? 'medium';
    rem.set(REM_SCALE[size]);
  }, [settings?.fontSize]);

  useEffect(() => {
    if (loading) return;
    const onOnboarding = segments[0] === 'onboarding';
    // Allow viewing the legal documents during onboarding without being
    // bounced back. The user must reach these from the onboarding consent
    // line before tapping "Get Started".
    const onLegalDoc = segments[0] === 'terms' || segments[0] === 'privacy';
    if (!settings && !onOnboarding && !onLegalDoc) {
      router.replace('/onboarding');
    } else if (settings && onOnboarding) {
      router.replace('/(tabs)');
      router.push('/wordlist/new');
    }
  }, [loading, settings, segments]);

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1 }}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="wordlist/new" options={{ title: '' }} />
            <Stack.Screen name="wordlist/library" options={{ headerShown: false }} />
            <Stack.Screen name="wordlist/library/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="wordlist/ai-create" options={{ headerShown: false }} />
            <Stack.Screen name="wordlist/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="wordlist/add/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="terms" options={{ title: '' }} />
            <Stack.Screen name="privacy" options={{ title: '' }} />
          </Stack>
          <OfflineBanner />
        </View>
        <Modal visible={celebrateInfo !== null} animationType="fade" transparent statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <View style={{ width: '100%', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#1a1a2e' : '#fff', borderRadius: 24, padding: 32 }}>
              {celebrateInfo?.type === 'milestone' ? (
                <>
                  <Text style={{ fontSize: 64 }}>🔥</Text>
                  <Text style={{ marginTop: 16, fontSize: 22, fontWeight: 'bold', color: colorScheme === 'dark' ? '#fff' : '#000', textAlign: 'center' }}>
                    {t('streak.milestone_title')}
                  </Text>
                  <Text style={{ marginTop: 8, fontSize: 40, fontWeight: '900', color: '#f59e0b', textAlign: 'center' }}>
                    {celebrateInfo.streak}{t('streak.milestone_days')}
                  </Text>
                  <Text style={{ marginTop: 16, fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
                    {t('streak.milestone_ad_free')}
                  </Text>
                </>
              ) : celebrateInfo ? (
                <>
                  <Text style={{ fontSize: 64 }}>{getDailyEmoji(celebrateInfo.variant)}</Text>
                  <Text style={{ marginTop: 16, fontSize: 22, fontWeight: 'bold', color: colorScheme === 'dark' ? '#fff' : '#000', textAlign: 'center' }}>
                    {t(`streak.daily_title_${celebrateInfo.variant + 1}`)}
                  </Text>
                  <Text style={{ marginTop: 8, fontSize: 32, fontWeight: '800', color: '#2EC4A5', textAlign: 'center' }}>
                    {celebrateInfo.streak}{t('streak.milestone_days')}
                  </Text>
                  <Text style={{ marginTop: 16, fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
                    {t(`streak.daily_message_${celebrateInfo.variant + 1}`)}
                  </Text>
                </>
              ) : null}
              <Pressable
                onPress={async () => {
                  if (celebrateInfo?.type === 'milestone') {
                    await markCelebrated(celebrateInfo.streak);
                  } else {
                    await markDailyCelebrated(getTodayStreakDate());
                  }
                  setCelebrateInfo(null);
                }}
                style={{ marginTop: 24, width: '100%', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#fff' : '#000', borderRadius: 12, paddingVertical: 16 }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: colorScheme === 'dark' ? '#000' : '#fff' }}>
                  {t('streak.milestone_continue')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
