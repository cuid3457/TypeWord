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

import { Toast } from '@/components/toast';
import { signUpWithEmail, signInWithEmail, signInWithGoogle, signOut, ensureSession } from '@src/services/authService';

function mapAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('invalid') && lower.includes('email')) return 'auth.error_invalid_email';
  if (lower.includes('email') && (lower.includes('already') || lower.includes('registered') || lower.includes('exists'))) return 'auth.error_email_taken';
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

    const result = mode === 'signup'
      ? await signUpWithEmail(email.trim(), password)
      : await signInWithEmail(email.trim(), password);

    setLoading(false);
    if (result.error) {
      console.log('Auth error:', result.error);
      showToast(t(mapAuthError(result.error)));
    } else {
      if (mode === 'signup') {
        setSignedUpEmail(email.trim());
        showToast(t('auth.verify_email'), 'success');
      } else {
        router.back();
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} className="mb-4 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button">
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>

          <Text className="text-3xl font-bold text-black dark:text-white">
            {mode === 'signup' ? t('auth.signup_title') : t('auth.login_title')}
          </Text>
          <Text className="mt-2 text-sm text-gray-500">
            {t('auth.subtitle')}
          </Text>

          <Pressable
            onPress={async () => {
              try {
                setGoogleLoading(true);
                const result = await signInWithGoogle();
                setGoogleLoading(false);
                if (result.error) {
                  if (result.error !== 'cancelled') showToast(t(mapAuthError(result.error)));
                } else {
                  router.back();
                }
              } catch {
                setGoogleLoading(false);
              }
            }}
            disabled={googleLoading || loading}
            className="mt-8 flex-row items-center justify-center rounded-xl border border-gray-300 py-4 dark:border-gray-700"
          >
            {googleLoading ? (
              <ActivityIndicator color="#6b7280" />
            ) : (
              <>
                <Image
                  source={{ uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png' }}
                  style={{ width: 20, height: 20 }}
                />
                <Text className="ml-3 text-base font-medium text-black dark:text-white">
                  {t('auth.google_login')}
                </Text>
              </>
            )}
          </Pressable>

          <View className="my-6 flex-row items-center">
            <View className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
            <Text className="mx-4 text-sm text-gray-400">or</Text>
            <View className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
          </View>

          <View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('auth.email')}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              className="mt-2 rounded-xl border border-gray-300 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
            />
          </View>

          <View className="mt-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('auth.password')}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="mt-2 rounded-xl border border-gray-300 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
            />
          </View>

          <View className="mt-6">
            <Pressable
              onPress={handleSubmit}
              disabled={loading || !email.trim() || !password.trim()}
              className={`items-center rounded-xl py-4 ${
                loading || !email.trim() || !password.trim()
                  ? 'bg-gray-300'
                  : 'bg-black dark:bg-white'
              }`}
            >
              {loading ? (
                <ActivityIndicator color="#6b7280" />
              ) : (
                <Text
                  className={`text-base font-semibold ${
                    !email.trim() || !password.trim()
                      ? 'text-gray-500'
                      : 'text-white dark:text-black'
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
                const result = await signUpWithEmail(email.trim(), password);
                setResending(false);
                if (result.error) {
                  showToast(t(mapAuthError(result.error)));
                } else {
                  showToast(t('auth.email_resent'), 'success');
                }
              }}
              disabled={resending || !email.trim() || !password.trim()}
              className="mt-4 items-center rounded-xl border border-gray-300 py-3 dark:border-gray-700"
            >
              {resending ? (
                <ActivityIndicator color="#6b7280" />
              ) : (
                <Text className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('auth.resend_email')}
                </Text>
              )}
            </Pressable>
          )}

          {mode === 'signup' && (
            <Text className="mt-4 text-center text-xs leading-5 text-gray-400">
              {t('auth.agree_prefix')}
              <Text
                className="text-gray-500 underline"
                onPress={() => router.push('/terms')}
              >
                {t('settings.terms')}
              </Text>
              {t('auth.agree_and')}
              <Text
                className="text-gray-500 underline"
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
            <Text className="text-sm text-gray-500">
              {mode === 'signup' ? t('auth.have_account') : t('auth.no_account')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
