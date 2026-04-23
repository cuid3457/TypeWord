import { Modal, Pressable, Text, View } from 'react-native';

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
}: AppModalProps) {
  const hasTwoButtons = !!(confirmText && onConfirm);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50"
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="mx-8 w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-gray-900"
        >
          <Text className="text-lg font-bold text-black dark:text-white">
            {title}
          </Text>
          <Text className="mt-3 text-sm leading-5 text-gray-600 dark:text-gray-300">
            {message}
          </Text>

          {hasTwoButtons ? (
            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={onClose}
                className="flex-1 items-center rounded-xl border border-gray-300 py-3 dark:border-gray-700"
              >
                <Text className="text-sm font-semibold text-black dark:text-white">
                  {buttonText}
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                className={`flex-1 items-center rounded-xl py-3 ${
                  destructive
                    ? 'bg-red-600'
                    : 'bg-black dark:bg-white'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    destructive
                      ? 'text-white'
                      : 'text-white dark:text-black'
                  }`}
                >
                  {confirmText}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onClose}
              className="mt-5 items-center rounded-xl bg-black py-3 dark:bg-white"
            >
              <Text className="text-sm font-semibold text-white dark:text-black">
                {buttonText}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
