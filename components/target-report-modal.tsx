import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  reportUser,
  reportWordlist,
  type UserReportReason,
  type WordlistReportReason,
} from '@src/services/friendsService';

type Target =
  | { kind: 'wordlist'; id: string; title: string }
  | { kind: 'user'; id: string; label: string };

// `low_quality` intentionally omitted — AI-generated definitions/examples
// are our app's output, not the uploader's. Quality complaints belong in
// per-word feedback (report-modal.tsx) or the support inquiry form, not
// in moderation reports against the uploader.
const WORDLIST_REASONS: WordlistReportReason[] = [
  'inappropriate_content',
  'spam',
  'copyright',
  'other',
];

const USER_REASONS: UserReportReason[] = [
  'inappropriate_profile',
  'harassment',
  'spam',
  'impersonation',
  'other',
];

/**
 * Generic report modal used for both community wordlists and users.
 * Caller picks the target kind; reasons + submit handler swap accordingly.
 * The same gesture-free centered modal style as profile-setup-modal so both
 * entry points feel native.
 */
export function TargetReportModal({
  visible,
  target,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  target: Target | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Manual keyboard-offset tracking — RN's KeyboardAvoidingView is
  // unreliable inside <Modal> on Android even with adjustResize in the
  // manifest. Mirrors the pattern used by report-modal.tsx.
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDescription('');
      setSubmitting(false);
    }
  }, [visible, target]);

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      const h = e.endCoordinates.height;
      setKeyboardOffset(Platform.OS === 'ios' ? h - insets.bottom : h);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOffset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, insets.bottom]);

  if (!target) return null;

  const reasons = target.kind === 'wordlist' ? WORDLIST_REASONS : USER_REASONS;
  const targetLabel = target.kind === 'wordlist' ? target.title : target.label;

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      if (target.kind === 'wordlist') {
        await reportWordlist(target.id, reason as WordlistReportReason, description.trim() || undefined);
      } else {
        await reportUser(target.id, reason as UserReportReason, description.trim() || undefined);
      }
      onSubmitted();
    } catch {
      // surface a generic error via parent — most failures here are network / auth
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={() => {
          // Progressive dismiss: first backdrop tap closes the keyboard
          // (if open), the second closes the modal. Matches the iOS
          // dismissal pattern that users expect for input modals.
          if (keyboardOffset > 0) Keyboard.dismiss();
          else onClose();
        }}
        className={`flex-1 items-center bg-black/50 px-6 ${keyboardOffset > 0 ? 'justify-end' : 'justify-center'}`}
        // When keyboard is open: anchor the card's bottom edge just above
        // the keyboard. As the multiline TextInput grows, the card grows
        // upward from this anchor (instead of overflowing the centered
        // area and getting covered).
        style={{ paddingBottom: keyboardOffset > 0 ? keyboardOffset + 16 : 0 }}
      >
        <Pressable
          // Tap on empty area of the card dismisses the keyboard. Child
          // Pressables (radio rows, submit, cancel) intercept their own
          // taps so this only fires for "blank" card space.
          onPress={() => Keyboard.dismiss()}
          className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-gray-900"
        >
          <View className="flex-row items-center">
            <MaterialIcons name="flag" size={20} color="#ef4444" />
            <Text className="ml-2 text-lg font-bold text-black dark:text-white">
              {target.kind === 'wordlist' ? t('report.title_wordlist') : t('report.title_user')}
            </Text>
          </View>
          {targetLabel ? (
            <Text className="mt-1 text-sm text-gray-500" numberOfLines={1}>
              {targetLabel}
            </Text>
          ) : null}
          <Text className="mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('report.reason_label')}
          </Text>
          <View className="mt-2">
            {reasons.map((r) => {
              const selected = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  className={`mt-1.5 flex-row items-center rounded-xl border px-3 py-2.5 ${
                    selected
                      ? 'border-red-500 bg-red-50 dark:bg-red-950'
                      : 'border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <MaterialIcons
                    name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={18}
                    color={selected ? '#ef4444' : '#9ca3af'}
                  />
                  <Text className={`ml-2 text-sm ${
                    selected ? 'font-semibold text-red-700 dark:text-red-300' : 'text-black dark:text-white'
                  }`}>
                    {t(`report.reasons.${target.kind}.${r}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('report.description_label')}
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder=""
            multiline
            maxLength={200}
            className="mt-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-black dark:border-gray-700 dark:text-white"
            style={{ minHeight: 60, textAlignVertical: 'top' }}
          />
          <Text className="mt-1 text-right text-xs text-gray-400">
            ({description.length}/200)
          </Text>
          <Pressable
            onPress={submit}
            disabled={!reason || submitting}
            className={`mt-4 items-center rounded-xl py-4 ${
              !reason || submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-red-600'
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-base font-semibold ${
                !reason ? 'text-gray-400' : 'text-white'
              }`}>
                {t('report.submit')}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} className="mt-2 items-center py-2">
            <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
