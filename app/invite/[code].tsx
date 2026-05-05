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
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    <SafeAreaView className="flex-1 items-center justify-center bg-white px-8 dark:bg-black">
      {state.kind === 'loading' ? (
        <ActivityIndicator color="#2EC4A5" size="large" />
      ) : state.kind === 'success' ? (
        <View className="items-center">
          <View className="rounded-full bg-emerald-100 p-4 dark:bg-emerald-900">
            <MaterialIcons name="check-circle" size={48} color="#2EC4A5" />
          </View>
          <Text className="mt-4 text-center text-2xl font-bold text-black dark:text-white">
            {state.alreadyClaimed ? t('invite.added_already_claimed') : t('invite.added_title')}
          </Text>
          {state.alreadyClaimed ? null : (
            <Text className="mt-2 text-center text-base text-gray-500">
              {t('invite.bonus_message', { days: state.bonusDays })}
            </Text>
          )}
          <Pressable
            onPress={() => router.replace('/(tabs)/dashboard')}
            className="mt-8 rounded-xl bg-black px-8 py-4 dark:bg-white"
          >
            <Text className="text-base font-semibold text-white dark:text-black">
              {t('invite.go_to_dashboard')}
            </Text>
          </Pressable>
        </View>
      ) : state.kind === 'needs_name' ? (
        <NicknameStep onSubmit={submitName} t={t} />
      ) : state.kind === 'needs_signup' ? (
        <View className="items-center">
          <View className="rounded-full bg-blue-100 p-4 dark:bg-blue-900">
            <MaterialIcons name="person-add" size={48} color="#3b82f6" />
          </View>
          <Text className="mt-4 text-center text-2xl font-bold text-black dark:text-white">
            {t('invite.signup_title')}
          </Text>
          <Text className="mt-2 text-center text-base text-gray-500">
            {t('invite.signup_message', { code: state.code })}
          </Text>
          <Pressable
            onPress={() => router.replace('/auth')}
            className="mt-8 rounded-xl bg-black px-8 py-4 dark:bg-white"
          >
            <Text className="text-base font-semibold text-white dark:text-black">
              {t('invite.signup_cta')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            className="mt-3 px-4 py-2"
          >
            <Text className="text-sm text-gray-500">{t('common.skip')}</Text>
          </Pressable>
        </View>
      ) : (
        <View className="items-center">
          <View className="rounded-full bg-red-100 p-4 dark:bg-red-900">
            <MaterialIcons name="error-outline" size={48} color="#ef4444" />
          </View>
          <Text className="mt-4 text-center text-xl font-bold text-black dark:text-white">
            {t('invite.error_title')}
          </Text>
          <Text className="mt-2 text-center text-base text-gray-500">
            {state.message}
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            className="mt-8 rounded-xl bg-black px-8 py-4 dark:bg-white"
          >
            <Text className="text-base font-semibold text-white dark:text-black">
              {t('common.close')}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
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
      <View className="rounded-full bg-emerald-100 p-4 dark:bg-emerald-900">
        <MaterialIcons name="badge" size={48} color="#2EC4A5" />
      </View>
      <Text className="mt-4 text-center text-2xl font-bold text-black dark:text-white">
        {t('invite.name_title')}
      </Text>
      <Text className="mt-2 text-center text-base text-gray-500">
        {t('invite.name_hint')}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('invite.name_placeholder')}
        placeholderTextColor="#9ca3af"
        autoFocus
        maxLength={20}
        className="mt-6 w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-base text-black dark:border-gray-700 dark:text-white"
      />
      <Pressable
        onPress={async () => {
          if (!trimmed || submitting) return;
          setSubmitting(true);
          await onSubmit(trimmed);
        }}
        disabled={!trimmed || submitting}
        className={`mt-6 w-full items-center rounded-xl py-4 ${
          !trimmed || submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-black dark:bg-white'
        }`}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className={`text-base font-semibold ${
            trimmed ? 'text-white dark:text-black' : 'text-gray-400'
          }`}>
            {t('invite.name_continue')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
