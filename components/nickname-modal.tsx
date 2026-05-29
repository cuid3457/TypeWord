import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput } from 'react-native';

import { BottomSheetShell } from '@/components/bottom-sheet-shell';
import { setDisplayName } from '@src/services/friendsService';

/**
 * Required nickname-collection modal. Shown lazily at the first action
 * that needs a public-facing name (currently community wordlist upload;
 * the friend-code setup flow has its own combined nickname + code modal).
 *
 * Cancel dismisses the modal AND aborts the parent action — `onCancel`
 * fires so the caller can reset its submission state.
 */
export function NicknameModal({
  visible,
  initialName,
  onSaved,
  onCancel,
}: {
  visible: boolean;
  initialName?: string;
  onSaved: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setName(initialName ?? '');
  }, [visible, initialName]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await setDisplayName(trimmed);
      onSaved(trimmed);
    } catch {
      // silent — user can retry; cancel is also available
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetShell visible={visible} onRequestClose={onCancel} animationType="fade">
      <Pressable onPress={onCancel} className="flex-1 items-center justify-center bg-black/50 px-6">
        <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm rounded-2xl bg-surface p-6 dark:bg-surface-dark">
          <Text className="text-lg font-bold text-ink dark:text-ink-dark">
            {t('nickname_modal.title')}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {t('nickname_modal.hint')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('nickname_modal.placeholder')}
            placeholderTextColor="#A79E90"
            maxLength={20}
            autoFocus
            className="mt-4 rounded-xl border border-line px-4 py-3 text-base text-ink dark:border-line-dark dark:text-ink-dark"
          />
          <Pressable
            onPress={submit}
            disabled={!name.trim() || saving}
            className={`mt-4 items-center rounded-xl py-4 ${
              !name.trim() || saving ? 'bg-clay dark:bg-clay-dark' : 'bg-ink dark:bg-ink-dark'
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-base font-semibold ${
                !name.trim() ? 'text-faint' : 'text-canvas dark:text-canvas-dark'
              }`}>
                {t('common.save')}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onCancel} className="mt-2 items-center py-2">
            <Text className="text-sm text-muted">{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </BottomSheetShell>
  );
}
