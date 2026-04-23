import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppModal } from '@/components/app-modal';
import { Toast } from '@/components/toast';
import {
  getEmail,
  getAuthProvider,
  changePassword,
  signOut,
  deleteAccount,
  ensureSession,
  type AuthProvider,
} from '@src/services/authService';
import { syncAll } from '@src/services/syncService';
import { clearLocalData } from '@src/db';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [provider, setProvider] = useState<AuthProvider>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [logoutModal, setLogoutModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  useEffect(() => {
    getEmail().then(setUserEmail);
    getAuthProvider().then(setProvider);
  }, []);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setToast({ message: t('auth.error_weak_password'), type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ message: t('auth.password_mismatch'), type: 'error' });
      return;
    }

    setChanging(true);
    setToast(null);
    const result = await changePassword(currentPassword, newPassword);
    setChanging(false);

    if (result.error) {
      const lower = result.error.toLowerCase();
      if (lower.includes('invalid') && (lower.includes('credentials') || lower.includes('password') || lower.includes('login'))) {
        setToast({ message: t('auth.error_wrong_password'), type: 'error' });
      } else {
        setToast({ message: result.error, type: 'error' });
      }
    } else {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setToast({ message: t('auth.password_changed'), type: 'success' });
    }
  };

  const canSubmit =
    currentPassword.trim().length > 0 &&
    newPassword.trim().length > 0 &&
    confirmPassword.trim().length > 0;

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
          {/* Header */}
          <Pressable onPress={() => router.back()} className="mb-4 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button">
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>

          <Text className="text-3xl font-bold text-black dark:text-white">
            {t('auth.profile')}
          </Text>

          {/* Email display */}
          <View className="mt-6 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('auth.email')}
            </Text>
            <Text className="mt-1 text-base text-black dark:text-white">
              {userEmail ?? '—'}
            </Text>
          </View>

          {/* Auth provider */}
          <View className="mt-4 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('auth.signed_in_with')}
            </Text>
            <Text className="mt-1 text-base text-black dark:text-white">
              {provider === 'google'
                ? t('auth.signed_in_with_google')
                : provider === 'email'
                  ? t('auth.signed_in_with_email')
                  : '—'}
            </Text>
          </View>

          {/* Password change - only for email users */}
          {provider === 'email' ? (
            <View className="mt-6 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
              <Text className="text-base font-semibold text-black dark:text-white">
                {t('auth.change_password')}
              </Text>

              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t('auth.current_password')}
                </Text>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry
                  autoComplete="current-password"
                  className="mt-2 rounded-xl border border-gray-300 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
                />
              </View>

              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t('auth.new_password')}
                </Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry
                  autoComplete="new-password"
                  className="mt-2 rounded-xl border border-gray-300 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
                />
              </View>

              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t('auth.confirm_password')}
                </Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry
                  autoComplete="new-password"
                  className="mt-2 rounded-xl border border-gray-300 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
                />
              </View>

              <View className="mt-4">
                <Pressable
                  onPress={handleChangePassword}
                  disabled={changing || !canSubmit}
                  className={`items-center rounded-xl py-4 ${
                    changing || !canSubmit
                      ? 'bg-gray-300 dark:bg-gray-700'
                      : 'bg-black dark:bg-white'
                  }`}
                >
                  {changing ? (
                    <ActivityIndicator color="#6b7280" />
                  ) : (
                    <Text
                      className={`text-base font-semibold ${
                        !canSubmit
                          ? 'text-gray-500'
                          : 'text-white dark:text-black'
                      }`}
                    >
                      {t('auth.change_password')}
                    </Text>
                  )}
                </Pressable>
                <Toast
                  visible={!!toast}
                  message={toast?.message ?? ''}
                  type={toast?.type}
                  onHide={() => setToast(null)}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                />
              </View>
            </View>
          ) : null}

          {/* Logout button */}
          <Pressable
            onPress={() => setLogoutModal(true)}
            className="mt-6 items-center rounded-xl border border-red-500 py-4"
          >
            <Text className="text-base font-semibold text-red-500">
              {t('auth.logout')}
            </Text>
          </Pressable>

          {/* Delete account button */}
          <Pressable
            onPress={() => setDeleteModal(true)}
            className="mt-4 items-center py-3"
          >
            <Text className="text-sm text-gray-400">
              {t('auth.delete_account')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <AppModal
        visible={logoutModal}
        title={t('auth.logout')}
        message={t('auth.logout_confirm')}
        buttonText={t('settings.cancel')}
        confirmText={t('auth.logout')}
        onConfirm={async () => {
          setLogoutModal(false);
          await syncAll().catch(() => {});
          await clearLocalData();
          await signOut();
          await ensureSession().catch(() => {});
          router.back();
        }}
        onClose={() => setLogoutModal(false)}
        destructive
      />

      <AppModal
        visible={deleteModal}
        title={t('auth.delete_account')}
        message={t('auth.delete_confirm')}
        buttonText={t('settings.cancel')}
        confirmText={t('auth.delete_account')}
        onConfirm={async () => {
          setDeleteModal(false);
          const result = await deleteAccount();
          if (!result.error) {
            await clearLocalData();
            await ensureSession().catch(() => {});
            router.back();
          }
        }}
        onClose={() => setDeleteModal(false)}
        destructive
      />
    </SafeAreaView>
  );
}
