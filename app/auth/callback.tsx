import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
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

/**
 * Auth callback page. Two modes:
 *
 *   1. Popup mode (web OAuth, our new default): the opener window
 *      launched us with `window.open(url, 'moavoca_oauth', ...)`. We
 *      parse tokens from the URL fragment, postMessage them back to
 *      the opener, then close ourselves. The opener applies the
 *      session on its own (long-lived) Supabase client — the main
 *      page never reloads, OPFS access handle stays valid.
 *
 *   2. Deep-link / full-page mode (native + legacy fallback): set the
 *      session on this client, then navigate to /(tabs)/settings.
 */
export default function AuthCallback() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.opener) {
      // Popup mode — message tokens to opener and close.
      try {
        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const query = window.location.search.startsWith('?')
          ? window.location.search.slice(1)
          : window.location.search;
        const fragParams = new URLSearchParams(hash);
        const queryParams = new URLSearchParams(query);
        const payload: Record<string, string> = { source: 'moavoca-oauth' };
        const errCode = fragParams.get('error') ?? queryParams.get('error');
        if (errCode) {
          payload.error = fragParams.get('error_description') ?? queryParams.get('error_description') ?? errCode;
        } else {
          const accessToken = fragParams.get('access_token');
          const refreshToken = fragParams.get('refresh_token');
          const code = queryParams.get('code');
          if (accessToken && refreshToken) {
            payload.access_token = accessToken;
            payload.refresh_token = refreshToken;
          } else if (code) {
            payload.code = code;
          } else {
            payload.error = 'no_tokens';
          }
        }
        window.opener.postMessage(payload, window.location.origin);
      } catch (e) {
        try {
          window.opener.postMessage(
            { source: 'moavoca-oauth', error: e instanceof Error ? e.message : 'callback_error' },
            window.location.origin,
          );
        } catch { /* opener gone — nothing to do */ }
      }
      // Close shortly so the opener has time to receive the message.
      setTimeout(() => { try { window.close(); } catch { /* no-op */ } }, 50);
      return;
    }

    // Non-popup fallback (native deep links, or web users who landed
    // here without an opener — e.g. directly pasted URL).
    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl?.includes('auth/callback')) {
          await handleDeepLink(initialUrl);
        }

        const sub = Linking.addEventListener('url', async (e) => {
          if (e.url.includes('auth/callback')) {
            await handleDeepLink(e.url);
          }
        });

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
