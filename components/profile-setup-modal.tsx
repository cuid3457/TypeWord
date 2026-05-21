import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { setDisplayName, setUsername, validateUsername, type UsernameValidation } from '@src/services/friendsService';

/**
 * Combined profile-setup modal: username + displayName.
 *
 * Used in three flows:
 *   - new sign-up
 *   - existing-user migration (one-time prompt to claim a username)
 *   - any action gated on a populated profile (e.g. community upload)
 *
 * Auto-suggest fills the username field from the displayName once the user
 * stops typing. The user can override the suggestion at any point.
 */

type ValidationState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'ok' }
  | { phase: 'error'; code: string };

const SCRIPT_RE = {
  latin: /[A-Za-z]/,
  hangul: /[가-힣]/,
  kana: /[ぁ-ゖ゠-ヺー]/,
  han: /[一-鿿]/,
  cyrillic: /[а-яёА-ЯЁ]/,
};

function suggestUsername(displayName: string): string {
  const s = displayName.trim();
  if (!s) return '';
  // Detect dominant script and keep only chars in that script + digits + . _
  if (SCRIPT_RE.hangul.test(s)) {
    return [...s].filter((c) => /[가-힣0-9._]/.test(c)).join('').slice(0, 20);
  }
  if (SCRIPT_RE.kana.test(s) || (SCRIPT_RE.han.test(s) && !SCRIPT_RE.hangul.test(s) && /[ぁ-ゖ゠-ヺー]/.test(s))) {
    return [...s].filter((c) => /[ぁ-ゖ゠-ヺー一-鿿0-9._]/u.test(c)).join('').slice(0, 20);
  }
  if (SCRIPT_RE.han.test(s)) {
    return [...s].filter((c) => /[一-鿿0-9._]/u.test(c)).join('').slice(0, 20);
  }
  if (SCRIPT_RE.cyrillic.test(s)) {
    return s.toLowerCase().split('').filter((c) => /[а-яё0-9._]/u.test(c)).join('').slice(0, 20);
  }
  // Latin fallback
  return s.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
}

export function ProfileSetupModal({
  visible,
  initialDisplayName,
  initialUsername,
  onSaved,
  onCancel,
  cancellable = true,
}: {
  visible: boolean;
  initialDisplayName?: string;
  initialUsername?: string;
  onSaved: (data: { displayName: string; username: string }) => void;
  onCancel?: () => void;
  cancellable?: boolean;
}) {
  const { t } = useTranslation();
  const [displayName, setDisplayNameLocal] = useState(initialDisplayName ?? '');
  const [username, setUsernameLocal] = useState(initialUsername ?? '');
  const [usernameTouched, setUsernameTouched] = useState(!!initialUsername);
  const [validation, setValidation] = useState<ValidationState>({ phase: 'idle' });
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setDisplayNameLocal(initialDisplayName ?? '');
      setUsernameLocal(initialUsername ?? '');
      setUsernameTouched(!!initialUsername);
      setValidation({ phase: 'idle' });
    }
  }, [visible, initialDisplayName, initialUsername]);

  // Auto-suggest username from displayName until user manually edits username.
  useEffect(() => {
    if (usernameTouched) return;
    setUsernameLocal(suggestUsername(displayName));
  }, [displayName, usernameTouched]);

  // Debounced server-side validation when username changes.
  const runValidation = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setValidation({ phase: 'idle' });
      return;
    }
    setValidation({ phase: 'checking' });
    const seq = ++requestSeqRef.current;
    const result: UsernameValidation = await validateUsername(value);
    if (seq !== requestSeqRef.current) return;
    if (result.ok) {
      setValidation({ phase: 'ok' });
    } else {
      setValidation({ phase: 'error', code: result.code ?? 'invalid_format' });
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runValidation(username), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, runValidation]);

  const canSave = displayName.trim().length > 0 && validation.phase === 'ok' && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Display name first (cheap profiles update). If username conflicts in
      // the race window we still persist the display name change — that's a
      // fine outcome.
      await setDisplayName(displayName.trim());
      const result = await setUsername(username);
      if (!result.ok) {
        setValidation({ phase: 'error', code: result.code ?? 'taken' });
        setSaving(false);
        return;
      }
      onSaved({ displayName: displayName.trim(), username: result.normalized ?? username });
    } catch {
      // silent — keep modal open so user can retry
    } finally {
      setSaving(false);
    }
  };

  const validationLabel = (() => {
    if (validation.phase === 'idle') return null;
    if (validation.phase === 'checking') return { color: 'text-gray-400', text: t('profile_setup.checking') };
    if (validation.phase === 'ok') return { color: 'text-emerald-600', text: t('profile_setup.available') };
    const errMap: Record<string, string> = {
      too_short: t('profile_setup.error_too_short'),
      too_long: t('profile_setup.error_too_long'),
      invalid_format: t('profile_setup.error_format'),
      mixed_script: t('profile_setup.error_mixed_script'),
      reserved: t('profile_setup.error_reserved'),
      blocklist_match: t('profile_setup.error_inappropriate'),
      moderation_flagged: t('profile_setup.error_inappropriate'),
      taken: t('profile_setup.error_taken'),
    };
    return { color: 'text-red-600', text: errMap[validation.code] ?? t('profile_setup.error_format') };
  })();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancellable && onCancel ? onCancel : () => {}}>
      <Pressable
        onPress={cancellable && onCancel ? onCancel : undefined}
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-gray-900">
          <Text className="text-lg font-bold text-black dark:text-white">
            {t('profile_setup.title')}
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            {t('profile_setup.subtitle')}
          </Text>

          <Text className="mt-5 text-xs font-semibold text-gray-600 dark:text-gray-400">
            {t('profile_setup.display_name_label')}
          </Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayNameLocal}
            placeholder={t('profile_setup.display_name_placeholder')}
            placeholderTextColor="#9ca3af"
            maxLength={20}
            className="mt-1 rounded-xl border border-gray-300 px-3 py-2.5 text-base text-black dark:border-gray-700 dark:text-white"
          />

          <Text className="mt-4 text-xs font-semibold text-gray-600 dark:text-gray-400">
            {t('profile_setup.username_label')}
          </Text>
          <View className="mt-1 flex-row items-center rounded-xl border border-gray-300 px-3 dark:border-gray-700">
            <Text className="text-base text-gray-400">@</Text>
            <TextInput
              value={username}
              onChangeText={(v) => { setUsernameTouched(true); setUsernameLocal(v); }}
              placeholder={t('profile_setup.username_placeholder')}
              placeholderTextColor="#9ca3af"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              className="ml-1 flex-1 py-2.5 text-base text-black dark:text-white"
            />
          </View>
          {validationLabel ? (
            <Text className={`mt-1.5 text-xs ${validationLabel.color}`}>
              {validationLabel.text}
            </Text>
          ) : (
            <Text className="mt-1.5 text-xs text-gray-400">
              {t('profile_setup.username_hint')}
            </Text>
          )}

          <Pressable
            onPress={submit}
            disabled={!canSave}
            className={`mt-5 items-center rounded-xl py-4 ${
              canSave ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-base font-semibold ${
                canSave ? 'text-white dark:text-black' : 'text-gray-400'
              }`}>
                {t('common.save')}
              </Text>
            )}
          </Pressable>
          {cancellable && onCancel ? (
            <Pressable onPress={onCancel} className="mt-2 items-center py-2">
              <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
