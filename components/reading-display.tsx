import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, Text, View } from 'react-native';
import { phonemeForChinese, speakWord } from '@src/utils/ttsLocale';

/** Languages where reading text can be spoken by TTS (hiragana / pinyin). */
const SPEAKABLE_READINGS = new Set(['ja', 'zh', 'zh-CN', 'zh-TW']);

function isChineseLang(lang: string): boolean {
  return lang === 'zh' || lang === 'zh-CN' || lang === 'zh-TW';
}

/**
 * Displays word readings. For ja/zh with multiple readings, each reading is
 * individually tappable to hear its pronunciation via TTS.
 *
 * For Chinese: tapping a reading pill plays the parent hanzi (`word`) with
 * the pill's pinyin overriding Azure's default pronunciation via SSML
 * phoneme. Without `word` we fall back to speaking the pinyin string itself,
 * which Azure mispronounces — pass `word` whenever the parent hanzi is known.
 */
export function ReadingDisplay({
  reading,
  sourceLang,
  word,
  compact,
}: {
  reading: string | string[];
  sourceLang: string;
  /** The parent hanzi/kanji. Required for correct Chinese phoneme playback. */
  word?: string;
  /** Compact mode for inline use (e.g. word list rows). No tap-to-speak. */
  compact?: boolean;
}) {
  const readings = Array.isArray(reading) ? reading : [reading];
  const canSpeak = SPEAKABLE_READINGS.has(sourceLang);
  const formatted = readings.join(' / ');

  // Compact: plain text, no interaction. The compact variant lives inside a
  // gap-spaced flex row in its only caller (wordlist row header), so the
  // text itself carries no horizontal margin — spacing comes from parent
  // columnGap and wrapped items land flush at the line's left edge.
  if (compact || readings.length <= 1 || !canSpeak) {
    return (
      <Text className={compact ? 'text-sm text-gray-400' : 'mt-1 text-sm text-gray-400'}>
        {formatted}
      </Text>
    );
  }

  // Multi-reading with TTS: each reading is tappable
  return (
    <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
      {readings.map((r, i) => {
        const handlePress = () => {
          if (isChineseLang(sourceLang) && word) {
            const ph = phonemeForChinese(sourceLang, [r], word);
            speakWord(word, sourceLang, ph ?? undefined);
          } else {
            speakWord(r, sourceLang);
          }
        };
        return (
          <Pressable
            key={i}
            onPress={handlePress}
            className="flex-row items-center rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800"
          >
            <MaterialIcons name="volume-up" size={11} color="#10b981" />
            <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">{r}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
