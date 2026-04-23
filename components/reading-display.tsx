import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, Text, View } from 'react-native';
import { speakWord } from '@src/utils/ttsLocale';

/** Languages where reading text can be spoken by TTS (hiragana / pinyin). */
const SPEAKABLE_READINGS = new Set(['ja', 'zh']);

/**
 * Displays word readings. For ja/zh with multiple readings, each reading is
 * individually tappable to hear its pronunciation via TTS.
 */
export function ReadingDisplay({
  reading,
  sourceLang,
  compact,
}: {
  reading: string | string[];
  sourceLang: string;
  /** Compact mode for inline use (e.g. word list rows). No tap-to-speak. */
  compact?: boolean;
}) {
  const readings = Array.isArray(reading) ? reading : [reading];
  const canSpeak = SPEAKABLE_READINGS.has(sourceLang);
  const formatted = readings.join(' / ');

  // Compact: plain text, no interaction
  if (compact || readings.length <= 1 || !canSpeak) {
    return (
      <Text className={compact ? 'ml-1.5 text-sm text-gray-400' : 'mt-1 text-sm text-gray-400'}>
        {formatted}
      </Text>
    );
  }

  // Multi-reading with TTS: each reading is tappable
  return (
    <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
      {readings.map((r, i) => (
        <Pressable
          key={i}
          onPress={() => speakWord(r, sourceLang)}
          className="flex-row items-center rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800"
        >
          <MaterialIcons name="volume-up" size={11} color="#9ca3af" />
          <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">{r}</Text>
        </Pressable>
      ))}
    </View>
  );
}
