import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { Card } from '@/components/ui/card';
import { AppModal } from '@/components/app-modal';
import { AvatarCircle } from '@/components/avatar-circle';
import { AvatarMenu } from '@/components/avatar-menu';
import { BackgroundPicker } from '@/components/background-picker';
import { ProfileSetupModal } from '@/components/profile-setup-modal';
import { Toast } from '@/components/toast';
import { getMyProfile, type MyProfile } from '@src/services/friendsService';
import {
  getMysteryBoxState,
  refreshMysteryBoxState,
  subscribeMysteryBox,
} from '@src/services/mysteryBoxService';
import {
  getEmail,
  getAuthProvider,
  changePassword,
  signOut,
  deleteAccount,
  reauthAndDeleteAccount,
  signInWithApple,
  signInWithGoogle,
  REAUTH_REQUIRED,
  ensureSession,
  isApplePrivateRelay,
  type AuthProvider,
  type DeletionFeedback,
} from '@src/services/authService';
import { syncAll } from '@src/services/syncService';
import { clearLocalData } from '@src/db';
import { clearUserSettings } from '@src/storage/userSettings';
import { usePremium } from '@src/hooks/usePremium';
import { useNetworkStatus } from '@src/hooks/useNetworkStatus';

const SUBSCRIPTION_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
}) as string;

// Stable churn-feedback keys. Order is rendering order; localized labels
// come from `auth.deletion_reason_<key>` in each locale.
const DELETION_REASONS = [
  'no_longer_needed',
  'too_difficult',
  'too_expensive',
  'missing_features',
  'switching',
  'bugs',
  'privacy',
  'other',
] as const;

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
  const isOnline = useNetworkStatus();
  const [deleteModal, setDeleteModal] = useState(false);
  const [subscriptionWarningModal, setSubscriptionWarningModal] = useState(false);
  // Churn-feedback step: shown between the subscription warning (if premium)
  // and the final delete confirmation. Reasons are stable string keys so
  // the analytics table stays language-agnostic. Feedback persists across
  // the delete modal AND the reauth modal — both call deleteAccount() and
  // both should attach the same feedback payload.
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [feedbackReasons, setFeedbackReasons] = useState<Set<string>>(new Set());
  const [feedbackComment, setFeedbackComment] = useState('');
  const [reauthModal, setReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const premium = usePremium();

  // Mystery-box equipped state (applied to the avatar circle).
  const [boxState, setBoxState] = useState(getMysteryBoxState());
  useEffect(() => subscribeMysteryBox(setBoxState), []);
  useEffect(() => { refreshMysteryBoxState().catch(() => {}); }, []);

  const reloadProfile = () => {
    getMyProfile().then(setMyProfile).catch(() => setMyProfile(null));
  };

  // Builds the feedback payload from the modal state. Returns undefined
  // when the user skipped (no reasons, no comment) so the edge function
  // still inserts a measurable skip row.
  const buildFeedback = (): DeletionFeedback | undefined => {
    const reasons = [...feedbackReasons];
    const comment = feedbackComment.trim();
    if (reasons.length === 0 && comment.length === 0) {
      return { was_premium: premium };
    }
    return {
      reasons,
      comment: comment || undefined,
      was_premium: premium,
    };
  };

  useEffect(() => {
    getEmail().then(setUserEmail);
    getAuthProvider().then(setProvider);
    reloadProfile();
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
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <TabletContainer>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* App bar */}
          <View className="h-11 flex-row items-center">
            <Pressable onPress={() => router.back()} className="mr-1 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button" hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
            </Pressable>
            <Text className="text-lg font-bold text-ink dark:text-ink-dark">
              {t('auth.profile')}
            </Text>
          </View>

          {/* Identity hero — avatar tap opens the customization menu;
              the explicit "Edit" button stays for nickname/username. */}
          {myProfile && !myProfile.isAnonymous ? (
            <Card className="mt-4 items-center p-6">
              <Pressable
                onPress={() => setShowAvatarMenu(true)}
                accessibilityRole="button"
                accessibilityLabel={t('avatar_menu.title')}
                hitSlop={6}
              >
                <AvatarCircle
                  name={myProfile.displayName}
                  backgroundId={boxState.equippedBackgroundId}
                  size={72}
                />
              </Pressable>
              <Text className="mt-3.5 text-xl font-extrabold text-ink dark:text-ink-dark" numberOfLines={1}>
                {myProfile.displayName || t('dashboard.unnamed')}
              </Text>
              {myProfile.username ? (
                <Text className="mt-0.5 text-sm text-muted">@{myProfile.username}</Text>
              ) : null}
              <Pressable
                onPress={() => setShowProfileSetup(true)}
                className="mt-4 flex-row items-center gap-1.5 rounded-[14px] border border-line bg-surface px-4 py-2.5 dark:border-line-dark dark:bg-surface-dark"
                accessibilityRole="button"
              >
                <MaterialIcons name="edit" size={15} color="#7B7366" />
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{t('profile_setup.title')}</Text>
              </Pressable>
            </Card>
          ) : null}

          {/* Account — grouped */}
          <View className="mt-5 overflow-hidden rounded-[20px] border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
            <InfoRow
              icon="mail-outline"
              label={t('auth.email')}
              value={isApplePrivateRelay(userEmail) ? t('auth.apple_private_email') : (userEmail ?? '—')}
            />
            <InfoRow
              icon="vpn-key"
              label={t('auth.signed_in_with')}
              value={provider === 'google' ? t('auth.signed_in_with_google') : provider === 'apple' ? t('auth.signed_in_with_apple') : provider === 'email' ? t('auth.signed_in_with_email') : '—'}
              last
            />
          </View>

          {/* Password change - only for email users */}
          {provider === 'email' ? (
            <View className="mt-6 rounded-2xl border border-line p-4 dark:border-line-dark">
              <Text className="text-base font-semibold text-ink dark:text-ink-dark">
                {t('auth.change_password')}
              </Text>

              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('auth.current_password')}
                </Text>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#A79E90"
                  secureTextEntry
                  autoComplete="current-password"
                  className="mt-2 rounded-xl border border-line px-4 py-3 text-base text-ink dark:border-line-dark dark:text-ink-dark"
                />
              </View>

              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('auth.new_password')}
                </Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#A79E90"
                  secureTextEntry
                  autoComplete="new-password"
                  className="mt-2 rounded-xl border border-line px-4 py-3 text-base text-ink dark:border-line-dark dark:text-ink-dark"
                />
              </View>

              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('auth.confirm_password')}
                </Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#A79E90"
                  secureTextEntry
                  autoComplete="new-password"
                  className="mt-2 rounded-xl border border-line px-4 py-3 text-base text-ink dark:border-line-dark dark:text-ink-dark"
                />
              </View>

              <View className="mt-4">
                <Pressable
                  onPress={handleChangePassword}
                  disabled={changing || !canSubmit}
                  className={`items-center rounded-xl py-4 ${
                    changing || !canSubmit
                      ? 'bg-clay dark:bg-clay-dark'
                      : 'bg-ink dark:bg-ink-dark'
                  }`}
                >
                  {changing ? (
                    <ActivityIndicator color="#7B7366" />
                  ) : (
                    <Text
                      className={`text-base font-semibold ${
                        !canSubmit
                          ? 'text-muted'
                          : 'text-canvas dark:text-canvas-dark'
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

          {/* Cancel subscription (premium) — neutral; actual cancel is in the store */}
          {premium ? (
            <Pressable
              onPress={() => { Linking.openURL(SUBSCRIPTION_URL).catch(() => {}); }}
              className="mt-5 items-center rounded-[14px] border border-line bg-surface py-4 dark:border-line-dark dark:bg-surface-dark"
            >
              <Text className="text-base font-medium text-ink dark:text-ink-dark">
                {t('auth.cancel_subscription')}
              </Text>
            </Pressable>
          ) : null}

          {/* Danger zone */}
          <Pressable
            onPress={() => setLogoutModal(true)}
            className={`${premium ? 'mt-3' : 'mt-5'} flex-row items-center justify-center gap-1.5 rounded-[14px] border border-danger bg-surface py-4 dark:bg-surface-dark`}
            accessibilityRole="button"
          >
            <MaterialIcons name="logout" size={18} color="#E0654F" />
            <Text className="text-base font-bold text-danger">{t('auth.logout')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (premium) setSubscriptionWarningModal(true);
              else setFeedbackModal(true);
            }}
            className="mt-4 items-center py-3"
          >
            <Text className="text-sm text-faint underline">{t('auth.delete_account')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      </TabletContainer>

      <AppModal
        visible={logoutModal}
        title={t('auth.logout')}
        message={isOnline ? t('auth.logout_confirm') : t('auth.logout_confirm_offline')}
        buttonText={t('settings.cancel')}
        confirmText={t('auth.logout')}
        onConfirm={async () => {
          setLogoutModal(false);
          // Push pending changes first so they're durable on the server.
          // signOut() clears local SQLite + TTS files internally; if
          // syncAll failed (offline) the user was already warned.
          await syncAll().catch(() => {});
          await signOut();
          await ensureSession().catch(() => {});
          router.back();
        }}
        onClose={() => setLogoutModal(false)}
        destructive
      />

      <AppModal
        visible={subscriptionWarningModal}
        title={t('auth.subscription_warning_title')}
        message={t('auth.subscription_warning_message')}
        secondaryText={t('auth.manage_subscription')}
        onSecondary={() => {
          Linking.openURL(SUBSCRIPTION_URL).catch(() => {});
        }}
        buttonText={t('settings.cancel')}
        confirmText={t('auth.continue_delete')}
        onConfirm={() => {
          setSubscriptionWarningModal(false);
          setFeedbackModal(true);
        }}
        onClose={() => setSubscriptionWarningModal(false)}
        destructive
      />

      {/* Churn-feedback step. Skipping advances to the final confirm with
          undefined feedback — the edge function still inserts a row with
          empty reasons so we can measure the skip rate.

          KeyboardAvoidingView inside Modal: the outer activity's
          adjustResize doesn't apply to RN's Modal overlay, so the
          textarea would otherwise be obscured by the keyboard. Wrapping
          with padding-behavior centers the dialog above the keyboard. */}
      <Modal
        visible={feedbackModal}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <Pressable
          onPress={() => setFeedbackModal(false)}
          className="flex-1 items-center justify-center bg-black/50 px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="w-full max-w-sm rounded-2xl bg-surface p-6 dark:bg-surface-dark"
          >
            <Text className="text-lg font-bold text-ink dark:text-ink-dark">
              {t('auth.deletion_feedback_title')}
            </Text>
            <Text className="mt-2 text-sm text-muted">
              {t('auth.deletion_feedback_message')}
            </Text>

            <ScrollView className="mt-4 max-h-72">
              {DELETION_REASONS.map((key) => {
                const selected = feedbackReasons.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setFeedbackReasons((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    }}
                    className="flex-row items-center py-2.5"
                  >
                    <MaterialIcons
                      name={selected ? 'check-box' : 'check-box-outline-blank'}
                      size={20}
                      color={selected ? '#E0654F' : '#A79E90'}
                    />
                    <Text className="ml-2 flex-1 text-sm text-ink dark:text-ink-dark">
                      {t(`auth.deletion_reason_${key}`)}
                    </Text>
                  </Pressable>
                );
              })}
              <TextInput
                value={feedbackComment}
                onChangeText={setFeedbackComment}
                placeholder={t('auth.deletion_comment_placeholder')}
                placeholderTextColor="#A79E90"
                multiline
                maxLength={2000}
                className="mt-2 min-h-20 rounded-xl border border-line px-3 py-2 text-sm text-ink dark:border-line-dark dark:text-ink-dark"
                style={{ textAlignVertical: 'top' }}
              />
            </ScrollView>

            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={() => {
                  setFeedbackReasons(new Set());
                  setFeedbackComment('');
                  setFeedbackModal(false);
                  setDeleteModal(true);
                }}
                className="flex-1 items-center rounded-xl border border-line py-3 dark:border-line-dark"
              >
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                  {t('auth.deletion_skip')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setFeedbackModal(false);
                  setDeleteModal(true);
                }}
                className="flex-1 items-center rounded-xl bg-danger py-3"
              >
                <Text className="text-sm font-semibold text-white">
                  {t('auth.deletion_continue')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <AppModal
        visible={deleteModal}
        title={t('auth.delete_account')}
        message={t('auth.delete_confirm')}
        buttonText={t('settings.cancel')}
        confirmText={t('auth.delete_account')}
        onConfirm={async () => {
          setDeleteModal(false);
          const result = await deleteAccount(buildFeedback());
          if (!result.error) {
            await finalizeDeletion();
            return;
          }
          if (result.error === REAUTH_REQUIRED) {
            setReauthError(null);
            setReauthPassword('');
            setReauthModal(true);
            return;
          }
          setToast({ message: result.error, type: 'error' });
        }}
        onClose={() => setDeleteModal(false)}
        destructive
      />

      {/* Reauth-and-delete modal: server rejects deletion if the session
          token is older than 5 minutes. Surface an inline re-prove flow so
          a long-lived session can't be used to wipe an account. */}
      <Modal
        visible={reauthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setReauthModal(false)}
      >
        <Pressable
          onPress={() => !reauthBusy && setReauthModal(false)}
          className="flex-1 items-center justify-center bg-black/50"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="mx-8 w-full max-w-sm rounded-2xl bg-surface p-6 dark:bg-surface-dark"
          >
            <Text className="text-lg font-bold text-ink dark:text-ink-dark">
              {t('auth.reauth_required_title')}
            </Text>
            <Text className="mt-3 text-sm leading-5 text-muted">
              {t('auth.reauth_required_message')}
            </Text>

            {provider === 'email' ? (
              <View className="mt-4">
                <TextInput
                  value={reauthPassword}
                  onChangeText={setReauthPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#A79E90"
                  secureTextEntry
                  autoComplete="current-password"
                  editable={!reauthBusy}
                  className="rounded-xl border border-line px-4 py-3 text-base text-ink dark:border-line-dark dark:text-ink-dark"
                />
                {reauthError ? (
                  <Text className="mt-2 text-xs text-danger">{reauthError}</Text>
                ) : null}
              </View>
            ) : reauthError ? (
              <Text className="mt-3 text-xs text-danger">{reauthError}</Text>
            ) : null}

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => !reauthBusy && setReauthModal(false)}
                className="flex-1 items-center rounded-xl border border-line py-3 dark:border-line-dark"
              >
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                  {t('settings.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (reauthBusy) return;
                  setReauthBusy(true);
                  setReauthError(null);
                  try {
                    let result: { error?: string };
                    const feedback = buildFeedback();
                    if (provider === 'email') {
                      if (reauthPassword.trim().length === 0) {
                        setReauthError(t('auth.error_wrong_password'));
                        return;
                      }
                      result = await reauthAndDeleteAccount(reauthPassword, feedback);
                    } else if (provider === 'apple') {
                      const r = await signInWithApple();
                      if (r.error) { setReauthError(r.error); return; }
                      result = await deleteAccount(feedback);
                    } else if (provider === 'google') {
                      const r = await signInWithGoogle();
                      if (r.error) { setReauthError(r.error); return; }
                      result = await deleteAccount(feedback);
                    } else {
                      setReauthError('Not supported');
                      return;
                    }
                    if (result.error) {
                      const lower = result.error.toLowerCase();
                      const friendly =
                        lower.includes('invalid') &&
                        (lower.includes('credentials') || lower.includes('password') || lower.includes('login'))
                          ? t('auth.error_wrong_password')
                          : result.error;
                      setReauthError(friendly);
                      return;
                    }
                    setReauthModal(false);
                    await finalizeDeletion();
                  } finally {
                    setReauthBusy(false);
                  }
                }}
                className="flex-1 items-center rounded-xl bg-danger py-3"
              >
                {reauthBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-sm font-semibold text-white">
                    {t('auth.delete_account')}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ProfileSetupModal
        visible={showProfileSetup}
        initialDisplayName={myProfile?.displayName ?? ''}
        initialUsername={myProfile?.username ?? ''}
        cancellable
        onSaved={() => {
          setShowProfileSetup(false);
          setToast({ message: t('dashboard.profile_saved'), type: 'success' });
          reloadProfile();
        }}
        onCancel={() => setShowProfileSetup(false)}
      />

      <AvatarMenu
        visible={showAvatarMenu}
        onClose={() => setShowAvatarMenu(false)}
        onPickBackground={() => setShowBgPicker(true)}
        onPickCharacter={() => router.push('/mystery-box')}
      />
      <BackgroundPicker visible={showBgPicker} onClose={() => setShowBgPicker(false)} />
    </SafeAreaView>
  );

  async function finalizeDeletion() {
    await clearLocalData();
    // Use clearUserSettings (not direct AsyncStorage.removeItem) so the
    // useUserSettings subscriber in _layout / settings tab is notified —
    // otherwise stale in-memory `settings` keeps the layout from routing
    // to /onboarding and the freshly-mounted settings tab renders blank.
    await clearUserSettings();
    await ensureSession().catch(() => {});
    router.replace('/onboarding');
  }
}

function InfoRow({ icon, label, value, last }: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View className={`flex-row items-center gap-3.5 px-4 py-3.5 ${last ? '' : 'border-b border-line dark:border-line-dark'}`}>
      <MaterialIcons name={icon} size={19} color="#A79E90" />
      <View className="flex-1">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</Text>
        <Text className="mt-0.5 text-[15px] text-ink dark:text-ink-dark" numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}
