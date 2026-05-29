import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as AppleAuthentication from 'expo-apple-authentication';

import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';
import { signUpWithEmail, signInWithEmail, signInWithGoogle, signInWithApple, signOut, ensureSession } from '@src/services/authService';
import { isTimeoutError, withTimeout } from '@src/utils/timeout';

const AUTH_TIMEOUT_MS = 20000;

function mapAuthError(raw: string, mode: 'login' | 'signup' = 'login'): string {
  const lower = raw.toLowerCase();
  // For SIGNUP, never reveal "email already exists" — that's an enumeration
  // oracle. Treat the email-taken case as a generic success path (the user
  // gets a confirmation email or, if already registered, nothing — same UX
  // to an outside observer).
  if (mode === 'signup' && lower.includes('email') &&
      (lower.includes('already') || lower.includes('registered') || lower.includes('exists'))) {
    return 'auth.verify_email';
  }
  if (lower.includes('invalid') && lower.includes('email')) return 'auth.error_invalid_email';
  if (lower.includes('password') && (lower.includes('short') || lower.includes('weak') || lower.includes('at least'))) return 'auth.error_weak_password';
  if (lower.includes('invalid') && (lower.includes('credentials') || lower.includes('password') || lower.includes('login'))) return 'auth.error_invalid_credentials';
  if (lower.includes('rate') || lower.includes('too many')) return 'auth.error_too_many_requests';
  return 'auth.error_unknown';
}

export default function AuthScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const showToast = (msg: string, type: 'error' | 'success' = 'error') => {
    setToast({ message: msg, type });
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showToast(t('auth.error_invalid_email'));
      return;
    }
    if (password.length < 8) {
      showToast(t('auth.error_weak_password'));
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const result = await withTimeout(
        mode === 'signup'
          ? signUpWithEmail(email.trim(), password)
          : signInWithEmail(email.trim(), password),
        AUTH_TIMEOUT_MS,
      );

      setLoading(false);
      if (result.error) {
        console.log('Auth error:', result.error);
        const key = mapAuthError(result.error, mode);
        // If signup got mapped to verify_email (email-taken silenced for
        // enumeration defense), surface as the same success state as a fresh
        // signup so an attacker cannot distinguish.
        if (mode === 'signup' && key === 'auth.verify_email') {
          setSignedUpEmail(email.trim());
          showToast(t('auth.verify_email'), 'success');
        } else {
          showToast(t(key));
        }
      } else {
        if (mode === 'signup') {
          setSignedUpEmail(email.trim());
          showToast(t('auth.verify_email'), 'success');
        } else {
          router.back();
        }
      }
    } catch (err) {
      setLoading(false);
      if (isTimeoutError(err)) {
        showToast(t('error.slow_network'));
      } else {
        showToast(t('auth.error_unknown'));
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TabletContainer>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} className="mb-4 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button">
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>

          <Text className="text-3xl font-bold text-ink dark:text-ink-dark">
            {mode === 'signup' ? t('auth.signup_title') : t('auth.login_title')}
          </Text>
          <Text className="mt-2 text-sm text-muted">
            {t('auth.subtitle')}
          </Text>

          {/* Google + Apple OAuth. On web both use Supabase's hosted OAuth
              flow (full-page redirect → /app/auth/callback → SDK
              auto-applies session from URL fragment). iOS uses the native
              Google Sign-In SDK + Apple's OS-level button; Android uses
              the native Google SDK + Supabase WebBrowser flow for Apple. */}
          <Pressable
            onPress={async () => {
              try {
                setGoogleLoading(true);
                const result = await withTimeout(signInWithGoogle(), AUTH_TIMEOUT_MS);
                setGoogleLoading(false);
                if (result.error) {
                  if (result.error !== 'cancelled') showToast(t(mapAuthError(result.error)));
                } else {
                  router.back();
                }
              } catch (err) {
                setGoogleLoading(false);
                if (isTimeoutError(err)) showToast(t('error.slow_network'));
              }
            }}
            disabled={googleLoading || appleLoading || loading}
            style={{ height: 52 }}
            className="mt-8 flex-row items-center justify-center rounded-xl border border-line dark:border-line-dark"
          >
            {googleLoading ? (
              <ActivityIndicator color="#7B7366" />
            ) : (
              <>
                <Image
                  source={{ uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png' }}
                  style={{ width: 20, height: 20 }}
                />
                <Text className="ml-3 text-base font-medium text-ink dark:text-ink-dark">
                  {t('auth.google_login')}
                </Text>
              </>
            )}
          </Pressable>

          {/* Apple Sign-In. iOS uses the OS-level native button (App Store
              Guideline 4.8 requires it alongside other third-party logins).
              Android uses Supabase's hosted OAuth flow via an in-app browser
              — Apple ships no native Android SDK. Web uses Supabase's
              hosted OAuth flow as a full-page redirect. The handler is the
              same for all three; only the trigger UI differs. */}
          {appleLoading ? (
            <View style={{ height: 52, marginTop: 12 }} className="items-center justify-center rounded-xl bg-black border border-transparent dark:border-line-dark">
              <ActivityIndicator color="#fff" />
            </View>
          ) : Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={{ marginTop: 12, height: 52 }}
              onPress={async () => {
                try {
                  setAppleLoading(true);
                  const result = await withTimeout(signInWithApple(), AUTH_TIMEOUT_MS);
                  setAppleLoading(false);
                  if (result.error) {
                    if (result.error !== 'cancelled') showToast(t(mapAuthError(result.error)));
                  } else {
                    router.back();
                  }
                } catch (err) {
                  setAppleLoading(false);
                  if (isTimeoutError(err)) showToast(t('error.slow_network'));
                }
              }}
            />
          ) : (
            <Pressable
              onPress={async () => {
                try {
                  setAppleLoading(true);
                  const result = await withTimeout(signInWithApple(), AUTH_TIMEOUT_MS);
                  setAppleLoading(false);
                  if (result.error) {
                    if (result.error !== 'cancelled') showToast(t(mapAuthError(result.error)));
                  } else {
                    router.back();
                  }
                } catch (err) {
                  setAppleLoading(false);
                  if (isTimeoutError(err)) showToast(t('error.slow_network'));
                }
              }}
              disabled={googleLoading || appleLoading || loading}
              style={{ height: 52, marginTop: 12 }}
              className="flex-row items-center justify-center rounded-xl bg-black border border-transparent dark:border-line-dark"
            >
              <FontAwesome name="apple" size={20} color="#fff" style={{ marginTop: -2 }} />
              <Text className="ml-3 text-base font-medium text-white">
                {t('auth.apple_login')}
              </Text>
            </Pressable>
          )}

          <View className="my-6 flex-row items-center">
            <View className="flex-1 h-px bg-clay dark:bg-clay-dark" />
            <Text className="mx-4 text-sm text-faint">or</Text>
            <View className="flex-1 h-px bg-clay dark:bg-clay-dark" />
          </View>

          <View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t('auth.email')}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor="#A79E90"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              className="mt-2 rounded-xl border border-line px-4 py-3 text-base text-ink dark:border-line-dark dark:text-ink-dark"
            />
          </View>

          <View className="mt-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t('auth.password')}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#A79E90"
              secureTextEntry
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="mt-2 rounded-xl border border-line px-4 py-3 text-base text-ink dark:border-line-dark dark:text-ink-dark"
            />
          </View>

          <View className="mt-6">
            <Pressable
              onPress={handleSubmit}
              disabled={loading || !email.trim() || !password.trim()}
              className={`items-center rounded-xl py-4 ${
                loading || !email.trim() || !password.trim()
                  ? 'bg-clay'
                  : 'bg-ink dark:bg-ink-dark'
              }`}
            >
              {loading ? (
                <ActivityIndicator color="#7B7366" />
              ) : (
                <Text
                  className={`text-base font-semibold ${
                    !email.trim() || !password.trim()
                      ? 'text-muted'
                      : 'text-canvas dark:text-canvas-dark'
                  }`}
                >
                  {mode === 'signup' ? t('auth.signup') : t('auth.login')}
                </Text>
              )}
            </Pressable>
            <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type} onHide={() => setToast(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', pointerEvents: 'none' }} />
          </View>

          {signedUpEmail && mode === 'signup' && (
            <Pressable
              onPress={async () => {
                setResending(true);
                try {
                  const result = await withTimeout(
                    signUpWithEmail(email.trim(), password),
                    AUTH_TIMEOUT_MS,
                  );
                  setResending(false);
                  if (result.error) {
                    showToast(t(mapAuthError(result.error)));
                  } else {
                    showToast(t('auth.email_resent'), 'success');
                  }
                } catch (err) {
                  setResending(false);
                  if (isTimeoutError(err)) showToast(t('error.slow_network'));
                }
              }}
              disabled={resending || !email.trim() || !password.trim()}
              className="mt-4 items-center rounded-xl border border-line py-3 dark:border-line-dark"
            >
              {resending ? (
                <ActivityIndicator color="#7B7366" />
              ) : (
                <Text className="text-sm font-medium text-muted">
                  {t('auth.resend_email')}
                </Text>
              )}
            </Pressable>
          )}

          {mode === 'signup' && (
            <Text className="mt-4 text-center text-xs leading-5 text-faint">
              {t('auth.agree_prefix')}
              <Text
                className="text-muted underline"
                onPress={() => router.push('/terms')}
              >
                {t('settings.terms')}
              </Text>
              {t('auth.agree_and')}
              <Text
                className="text-muted underline"
                onPress={() => router.push('/privacy')}
              >
                {t('settings.privacy')}
              </Text>
              {t('auth.agree_suffix')}
            </Text>
          )}

          <Pressable
            onPress={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setToast(null);
            }}
            className="mt-4 items-center py-2"
          >
            <Text className="text-sm text-muted">
              {mode === 'signup' ? t('auth.have_account_prefix') : t('auth.no_account_prefix')}
              <Text className="font-semibold text-[#2EC4A5]">
                {mode === 'signup' ? t('auth.have_account_link') : t('auth.no_account_link')}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
        </TabletContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
