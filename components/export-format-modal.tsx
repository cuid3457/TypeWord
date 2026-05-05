/**
 * Modal that lets the user pick between CSV (free) and PDF (premium) when
 * exporting a wordlist. Designed to match the rest of the in-app modal
 * style (rounded card, dark overlay) instead of the OS-native Alert that
 * jars with the rest of the UI.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, Text, View } from 'react-native';

interface ExportFormatModalProps {
  visible: boolean;
  premium: boolean;
  title: string;
  subtitle: string;
  csvTitle: string;
  csvDescription: string;
  pdfTitle: string;
  pdfDescription: string;
  pdfLockedHint: string;
  cancelText: string;
  onPickCsv: () => void;
  onPickPdf: () => void;
  onClose: () => void;
}

export function ExportFormatModal({
  visible,
  premium,
  title,
  subtitle,
  csvTitle,
  csvDescription,
  pdfTitle,
  pdfDescription,
  pdfLockedHint,
  cancelText,
  onPickCsv,
  onPickPdf,
  onClose,
}: ExportFormatModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-gray-900"
        >
          <Text className="text-lg font-bold text-black dark:text-white">
            {title}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300">
            {subtitle}
          </Text>

          {/* CSV card */}
          <Pressable
            onPress={onPickCsv}
            className="mt-5 flex-row items-center rounded-xl border border-gray-300 p-4 dark:border-gray-700"
          >
            <View className="mr-4 h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <MaterialIcons name="grid-on" size={22} color="#6b7280" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-black dark:text-white">
                {csvTitle}
              </Text>
              <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {csvDescription}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
          </Pressable>

          {/* PDF card */}
          <Pressable
            onPress={onPickPdf}
            className="mt-3 flex-row items-center rounded-xl border border-[#2EC4A5] bg-[#2EC4A510] p-4"
          >
            <View className="mr-4 h-10 w-10 items-center justify-center rounded-lg bg-[#2EC4A5]">
              <MaterialIcons name="picture-as-pdf" size={22} color="#ffffff" />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-base font-semibold text-black dark:text-white">
                  {pdfTitle}
                </Text>
                {!premium ? (
                  <View className="ml-2 flex-row items-center rounded-full bg-[#2EC4A5] px-2 py-0.5">
                    <MaterialIcons name="lock" size={10} color="#ffffff" />
                    <Text className="ml-1 text-[10px] font-bold text-white">
                      {pdfLockedHint}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {pdfDescription}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#2EC4A5" />
          </Pressable>

          {/* Cancel */}
          <Pressable
            onPress={onClose}
            className="mt-5 items-center py-2"
          >
            <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {cancelText}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
