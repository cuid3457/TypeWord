import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '@src/api/supabase';
import { getUserSettings } from '@src/storage/userSettings';
import { setUser } from './sentry';

const REDIRECT_URL = 'typeword://auth/callback';

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

export async function signUpWithEmail(
  email: string,
  password: string,
  _retry = false,
): Promise<{ error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const isAnon = session.session?.user?.is_anonymous;
  const settings = await getUserSettings();
  const lang = settings?.nativeLanguage || 'en';

  const redirectWithLang = `${REDIRECT_URL}?lang=${lang}`;

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

export async function signInWithGoogle(): Promise<{ error?: string }> {
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
    return {};
  } catch {
    return { error: 'cancelled' };
  }
}

export type AuthProvider = 'email' | 'google' | 'anonymous' | null;

export async function getAuthProvider(): Promise<AuthProvider> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  if (user.is_anonymous) return 'anonymous';
  const provider = user.app_metadata?.provider;
  if (provider === 'google') return 'google';
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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  setUser(null);
}

export async function deleteAccount(): Promise<{ error?: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return { error: 'Not signed in' };

  const { error } = await supabase.functions.invoke('delete-account', {
    body: { userId },
  });
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  return {};
}
