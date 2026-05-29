import { Pressable, Text, View } from 'react-native';

import { BottomSheetShell } from '@/components/bottom-sheet-shell';

interface AppModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttonText: string;
  onClose: () => void;
  /** If provided, shows a two-button layout: cancel (buttonText) + confirm (confirmText). */
  confirmText?: string;
  onConfirm?: () => void;
  destructive?: boolean;
  /**
   * Optional link-style action rendered between the message and main buttons.
   * Useful for "Manage Subscription"–type accessory actions that need to be
   * distinct from the primary confirm/cancel choice.
   */
  secondaryText?: string;
  onSecondary?: () => void;
}

export function AppModal({
  visible,
  title,
  message,
  buttonText,
  onClose,
  confirmText,
  onConfirm,
  destructive,
  secondaryText,
  onSecondary,
}: AppModalProps) {
  const hasTwoButtons = !!(confirmText && onConfirm);
  const hasSecondary = !!(secondaryText && onSecondary);

  return (
    <BottomSheetShell
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
    >
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50"
        style={{ paddingHorizontal: 23 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full max-w-md rounded-2xl bg-surface p-6 dark:bg-surface-dark"
        >
          <Text className="text-lg font-bold text-ink dark:text-ink-dark">
            {title}
          </Text>
          <Text className="mt-3 text-sm leading-5 text-muted">
            {message}
          </Text>

          {hasSecondary ? (
            <Pressable
              onPress={onSecondary}
              className="mt-4 items-center rounded-xl border border-[#2EC4A5] bg-[#2EC4A510] py-3"
            >
              <Text className="text-sm font-semibold text-[#2EC4A5]">
                {secondaryText}
              </Text>
            </Pressable>
          ) : null}

          {hasTwoButtons ? (
            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={onClose}
                className="flex-1 items-center rounded-xl border border-line py-3 dark:border-line-dark"
              >
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                  {buttonText}
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                className={`flex-1 items-center rounded-xl py-3 ${
                  destructive
                    ? 'bg-danger'
                    : 'bg-ink dark:bg-ink-dark'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    destructive
                      ? 'text-white'
                      : 'text-canvas dark:text-canvas-dark'
                  }`}
                >
                  {confirmText}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onClose}
              className="mt-5 items-center rounded-xl bg-ink py-3 dark:bg-ink-dark"
            >
              <Text className="text-sm font-semibold text-canvas dark:text-canvas-dark">
                {buttonText}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </BottomSheetShell>
  );
}
