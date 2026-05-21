import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { confirmAndSetSessionFromDeepLink } from '@src/services/authService';

async function handleDeepLink(url: string) {
  const [path, fragment] = url.split('#');
  if (!fragment) return;
  const fragParams = new URLSearchParams(fragment);
  const accessToken = fragParams.get('access_token');
  const refreshToken = fragParams.get('refresh_token');
  if (!accessToken || !refreshToken) return;
  // State nonce travels in the query string (part of the redirect_to we
  // mint at sign-up time). Tokens travel in the fragment. A matching
  // state lets the auth helper apply the session silently.
  const queryStr = path.split('?')[1] ?? '';
  const state = new URLSearchParams(queryStr).get('state');
  await confirmAndSetSessionFromDeepLink(accessToken, refreshToken, state);
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
