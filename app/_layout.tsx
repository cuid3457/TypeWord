import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments } from 'expo-router';
import * as Font from 'expo-font';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, DeviceEventEmitter, Modal, Platform, Pressable, Text, View } from 'react-native';
import { haptic } from '@src/services/hapticService';
import { rem } from 'react-native-css-interop';
import 'react-native-reanimated';
import { enableFreeze, enableScreens } from 'react-native-screens';
import '../global.css';
import '@src/services/uiDefaults';

// Disable react-native-screens optimizations. Default behavior
// detaches inactive screens from the native view hierarchy and
// freezes their React tree; the first time the user switches to a
// tab, both must be reversed, producing a single-frame flicker even
// with `lazy: false`. Turning both off keeps every tab fully attached
// and rendered for the lifetime of the session.
enableScreens(false);
enableFreeze(false);
import { deviceLang, ensureLanguageLoaded } from '@src/i18n';

import MaterialIconsFont from '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf';

SplashScreen.preventAutoHideAsync();

import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineBanner } from '@/components/offline-banner';
import { SplashOverlay } from '@/components/splash-overlay';
import { useColorScheme, syncTheme } from '@/hooks/use-color-scheme';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { requestAdsConsent } from '@src/services/adsConsent';
import { setupAudioMode } from '@src/services/audio';
import { ensureSession, confirmAndSetSessionFromDeepLink } from '@src/services/authService';
import { refreshDashboard } from '@src/services/dashboardCache';
import { refreshHome } from '@src/services/homeCache';
import { refreshLibrary } from '@src/services/libraryCache';
import { refreshReview } from '@src/services/reviewCache';
import { supabase } from '@src/api/supabase';
import { captureError, initSentry, setUser } from '@src/services/sentry';
import { initEdgeWarmup } from '@src/services/edgeWarmup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalData, getDb } from '@src/db';
import { markCelebrated, markDailyCelebrated, getDailyEmoji, CELEBRATE_EVENT, type CelebrateInfo } from '@src/services/streakMilestone';
import { getTodayStreakDate } from '@src/services/streakService';
import { initSubscription, identifyUser, resetUser, refreshBonusPremium } from '@src/services/subscriptionService';
import { initXP, resetXP } from '@src/services/xpService';
import { preloadSfx } from '@src/services/sfxService';
import { syncAll } from '@src/services/syncService';
import { syncUserWordsContent } from '@src/services/userWordsSyncService';
import { sweepTtsPrefetch } from '@src/services/ttsPrefetchSweeper';

// iOS renders SF Pro slightly tighter than Roboto on Android at the same
// numerical size, so users perceive iPhone text as smaller than Galaxy.
// Bump the iOS base by 10% to bring the two platforms closer together.
const PLATFORM_FONT_MULTIPLIER = Platform.OS === 'ios' ? 1.10 : 1.0;
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
      haptic.success();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    initSentry();
    const fontsReady = Font.loadAsync({
      material: MaterialIconsFont,
      'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
      'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
      'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
      'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
      'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
    }).catch(captureError);
    setupAudioMode().catch(captureError);
    getDb().catch(captureError);

    // Hold the splash until SQLite-only caches (home/review) are
    // populated so the default-route mount doesn't render a spinner.
    // Auth-dependent caches (dashboard/library) prefetch in parallel
    // without blocking splash — for an existing session ensureSession
    // resolves near-instantly and the prefetches complete well before
    // the user taps another tab.
    const splashTimeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 2000);
    Promise.allSettled([
      fontsReady,
      refreshHome().catch(() => {}),
      refreshReview().catch(() => {}),
    ]).finally(() => {
      clearTimeout(splashTimeout);
      SplashScreen.hideAsync().catch(() => {});
    });

    ensureSession()
      .then(() => Promise.allSettled([refreshDashboard(), refreshLibrary()]))
      .catch(captureError);

    // Push token registration is deferred so it can never block startup
    // (iOS native push registration can throw during bridge teardown,
    // which would surface as a launch crash). 4-second delay clears the
    // boot-critical window.
    const pushTimer = setTimeout(() => {
      (async () => {
        try {
          const { supabase } = await import('@src/api/supabase');
          const { data: session } = await supabase.auth.getSession();
          const u = session.session?.user;
          if (!u || u.is_anonymous) return;
          const { getDevicePushToken } = await import('@src/services/notificationService');
          const { syncPushTokenToProfile } = await import('@src/services/friendsService');
          const tok = await getDevicePushToken();
          if (tok) await syncPushTokenToProfile(tok.token, tok.platform);
        } catch { /* silent — push is best-effort */ }
      })();
    }, 4000);

    requestAdsConsent().catch(() => {});
    initSubscription().catch(captureError);
    refreshBonusPremium().catch(captureError);
    initXP().catch(captureError);
    syncAll().catch(captureError);
    // Refresh all locally-stored user_words against the server's canonical
    // word_entries cache via the bulk sync-user-words RPC. Throttled to
    // once per 24h, deferred 6s so it doesn't compete with first-paint.
    // (curatedSync was removed 2026-05-14 — this single mechanism covers
    // both curated and non-curated words.)
    setTimeout(() => { syncUserWordsContent().catch(() => {}); }, 6000);
    // Ensure every user_word's mp3 is locally cached. On the originating
    // device the import paths already prefetched; this catches the
    // cross-device sync case where pullWords brings down data without
    // audio. Throttled to once per 24h; deferred further (4s) so it
    // never competes with sync or first-paint work.
    setTimeout(() => { sweepTtsPrefetch().catch(() => {}); }, 4000);
    initEdgeWarmup();
    // SFX players are decoded once at boot so first correct/wrong has no
    // file-decode latency — silent failure is fine, playSfx is a no-op.
    preloadSfx().catch(() => {});

    // Hydrate points + inventory, then reconcile any freezes the user
    // should have consumed for past missed days while offline. Deferred
    // so it never delays boot-critical work.
    setTimeout(() => {
      (async () => {
        try {
          const { refreshInventory } = await import('@src/services/pointsService');
          await refreshInventory();
          const { reconcileStreakFreezeConsumption } = await import('@src/services/streakService');
          await reconcileStreakFreezeConsumption();
        } catch { /* silent */ }
      })();
    }, 3000);
  }, []);

  // Push tap handler. When the user taps a friend-request / poke /
  // friend-accepted push notification, route them to the notifications
  // page. Fires whether the app was backgrounded or cold-started by the
  // tap.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const handle = (data: unknown) => {
          if (!data || typeof data !== 'object') return;
          const type = (data as { type?: unknown }).type;
          if (type === 'friend_request' || type === 'poke' || type === 'friend_accepted') {
            router.push('/notifications');
          }
        };
        // Cold-start case: the app was launched by tapping a notification.
        const last = await Notifications.getLastNotificationResponseAsync();
        if (!cancelled && last) handle(last.notification.request.content.data);
        sub = Notifications.addNotificationResponseReceivedListener((resp) => {
          handle(resp.notification.request.content.data);
        });
      } catch { /* expo-notifications unavailable — silent */ }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // User-switch guard: if the new session is a different user than
        // the one whose data is in local SQLite, wipe the local DB before
        // syncAll. Without this, OAuth popup-driven account switches
        // never emit SIGNED_OUT — supabase replaces the session in place
        // — so clearLocalData() is never called between users. The next
        // syncAll → pushWords then takes the OLD user's local rows,
        // stamps them with the NEW user_id (line 282-283 of syncService),
        // and uploads them to the server under the wrong account.
        //
        // Async, but kicked off before syncAll so the clear completes
        // first. We chain syncAll inside the .then to preserve order.
        const newUserId = session?.user?.id ?? null;
        const initAndSync = (async () => {
          // User-switch wipe: OAuth popup sign-in replaces the session
          // in place without emitting SIGNED_OUT, so clearLocalData()
          // never runs between users. The next syncAll → pushWords then
          // takes the previous user's local rows, stamps them with the
          // NEW user_id (wordRowToRecord), and pushes them under the
          // wrong account. Detect via a stored user-id sentinel.
          // Static imports — dynamic await import('@src/db') was failing in
          // the Hermes/Metro release bundle (the alias never resolved at
          // runtime), so `clearLocalData` came back undefined and the
          // following call became `undefined()` → TypeError caught by the
          // root ErrorBoundary, blanking every screen mounted afterward.
          try {
            const LAST_USER_KEY = 'typeword.lastSignedInUserId';
            const prevUserId = await AsyncStorage.getItem(LAST_USER_KEY);
            if (newUserId && prevUserId && prevUserId !== newUserId) {
              await clearLocalData();
            }
            if (newUserId) await AsyncStorage.setItem(LAST_USER_KEY, newUserId);
          } catch (err) {
            captureError(err, { service: '_layout', fn: 'signedIn:userSwitchGuard' });
          }

          // SIGNED_IN: force XP cloud reconcile. xpService's `_initialized`
          // guard otherwise blocks fetchCloudXp on every call after the
          // first — and the boot-time initXP at line 129 fires before
          // session restoration completes (auth.uid()=null → cloud
          // returns 0), permanently locking _total at 0. resetXP flips
          // the guard back so the in-handler initXP() refetches.
          // TOKEN_REFRESHED skips the reset to avoid flickering XP to 0
          // on every hourly token refresh.
          if (event === 'SIGNED_IN') {
            resetXP();
          }

          // Parallel: syncAll for table data, initXP for cloud XP.
          await Promise.allSettled([syncAll(), initXP()]);
        })();

        // After pulling fresh data into SQLite, refresh every tab cache
        // so the screens update immediately — without this, a user who
        // was sitting on the wordlist tab during sign-in saw the empty
        // state until they manually pulled to refresh.
        initAndSync
          .catch((e) => captureError(e, { service: '_layout', fn: 'signedIn:initAndSync' }))
          .finally(() => Promise.allSettled([
            refreshHome(),
            refreshDashboard(),
            refreshLibrary(),
            refreshReview(),
          ]));
        if (session?.user) {
          setUser(session.user.id);
          if (!session.user.is_anonymous) {
            identifyUser(session.user.id).catch(captureError);
            // Push token registration is deferred to the boot-time setTimeout
            // (see ensureSession block) so we never run native push
            // registration synchronously off the critical path. Fresh
            // sign-ins also pick it up on the next app launch.
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
        // Drop in-memory module-level state that survives signOut
        // because AsyncStorage clears don't touch JS module caches.
        // xpService's `_total` was the visible bug: after Google
        // logout, dashboard still showed "12 Lv / 7,636 XP" because
        // `_total` and `_initialized` were never reset.
        resetXP();
        // Refresh every tab cache from the now-cleared SQLite so the
        // dashboard/wordlist/library/review screens drop the previous
        // user's data immediately instead of leaking it until the next
        // tab focus. `clearLocalData()` (called by signOut) wipes the
        // tables first; these refreshes then propagate empty snapshots
        // to subscribers.
        Promise.allSettled([
          refreshHome(),
          refreshDashboard(),
          refreshLibrary(),
          refreshReview(),
        ]).catch(() => {});
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

  // Refresh on foreground return:
  //   1. syncAll (60s throttled here) — picks up new books/words from
  //      other devices or server-side seed scripts. Without this the
  //      app only catches new top-level rows on cold-restart.
  //   2. syncUserWordsContent — 12h-throttled internally; refreshes
  //      result_json of rows already present locally.
  //   3. syncCuratedBooks — 5-min throttled internally; admin
  //      re-curations propagate without waiting for next launch.
  // syncAll itself is cheap when nothing changed (the gt('updated_at',
  // since) pull queries return empty fast) but the network round-trip
  // adds up across rapid task-switching, so we cap the foreground
  // trigger to one call per minute.
  useEffect(() => {
    let lastFgSyncAllAt = 0;
    const FG_SYNCALL_THROTTLE_MS = 60_000;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Re-assert the iOS audio session on every foreground. Interruptions
        // (calls, Siri, other audio apps, route changes) can leave the
        // AVAudioSession in a quiet category; the boot-time setupAudioMode no
        // longer holds. Idempotent and unthrottled — cheap insurance that TTS
        // stays loud after the app regains focus.
        setupAudioMode().catch(() => {});
        const now = Date.now();
        if (now - lastFgSyncAllAt >= FG_SYNCALL_THROTTLE_MS) {
          lastFgSyncAllAt = now;
          syncAll()
            .then(() => {
              // useFocusEffect only refires on tab change. When the user
              // is sitting on the wordlist/review tab as the app returns
              // to foreground, the cache stays stale until they navigate
              // away and back. Refresh both SQLite-backed caches here so
              // newly-pulled books/words surface immediately.
              refreshHome().catch(() => {});
              refreshReview().catch(() => {});
            })
            .catch(captureError);
        }
        syncUserWordsContent().catch(() => {});
        (async () => {
          try {
            const { syncCuratedBooks } = await import('@src/services/curatedSyncService');
            await syncCuratedBooks();
          } catch { /* silent */ }
        })();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (!url.includes('auth/callback')) return;
      const [path, fragment] = url.split('#');
      if (!fragment) return;
      const fragParams = new URLSearchParams(fragment);
      const accessToken = fragParams.get('access_token');
      const refreshToken = fragParams.get('refresh_token');
      // The state nonce arrives in the query (it's part of redirect_to,
      // preserved by Supabase verbatim) while the tokens arrive in the
      // fragment. Pull it from the path side.
      const queryStr = path.split('?')[1] ?? '';
      const state = new URLSearchParams(queryStr).get('state');
      if (accessToken && refreshToken) {
        const { applied } = await confirmAndSetSessionFromDeepLink(accessToken, refreshToken, state);
        if (applied) router.replace('/(tabs)/settings');
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
    rem.set(REM_SCALE[size] * PLATFORM_FONT_MULTIPLIER);
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
            <Stack.Screen name="subscription" options={{ headerShown: false }} />
            <Stack.Screen name="terms" options={{ title: '' }} />
            <Stack.Screen name="privacy" options={{ title: '' }} />
          </Stack>
          <OfflineBanner />
        </View>
        <Modal visible={celebrateInfo !== null} animationType="fade" transparent statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <View style={{ width: '100%', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#1E1B15' : '#FCFBF7', borderRadius: 24, padding: 32 }}>
              {celebrateInfo?.type === 'milestone' ? (
                <>
                  <Text style={{ fontSize: 64 }}>🔥</Text>
                  <Text style={{ marginTop: 16, fontSize: 22, fontWeight: 'bold', color: colorScheme === 'dark' ? '#F1ECE2' : '#2A2620', textAlign: 'center' }}>
                    {t('streak.milestone_title')}
                  </Text>
                  <Text style={{ marginTop: 8, fontSize: 40, fontWeight: '900', color: '#D9A441', textAlign: 'center' }}>
                    {celebrateInfo.streak}{t('streak.milestone_days')}
                  </Text>
                  <Text style={{ marginTop: 16, fontSize: 14, color: '#A79E90', textAlign: 'center' }}>
                    {t('streak.milestone_reward')}
                  </Text>
                </>
              ) : celebrateInfo ? (
                <>
                  <Text style={{ fontSize: 64 }}>{getDailyEmoji(celebrateInfo.variant)}</Text>
                  <Text style={{ marginTop: 16, fontSize: 22, fontWeight: 'bold', color: colorScheme === 'dark' ? '#F1ECE2' : '#2A2620', textAlign: 'center' }}>
                    {t(`streak.daily_title_${celebrateInfo.variant + 1}`)}
                  </Text>
                  <Text style={{ marginTop: 8, fontSize: 32, fontWeight: '800', color: '#2EC4A5', textAlign: 'center' }}>
                    {celebrateInfo.streak}{t('streak.milestone_days')}
                  </Text>
                  <Text style={{ marginTop: 16, fontSize: 14, color: '#A79E90', textAlign: 'center' }}>
                    {t(`streak.daily_message_${celebrateInfo.variant + 1}`)}
                  </Text>
                </>
              ) : null}
              <Pressable
                onPress={async () => {
                  haptic.selection();
                  if (celebrateInfo?.type === 'milestone') {
                    await markCelebrated(celebrateInfo.streak);
                  } else {
                    await markDailyCelebrated(getTodayStreakDate());
                  }
                  setCelebrateInfo(null);
                }}
                style={{ marginTop: 24, width: '100%', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#F1ECE2' : '#2A2620', borderRadius: 12, paddingVertical: 16 }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: colorScheme === 'dark' ? '#15130E' : '#F4F1EA' }}>
                  {t('streak.milestone_continue')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <SplashOverlay />
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
