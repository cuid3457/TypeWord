/**
 * Deep-link landing for `typeword://invite/<CODE>` and the equivalent web
 * universal link. Resolves the friend code → adds the friend → applies the
 * referral bonus (7 days bonus premium for both sides). If the current user
 * is still anonymous (hasn't signed up), we stash the code and bounce them
 * to the auth flow; the dashboard picks it up on next focus.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

import { TabletContainer } from '@/components/tablet-container';
import { supabase } from '@src/api/supabase';
import {
  addFriendByCode,
  applyReferral,
  ensureFriendCode,
  FriendsError,
  getMyProfile,
  setDisplayName,
} from '@src/services/friendsService';
import { refreshBonusPremium } from '@src/services/subscriptionService';

export const PENDING_INVITE_KEY = 'typeword.pendingInviteCode';

async function processFriendAndBonus(
  code: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
  setState: (s: InviteState) => void,
): Promise<void> {
  try {
    await addFriendByCode(code);
  } catch (e) {
    if (e instanceof FriendsError && e.code === 'self') {
      setState({ kind: 'error', message: t('invite.error_self') });
      return;
    }
    if (e instanceof FriendsError && e.code === 'not_found') {
      setState({ kind: 'error', message: t('invite.error_not_found') });
      return;
    }
    // Already-friend / unknown — proceed to bonus claim anyway.
  }

  const result = await applyReferral(code);
  await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  await refreshBonusPremium();
  setState({
    kind: 'success',
    bonusDays: result.bonusDays ?? 7,
    alreadyClaimed: !result.granted,
  });
}

type InviteState =
  | { kind: 'loading' }
  | { kind: 'needs_signup'; code: string }
  | { kind: 'needs_name'; code: string }
  | { kind: 'success'; bonusDays: number; alreadyClaimed: boolean }
  | { kind: 'error'; message: string };

export default function InviteScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ code?: string }>();
  const [state, setState] = useState<InviteState>({ kind: 'loading' });

  useEffect(() => {
    const rawCode = (params.code ?? '').trim().toUpperCase();
    if (!rawCode || rawCode.length < 4) {
      setState({ kind: 'error', message: t('invite.invalid_code') });
      return;
    }

    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const user = session.session?.user;
        if (!user || user.is_anonymous) {
          // Stash for the auth flow to pick up after sign-up.
          await AsyncStorage.setItem(PENDING_INVITE_KEY, rawCode);
          setState({ kind: 'needs_signup', code: rawCode });
          return;
        }

        // Block on the invitee having a displayName. Without one, the
        // inviter would see them as "Unnamed" in their friend list — and
        // they would also lack a friend_code of their own to invite others.
        const profile = await getMyProfile();
        if (!profile?.displayName || !profile.friendCode) {
          setState({ kind: 'needs_name', code: rawCode });
          return;
        }

        await processFriendAndBonus(rawCode, t, setState);
      } catch (e) {
        const msg = e instanceof FriendsError ? e.message : t('invite.error_unknown');
        setState({ kind: 'error', message: msg });
      }
    })();
  }, [params.code, t]);

  // Submit handler for the nickname step. Sets the display name, generates
  // a friend code (so the new user can also invite others), then continues
  // with the friend-add + bonus claim.
  const submitName = async (name: string) => {
    if (state.kind !== 'needs_name') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setState({ kind: 'loading' });
    try {
      await setDisplayName(trimmed);
      await ensureFriendCode();
      await processFriendAndBonus(state.code, t, setState);
    } catch (e) {
      const msg = e instanceof FriendsError ? e.message : t('invite.error_unknown');
      setState({ kind: 'error', message: msg });
    }
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-canvas px-8 dark:bg-canvas-dark">
      <TabletContainer style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {state.kind === 'loading' ? (
        <ActivityIndicator color="#2EC4A5" size="large" />
      ) : state.kind === 'success' ? (
        <View className="items-center">
          <View className="rounded-full bg-accent-soft p-4 dark:bg-accent-soft-dark">
            <MaterialIcons name="check-circle" size={48} color="#2EC4A5" />
          </View>
          <Text className="mt-4 text-center text-2xl font-bold text-ink dark:text-ink-dark">
            {state.alreadyClaimed ? t('invite.added_already_claimed') : t('invite.added_title')}
          </Text>
          {state.alreadyClaimed ? null : (
            <Text className="mt-2 text-center text-base text-muted">
              {t('invite.bonus_message', { days: state.bonusDays })}
            </Text>
          )}
          <Pressable
            onPress={() => router.replace('/(tabs)/dashboard')}
            className="mt-8 rounded-xl bg-ink px-8 py-4 dark:bg-ink-dark"
          >
            <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
              {t('invite.go_to_dashboard')}
            </Text>
          </Pressable>
        </View>
      ) : state.kind === 'needs_name' ? (
        <NicknameStep onSubmit={submitName} t={t} />
      ) : state.kind === 'needs_signup' ? (
        <NeedsSignupView code={state.code} t={t} />
      ) : (
        <View className="items-center">
          <View className="rounded-full bg-danger-soft p-4 dark:bg-danger-soft-dark">
            <MaterialIcons name="error-outline" size={48} color="#E0654F" />
          </View>
          <Text className="mt-4 text-center text-xl font-bold text-ink dark:text-ink-dark">
            {t('invite.error_title')}
          </Text>
          <Text className="mt-2 text-center text-base text-muted">
            {state.message}
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            className="mt-8 rounded-xl bg-ink px-8 py-4 dark:bg-ink-dark"
          >
            <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
              {t('common.close')}
            </Text>
          </Pressable>
        </View>
      )}
      </TabletContainer>
    </SafeAreaView>
  );
}

// Shown when the invite link was opened by a guest. Mobile guests can sign
// up in-app (auto-applies the pending invite after auth). Web visitors who
// landed here from a shared link see the App Store / Play badges + the
// visible code, since there's no app session to bounce them to.
function NeedsSignupView({
  code,
  t,
}: {
  code: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isWeb = Platform.OS === 'web';
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const openStore = (target: 'ios' | 'android') => {
    Linking.openURL(`https://moavoca.com/get/${target}`).catch(() => { /* no-op */ });
  };

  return (
    <View className="w-full max-w-sm items-center">
      <View className="rounded-full bg-accent-soft p-4 dark:bg-accent-soft-dark">
        <MaterialIcons name="card-giftcard" size={48} color="#2EC4A5" />
      </View>
      <Text className="mt-4 text-center text-2xl font-bold text-ink dark:text-ink-dark">
        {t('invite.signup_title')}
      </Text>

      {/* Always-visible code block — works whether user signs up here or
          copies the code and pastes it manually in-app after install. */}
      <Pressable
        onPress={onCopy}
        className="mt-6 w-full items-center rounded-xl border border-line bg-canvas p-4 dark:border-line-dark dark:bg-canvas-dark"
        accessibilityRole="button"
        accessibilityLabel={t('common.copy')}
      >
        <Text className="text-xs text-muted">{t('invite.code_label')}</Text>
        <Text className="mt-1 text-3xl font-bold tracking-[6px] text-ink dark:text-ink-dark">
          {code}
        </Text>
        <View className="mt-2 flex-row items-center">
          <MaterialIcons
            name={copied ? 'check' : 'content-copy'}
            size={14}
            color={copied ? '#2EC4A5' : '#7B7366'}
          />
          <Text className={`ml-1 text-xs ${copied ? 'text-accent-deep' : 'text-muted'}`}>
            {copied ? t('common.copied') : t('common.copy')}
          </Text>
        </View>
      </Pressable>

      {isWeb ? (
        <View className="mt-6 w-full">
          <Text className="text-center text-sm text-muted">
            {t('invite.download_app')}
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              onPress={() => openStore('ios')}
              className="flex-1 items-center rounded-xl border border-line py-3 dark:border-line-dark"
              accessibilityRole="button"
            >
              <Text className="text-xs text-muted">Download on the</Text>
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                App Store
              </Text>
            </Pressable>
            <Pressable
              onPress={() => openStore('android')}
              className="flex-1 items-center rounded-xl border border-line py-3 dark:border-line-dark"
              accessibilityRole="button"
            >
              <Text className="text-xs text-muted">Get it on</Text>
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                Google Play
              </Text>
            </Pressable>
          </View>
          <Text className="mt-4 text-center text-xs text-muted">
            {t('invite.enter_code_after_install')}
          </Text>
        </View>
      ) : (
        <>
          <Text className="mt-3 text-center text-sm text-muted">
            {t('invite.signup_message', { code })}
          </Text>
          <Pressable
            onPress={() => router.replace('/auth')}
            className="mt-6 w-full items-center rounded-xl bg-ink py-4 dark:bg-ink-dark"
          >
            <Text className="text-base font-semibold text-canvas dark:text-canvas-dark">
              {t('invite.signup_cta')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            className="mt-3 px-4 py-2"
          >
            <Text className="text-sm text-muted">{t('common.skip')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function NicknameStep({
  onSubmit,
  t,
}: {
  onSubmit: (name: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const trimmed = name.trim();

  return (
    <View className="w-full max-w-sm items-center">
      <View className="rounded-full bg-accent-soft p-4 dark:bg-accent-soft-dark">
        <MaterialIcons name="badge" size={48} color="#2EC4A5" />
      </View>
      <Text className="mt-4 text-center text-2xl font-bold text-ink dark:text-ink-dark">
        {t('invite.name_title')}
      </Text>
      <Text className="mt-2 text-center text-base text-muted">
        {t('invite.name_hint')}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('invite.name_placeholder')}
        placeholderTextColor="#A79E90"
        autoFocus
        maxLength={20}
        className="mt-6 w-full rounded-xl border border-line px-4 py-3 text-center text-base text-ink dark:border-line-dark dark:text-ink-dark"
      />
      <Pressable
        onPress={async () => {
          if (!trimmed || submitting) return;
          setSubmitting(true);
          await onSubmit(trimmed);
        }}
        disabled={!trimmed || submitting}
        className={`mt-6 w-full items-center rounded-xl py-4 ${
          !trimmed || submitting ? 'bg-clay dark:bg-clay-dark' : 'bg-ink dark:bg-ink-dark'
        }`}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className={`text-base font-semibold ${
            trimmed ? 'text-canvas dark:text-canvas-dark' : 'text-faint'
          }`}>
            {t('invite.name_continue')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
