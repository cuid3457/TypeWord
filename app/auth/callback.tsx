import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useGlobalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@src/api/supabase';

async function handleDeepLink(url: string) {
  const fragment = url.split('#')[1];
  if (!fragment) return;
  const qs = new URLSearchParams(fragment);
  const accessToken = qs.get('access_token');
  const refreshToken = qs.get('refresh_token');
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
}

export default function AuthCallback() {
  useEffect(() => {
    (async () => {
      try {
        // Try initial URL (cold start)
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl?.includes('auth/callback')) {
          await handleDeepLink(initialUrl);
        }

        // Also listen for incoming URL (warm start)
        const sub = Linking.addEventListener('url', async (e) => {
          if (e.url.includes('auth/callback')) {
            await handleDeepLink(e.url);
          }
        });

        // Small delay to ensure session is set
        await new Promise((r) => setTimeout(r, 500));
        sub.remove();
      } catch {}
      router.replace('/(tabs)/settings');
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
