import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform } from 'react-native';
import i18n from 'i18next';

import { supabase } from '@src/api/supabase';
import { getUserSettings } from '@src/storage/userSettings';
import { setUser } from './sentry';

const REDIRECT_URL = 'typeword://auth/callback';

// Nonce-based deep-link verification. When we initiate an email-confirm /
// magic-link flow we mint a one-time random `state` and embed it in the
// redirect URL. Supabase preserves query params on the callback, so when
// the link returns to us we can match the state against this stored value
// — a match means "we asked for this flow" and we apply the session
// silently. No match (e.g. an attacker-crafted link sent out of band)
// falls through to the confirm-modal path. TTL caps stale-nonce abuse.
const AUTH_NONCE_KEY = 'typeword.authNonce';
const AUTH_NONCE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — accommodates email-check delay

function generateNonce(): string {
  // Prefer crypto.getRandomValues when available (RN 0.74+ Hermes ships
  // WebCrypto). Falls back to Math.random — which is non-cryptographic
  // but adequate for an unguessable 192-bit value used inside a 24h
  // window. The nonce isn't a key; it's an "I started this" marker.
  try {
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
    if (c?.getRandomValues) {
      const bytes = new Uint8Array(24);
      c.getRandomValues(bytes);
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fall through */ }
  let hex = '';
  for (let i = 0; i < 48; i++) hex += (Math.random() * 16 | 0).toString(16);
  return hex;
}

async function mintAuthNonce(): Promise<string> {
  const nonce = generateNonce();
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(
      AUTH_NONCE_KEY,
      JSON.stringify({ nonce, createdAt: Date.now() }),
    );
  } catch { /* AsyncStorage failure → confirm-modal fallback later */ }
  return nonce;
}

async function consumeAuthNonceIfMatch(candidate: string | null): Promise<boolean> {
  if (!candidate) return false;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(AUTH_NONCE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { nonce?: string; createdAt?: number };
    const nonce = typeof parsed.nonce === 'string' ? parsed.nonce : null;
    const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : 0;
    if (!nonce || Date.now() - createdAt > AUTH_NONCE_TTL_MS) {
      await AsyncStorage.removeItem(AUTH_NONCE_KEY);
      return false;
    }
    if (nonce !== candidate) return false;
    // One-time use: consume immediately so a leaked link can't be replayed.
    await AsyncStorage.removeItem(AUTH_NONCE_KEY);
    return true;
  } catch {
    return false;
  }
}

// Lazy-configure: a top-level configure() call was previously crashing the
// iOS production build at launch (NSException raised from GIDSignIn
// signInWithOptions on import). Move the call inside a guarded helper so it
// runs only when the user actually attempts Google sign-in, and any native
// failure surfaces as a recoverable error instead of taking the whole app
// down. The configure call itself is idempotent — calling it more than once
// is safe.
let googleConfigured = false;
function ensureGoogleConfigured(): void {
  if (googleConfigured) return;
  try {
    GoogleSignin.configure({
      webClientId: '518104064870-e4ktklgq48hf8j9akrb21v9vv0nqoo06.apps.googleusercontent.com',
      iosClientId: '518104064870-rksfiejtdq0o3cto25ftjkcf8pteblud.apps.googleusercontent.com',
    });
    googleConfigured = true;
  } catch (err) {
    console.warn('GoogleSignin.configure failed:', err);
  }
}

export async function ensureSession(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (!error && data.session?.user) {
    return data.session.user.id;
  }

  if (error) {
    await supabase.auth.signOut().catch(() => {});
  }

  const { data: signIn, error: signInErr } = await supabase.auth.signInAnonymously();
  if (signInErr) throw signInErr;
  if (!signIn.user) throw new Error('Anonymous sign-in returned no user');

  setUser(signIn.user.id);
  return signIn.user.id;
}

export async function isAnonymous(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.is_anonymous ?? true;
}

export async function getEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}

export function isApplePrivateRelay(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@privaterelay.appleid.com');
}

export async function signUpWithEmail(
  email: string,
  password: string,
  _retry = false,
): Promise<{ error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const isAnon = session.session?.user?.is_anonymous;
  const settings = await getUserSettings();
  const lang = settings?.nativeLanguage || 'en';

  const stateNonce = await mintAuthNonce();
  const redirectWithLang = `${REDIRECT_URL}?lang=${lang}&state=${stateNonce}`;

  if (isAnon) {
    await supabase.auth.updateUser({ data: { lang } });
    const { error } = await supabase.auth.updateUser(
      { email, password },
      { emailRedirectTo: redirectWithLang },
    );
    if (error) {
      if (!_retry) {
        console.log('signUpWithEmail: retrying after session reset, error:', error.message);
        await supabase.auth.signOut().catch(() => {});
        await supabase.auth.signInAnonymously();
        return signUpWithEmail(email, password, true);
      }
      return { error: error.message };
    }
    return {};
  }

  if (!session.session) {
    if (!_retry) {
      await supabase.auth.signInAnonymously();
      return signUpWithEmail(email, password, true);
    }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectWithLang,
      data: { lang },
    },
  });
  if (error) return { error: error.message };
  return {};
}

export async function signInWithEmail(email: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return {};
}

/**
 * Persist the current UI language to user_metadata.lang so backend lifecycle
 * emails (welcome / trial / cancel) render in the user's language. Email
 * sign-up captures lang already; OAuth sign-in does not, so every OAuth
 * success path calls this. Best-effort — failure just leaves the email
 * fallback at 'en'.
 */
async function persistUserLang(): Promise<void> {
  try {
    const settings = await getUserSettings();
    const lang = settings?.nativeLanguage || 'en';
    await supabase.auth.updateUser({ data: { lang } });
  } catch {
    /* non-fatal */
  }
}

/**
 * Web OAuth via popup window. Avoids the full-page redirect that broke
 * wa-sqlite's OPFS access handle on return — the main page keeps its
 * JavaScript context alive (DB stays open, no hydration), while the
 * popup handles the provider redirect and posts the resulting session
 * back to us. Pattern is what Notion/Linear/Slack web do.
 *
 * Flow:
 *   1. Ask Supabase for the OAuth URL (skipBrowserRedirect: true).
 *   2. Open it in a popup window.
 *   3. Wait for the popup's callback page to postMessage tokens.
 *   4. Apply them via setSession on the main client.
 *
 * Failure modes handled:
 *   - Popup blocked → returns { error: 'popup_blocked' }
 *   - User closes popup → returns { error: 'cancelled' }
 *   - Provider returns an error → propagates message
 */
async function signInWithOAuthPopup(provider: 'google' | 'apple'): Promise<{ error?: string }> {
  if (typeof window === 'undefined') {
    return { error: 'no_window' };
  }
  try {
    const redirectTo = `${window.location.origin}/app/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error: error.message };
    if (!data?.url) return { error: 'no_oauth_url' };

    // Centered popup, reasonable size for Google/Apple consent UI.
    const w = 480;
    const h = 640;
    const left = Math.max(0, (window.outerWidth - w) / 2 + (window.screenX || 0));
    const top = Math.max(0, (window.outerHeight - h) / 2 + (window.screenY || 0));
    const popup = window.open(
      data.url,
      'moavoca_oauth',
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`,
    );
    if (!popup) return { error: 'popup_blocked' };

    console.log('[oauth-popup] opened popup for', provider);
    return await new Promise<{ error?: string }>((resolve) => {
      let settled = false;
      const settle = (result: { error?: string }) => {
        if (settled) return;
        settled = true;
        console.log('[oauth-popup] settling', provider, result);
        window.removeEventListener('message', onMessage);
        clearInterval(closedTimer);
        clearInterval(urlPoller);
        try { popup.close(); } catch { /* may already be closed */ }
        resolve(result);
      };

      const applyTokens = async (payload: {
        access_token?: string;
        refresh_token?: string;
        code?: string;
        error?: string;
      }): Promise<{ error?: string }> => {
        if (payload.error) return { error: payload.error };
        if (payload.access_token && payload.refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
          });
          if (setErr) return { error: setErr.message };
          await persistUserLang();
          return {};
        }
        if (payload.code) {
          const { error: xErr } = await supabase.auth.exchangeCodeForSession(payload.code);
          if (xErr) return { error: xErr.message };
          await persistUserLang();
          return {};
        }
        return { error: 'no_tokens' };
      };

      const onMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const payload = event.data;
        if (!payload || payload.source !== 'moavoca-oauth') return;
        console.log('[oauth-popup] received postMessage', payload);
        settle(await applyTokens(payload));
      };
      window.addEventListener('message', onMessage);

      // Secondary recovery: some browsers / network paths defeat the
      // popup's `postMessage` (third-party cookie chain, COOP isolation,
      // or the page closing too quickly). Poll the popup's URL — once
      // it lands on our same-origin callback we can read its
      // fragment/query directly without needing a message.
      const urlPoller = setInterval(async () => {
        if (popup.closed) return; // closed timer will handle
        try {
          const href = popup.location.href; // throws while cross-origin
          if (!href.includes('/app/auth/callback')) return;
          const u = new URL(href);
          const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
          const frag = new URLSearchParams(hash);
          const qry = new URLSearchParams(u.search);
          console.log('[oauth-popup] popup landed on callback URL');
          const result = await applyTokens({
            access_token: frag.get('access_token') ?? undefined,
            refresh_token: frag.get('refresh_token') ?? undefined,
            code: qry.get('code') ?? undefined,
            error: frag.get('error') ?? qry.get('error') ?? undefined,
          });
          settle(result);
        } catch {
          // Cross-origin — popup still on accounts.google.com or
          // supabase.co. Try again next tick.
        }
      }, 400);

      // Detect user-closed popup (no message arrived).
      const closedTimer = setInterval(() => {
        if (popup.closed) settle({ error: 'cancelled' });
      }, 500);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'sign_in_failed' };
  }
}

async function signInWithGoogleWeb(): Promise<{ error?: string }> {
  return signInWithOAuthPopup('google');
}

export async function signInWithGoogle(): Promise<{ error?: string }> {
  if (Platform.OS === 'web') return signInWithGoogleWeb();
  try {
    ensureGoogleConfigured();
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signOut().catch(() => {});
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;
    if (!idToken) return { error: 'No ID token received' };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { error: error.message };
    await persistUserLang();
    return {};
  } catch (err: unknown) {
    // Google's RN SDK throws { code: '<statusCode>', message } where code
    // is one of: SIGN_IN_CANCELLED ('12501'), DEVELOPER_ERROR ('10', SHA-1
    // / package mismatch), PLAY_SERVICES_NOT_AVAILABLE, or numeric status codes.
    // Log non-cancellation errors via console.warn (survives release-build
    // log stripping) so misconfigurations are visible in logcat without
    // surfacing cryptic codes to end users.
    const e = err as { code?: string | number; message?: string };
    const code = String(e?.code ?? '');
    const msg = e?.message ?? String(err);
    if (code === 'SIGN_IN_CANCELLED' || code === '12501') return { error: 'cancelled' };
    console.warn('[Google Sign-In]', code, msg);
    return { error: msg || 'sign_in_failed' };
  }
}

/**
 * Sign in with Apple. iOS uses the OS-level native sheet; Android falls
 * back to Supabase's hosted OAuth flow via an in-app browser. The two
 * paths converge on the same Supabase user (matched by Apple `sub`) as
 * long as the iOS bundle ID and the Android Services ID share the same
 * Primary App ID in Apple Developer Console.
 */
export async function signInWithApple(): Promise<{ error?: string }> {
  if (Platform.OS === 'ios') return signInWithAppleNative();
  if (Platform.OS === 'android') return signInWithAppleWeb();
  if (Platform.OS === 'web') return signInWithAppleBrowser();
  return { error: 'Apple Sign-In not supported on this platform' };
}

// Apple sign-in via the same popup helper as Google.
async function signInWithAppleBrowser(): Promise<{ error?: string }> {
  return signInWithOAuthPopup('apple');
}

async function signInWithAppleNative(): Promise<{ error?: string }> {
  try {
    // Per-attempt nonce defeats identity-token replay (audit M-10).
    // Apple requires the hashed nonce in the auth request and embeds it in
    // the identity_token's `nonce` claim; Supabase verifies hash(rawNonce)
    // matches that claim when we pass `nonce: rawNonce` to signInWithIdToken.
    // If WebCrypto SHA256 is unavailable in this runtime we fall back to
    // unhashed flow (legacy behaviour) so launch isn't blocked.
    const rawNonce = generateNonce();
    let hashedNonce: string | undefined;
    try {
      const subtle = (globalThis as { crypto?: { subtle?: { digest?: (a: string, b: BufferSource) => Promise<ArrayBuffer> } } }).crypto?.subtle;
      if (subtle?.digest) {
        const encoded = new TextEncoder().encode(rawNonce);
        const buf = await subtle.digest('SHA-256', encoded);
        hashedNonce = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
    } catch { /* fall through to legacy unhashed flow */ }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      ...(hashedNonce ? { nonce: hashedNonce } : {}),
    });
    if (!credential.identityToken) {
      return { error: 'No identity token received' };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      ...(hashedNonce ? { nonce: rawNonce } : {}),
    });
    if (error) return { error: error.message };

    // First-time sign-in: Apple sends fullName only on the very first auth.
    // Persist it so subsequent logins still show a display name.
    const fullName = credential.fullName;
    if (fullName && (fullName.givenName || fullName.familyName)) {
      const display = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim();
      if (display) {
        await supabase.auth.updateUser({ data: { display_name: display } }).catch(() => {});
      }
    }
    await persistUserLang();
    return {};
  } catch (err: unknown) {
    // Apple cancellation is { code: 'ERR_REQUEST_CANCELED' } — surface
    // generically; UI can decide whether to show an error.
    return { error: 'cancelled' };
  }
}

/**
 * Android Apple Sign-In via Supabase-hosted OAuth. Apple does not ship an
 * Android SDK, so the browser-redirect flow is the only path. We pull the
 * authorize URL from Supabase (`skipBrowserRedirect: true`), hand it to
 * expo-web-browser's auth session (ASWebAuthenticationSession-equivalent
 * on Android via Custom Tabs), then parse the implicit-flow tokens that
 * Supabase appends to the redirect fragment and call `setSession`
 * manually because our client is configured with `detectSessionInUrl:
 * false`. fullName is unavailable on this path — Apple's web flow only
 * surfaces names on the very first consent and they're returned as POST
 * form data to the redirect URL, which Supabase consumes server-side and
 * does not forward to the client. The display name will fall back to the
 * email local part until the user sets one manually.
 */
async function signInWithAppleWeb(): Promise<{ error?: string }> {
  try {
    const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });
    if (oauthErr || !data?.url) {
      return { error: oauthErr?.message ?? 'Failed to start Apple sign-in' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
    if (result.type !== 'success' || !result.url) {
      return { error: 'cancelled' };
    }

    // Supabase may use either implicit (tokens in fragment) or PKCE (code in
    // query) depending on the JS client version's default flowType. Handle
    // both — try fragment first, then fall back to PKCE code exchange.
    const [pathAndQuery, fragment] = result.url.split('#');
    const queryStr = pathAndQuery.split('?')[1] ?? '';

    if (fragment) {
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const errCode = params.get('error');
      if (errCode) return { error: params.get('error_description') ?? errCode };
      if (accessToken && refreshToken) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionErr) return { error: sessionErr.message };
        await persistUserLang();
        return {};
      }
    }

    if (queryStr) {
      const qParams = new URLSearchParams(queryStr);
      const code = qParams.get('code');
      const errCode = qParams.get('error');
      if (errCode) return { error: qParams.get('error_description') ?? errCode };
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) return { error: exchangeErr.message };
        await persistUserLang();
        return {};
      }
    }

    console.log('[Apple Web] callback URL had no tokens or code:', result.url);
    return { error: 'No tokens received' };
  } catch (err) {
    console.log('[Apple Web] exception:', err);
    return { error: 'cancelled' };
  }
}

export type AuthProvider = 'email' | 'google' | 'apple' | 'anonymous' | null;

export async function getAuthProvider(): Promise<AuthProvider> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  if (user.is_anonymous) return 'anonymous';
  const provider = user.app_metadata?.provider;
  if (provider === 'google') return 'google';
  if (provider === 'apple') return 'apple';
  return 'email';
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email;
  if (!email) return { error: 'Not signed in' };

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyErr) return { error: verifyErr.message };

  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateErr) return { error: updateErr.message };

  // Fire-and-forget notification
  supabase.functions
    .invoke('send-notification-email', {
      body: { type: 'password_changed' },
    })
    .catch(() => {});

  return {};
}

/**
 * Sign the user out and wipe local SQLite + TTS file caches. Local cleanup
 * runs even if the supabase auth call fails — once a logout is initiated the
 * session shouldn't outlive its local data. Idempotent; callers don't need
 * to invoke `clearLocalData` separately.
 *
 * Internal authService recovery paths (e.g. failed Google sign-in retry)
 * call `supabase.auth.signOut()` directly and are intentionally not affected
 * by this — those paths must not destroy the anonymous user's local data.
 */
export async function signOut(): Promise<void> {
  try {
    const { clearLocalData } = await import('@src/db');
    await clearLocalData();
  } catch (err) {
    console.warn('signOut: clearLocalData failed:', err);
    // Continue — the auth signOut still needs to happen.
  }
  await supabase.auth.signOut();
  setUser(null);
}

/**
 * Sentinel error returned when the server rejects deletion because the
 * session JWT is stale (issued more than ~5 minutes ago). The UI should
 * prompt the user to re-prove identity (password / Apple / Google), then
 * call deleteAccount() again. After a successful re-auth the JWT is fresh
 * and the second attempt passes.
 */
export const REAUTH_REQUIRED = 'reauth_required';

/**
 * Apply tokens that arrived via the auth/callback deep link, gated by a
 * user-visible confirmation. Without this gate a malicious link
 *   typeword://auth/callback#access_token=…&refresh_token=…
 * silently swaps the active session — at which point any local writes
 * sync to the attacker's Supabase user. Showing the email in a confirm
 * dialog makes a phishing/swap attempt visible.
 *
 * Skips the prompt only when the new session matches the currently
 * signed-in user (same `sub` claim) — that's a legitimate token refresh
 * that the user already authorized.
 */
export async function confirmAndSetSessionFromDeepLink(
  accessToken: string,
  refreshToken: string,
  providedState?: string | null,
): Promise<{ applied: boolean; error?: string }> {
  let newEmail: string | null = null;
  let newUserId: string | null = null;
  try {
    const part = accessToken.split('.')[1];
    if (!part) throw new Error('malformed token');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const decoded = JSON.parse(
      // atob is available in Hermes / RN; safe for base64url after pad/replace.
      // eslint-disable-next-line no-undef
      atob(padded.replace(/-/g, '+').replace(/_/g, '/')),
    );
    newEmail = typeof decoded.email === 'string' ? decoded.email : null;
    newUserId = typeof decoded.sub === 'string' ? decoded.sub : null;
  } catch {
    return { applied: false, error: 'Invalid token' };
  }

  // NOTE: we intentionally do NOT special-case OAuth (apple/google) tokens
  // for a silent apply. The provider claim lives in the UNVERIFIED JWT
  // payload, and an attacker can craft `typeword://auth/callback#access_token=…`
  // using their OWN valid Google/Apple tokens (provider='google'); a silent
  // apply would swap the victim into the attacker's account and exfiltrate
  // the victim's local words on next sync (login CSRF). The legitimate
  // Android OAuth flow already establishes the session directly via
  // signInWithAppleWeb's WebBrowser result, so when the duplicate BROWSABLE
  // intent reaches here the session is already the right user and the
  // same-user check below applies it silently with no modal. Any other
  // session id falls through to the confirm modal, which surfaces the email.

  // State-nonce match: this confirms the deep link came from a flow we
  // initiated (signUpWithEmail set the same nonce in AsyncStorage right
  // before mailing the redirect URL). Match → silent setSession, the
  // common-case happy path. No match → fall through to confirm modal.
  if (providedState && await consumeAuthNonceIfMatch(providedState)) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { applied: true };
  }

  const { data: { session: existing } } = await supabase.auth.getSession();
  const currentUser = existing?.user;
  const currentEmail = currentUser?.email ?? null;
  const currentUserId = currentUser?.id ?? null;
  const currentIsAnon = currentUser?.is_anonymous ?? false;

  // Same authenticated user — token refresh / cold-start re-hydration.
  // No prompt needed; this is the path Supabase's email-link flow lands in
  // after the user just authenticated themselves.
  if (currentUserId && !currentIsAnon && currentUserId === newUserId) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { applied: true };
  }

  const t = (k: string, fallback: string) => {
    const v = i18n.t(k);
    return v && v !== k ? v : fallback;
  };
  const displayEmail = newEmail || t('auth.unknown_email', 'unknown');

  const confirmed = await new Promise<boolean>((resolve) => {
    const isSwitch = !!currentUserId && !currentIsAnon && currentEmail !== newEmail;
    const title = isSwitch
      ? t('auth.deeplink_switch_title', 'Switch account?')
      : t('auth.deeplink_signin_title', 'Sign in?');
    const message = isSwitch
      ? t('auth.deeplink_switch_message', `You are signed in as ${currentEmail}. Switch to ${displayEmail}?`)
          .replace('{current}', currentEmail ?? '')
          .replace('{next}', displayEmail)
      : t('auth.deeplink_signin_message', `Sign in as ${displayEmail}?`)
          .replace('{email}', displayEmail);
    Alert.alert(title, message, [
      { text: t('settings.cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
      {
        text: isSwitch ? t('auth.deeplink_switch_confirm', 'Switch') : t('auth.deeplink_signin_confirm', 'Sign In'),
        style: isSwitch ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

  if (!confirmed) return { applied: false };

  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return { applied: true };
}

/**
 * Optional churn-feedback payload sent with the deletion call. Reasons are
 * stable string keys (matched to i18n labels client-side) so the analytics
 * table stays language-agnostic. When the user skips the feedback step,
 * pass undefined — the edge function records an empty-reasons row so the
 * skip rate stays measurable.
 */
export interface DeletionFeedback {
  reasons?: string[];
  comment?: string;
  was_premium?: boolean;
}

export async function deleteAccount(
  feedback?: DeletionFeedback,
): Promise<{ error?: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return { error: 'Not signed in' };

  const { error } = await supabase.functions.invoke('delete-account', {
    body: feedback ?? {},
  });
  if (error) {
    // Decode structured error so the UI can branch on reauth_required vs
    // other failures. supabase-js v2 stuffs the raw Response in
    // error.context.response when status != 2xx.
    try {
      const ctx = (error as { context?: { response?: Response } }).context;
      if (ctx?.response) {
        const body = await ctx.response.clone().json();
        if (body?.code === REAUTH_REQUIRED) {
          return { error: REAUTH_REQUIRED };
        }
      }
    } catch {
      // fall through to generic error
    }
    return { error: (error as Error).message };
  }

  await supabase.auth.signOut();
  return {};
}

/**
 * Re-prove identity with password, then attempt delete. For email-auth
 * users only — OAuth users (Apple/Google) should re-run signInWithApple()
 * / signInWithGoogle() before calling deleteAccount() directly, since
 * those flows mint a fresh JWT on completion.
 */
export async function reauthAndDeleteAccount(
  password: string,
  feedback?: DeletionFeedback,
): Promise<{ error?: string }> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email;
  if (!email) return { error: 'Not signed in' };

  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (reauthErr) return { error: reauthErr.message };

  return deleteAccount(feedback);
}
