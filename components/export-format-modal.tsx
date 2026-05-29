/**
 * Modal that lets the user pick between CSV (free) and PDF (premium) when
 * exporting a wordlist. Designed to match the rest of the in-app modal
 * style (rounded card, dark overlay) instead of the OS-native Alert that
 * jars with the rest of the UI.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, Text, View } from 'react-native';

import { BottomSheetShell } from '@/components/bottom-sheet-shell';

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
    <BottomSheetShell visible={visible} onRequestClose={onClose} animationType="fade">
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full max-w-sm rounded-2xl bg-surface p-6 dark:bg-surface-dark"
        >
          <Text className="text-lg font-bold text-ink dark:text-ink-dark">
            {title}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            {subtitle}
          </Text>

          {/* CSV card */}
          <Pressable
            onPress={onPickCsv}
            className="mt-5 flex-row items-center rounded-xl border border-line p-4 dark:border-line-dark"
          >
            <View className="mr-4 h-10 w-10 items-center justify-center rounded-lg bg-clay dark:bg-clay-dark">
              <MaterialIcons name="grid-on" size={22} color="#7B7366" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink dark:text-ink-dark">
                {csvTitle}
              </Text>
              <Text className="mt-0.5 text-xs text-muted">
                {csvDescription}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#A79E90" />
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
                <Text className="text-base font-semibold text-ink dark:text-ink-dark">
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
              <Text className="mt-0.5 text-xs text-muted">
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
            <Text className="text-sm font-medium text-muted">
              {cancelText}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </BottomSheetShell>
  );
}
