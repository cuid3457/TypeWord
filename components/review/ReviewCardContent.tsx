import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ReadingDisplay } from '@/components/reading-display';
import { getTtsText, speakWord } from '@src/utils/ttsLocale';
import { formatPOS } from '@src/utils/normalizeResult';
import { compareDictation } from '@src/utils/dictationCompare';
import type { StoredWord } from '@src/db/queries';

type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank';

interface Props {
  mode: ReviewMode;
  current: StoredWord;
  langs: Record<string, string>;
  cardReversed: boolean;
  flipped: boolean;
  setFlipped: (v: boolean) => void;
  choices: string[];
  choiceSelected: number | null;
  setChoiceSelected: (i: number | null) => void;
  correctDefinition: string;
  contextExampleIdx: number;
  dictationInput: string;
  setDictationInput: (v: string) => void;
  dictationChecked: boolean;
  setDictationChecked: (v: boolean) => void;
  dictationListening: boolean;
  onDictationMicPress: () => void;
  onSpeak: () => void;
}

export function ReviewCardContent({
  mode,
  current,
  langs,
  cardReversed,
  flipped,
  setFlipped,
  choices,
  choiceSelected,
  setChoiceSelected,
  correctDefinition,
  contextExampleIdx,
  dictationInput,
  setDictationInput,
  dictationChecked,
  setDictationChecked,
  dictationListening,
  onDictationMicPress,
  onSpeak,
}: Props) {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const meanings = current.result.meanings ?? [];

  const renderWordHeader = () => (
    <View className="items-center">
      {/* Word stretches to full width so long compounds (Krankenversicherung,
          antidisestablishmentarianism, …) wrap as centered multi-line text
          instead of pushing the speaker icon off-center. Speaker sits below
          the word as its own row — always vertically centered, never affected
          by word length. */}
      <Text
        className="text-3xl font-bold text-center text-black dark:text-white"
        style={{ alignSelf: 'stretch' }}
      >
        {current.word}
      </Text>
      {current.result.reading ? (
        <ReadingDisplay
          reading={current.result.reading}
          sourceLang={current.bookId ? langs[current.bookId] ?? 'en' : 'en'}
          word={current.word}
        />
      ) : null}
      <Pressable
        onPress={onSpeak}
        className="mt-3 rounded-full bg-gray-100 p-2 dark:bg-gray-800"
        accessibilityLabel={t('common.speak')}
        accessibilityRole="button"
      >
        <MaterialIcons name="volume-up" size={20} color="#10b981" />
      </Pressable>
    </View>
  );

  const renderMeanings = () => (
    <View className="mt-6">
      {meanings.map((m, i) => (
        <View key={i} className="mb-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
          {m.partOfSpeech ? (
            <Text className="text-xs text-gray-500">{formatPOS(m.partOfSpeech, m.gender, i18n.language)}</Text>
          ) : null}
          <Text className="mt-1 text-base text-black dark:text-white">
            {meanings.length > 1 ? `${i + 1}. ` : ''}{m.definition}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderExamples = () =>
    current.result.examples?.length ? (
      <View className="mt-3">
        {current.result.examples.map((e, i) => (
          <View key={i} className="mb-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
            <View className="flex-row items-start">
              <Text className="flex-1 text-sm italic text-black dark:text-white">
                {e.sentence.includes('**')
                  ? e.sentence.split('**').map((seg, si) =>
                      si % 2 === 1
                        ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
                        : <Text key={si}>{seg}</Text>
                    )
                  : e.sentence}
              </Text>
              <Pressable
                onPress={() => {
                  const lang = current.bookId ? langs[current.bookId] : 'en';
                  speakWord(e.sentence.replace(/\*\*/g, ''), lang ?? 'en');
                }}
                className="ml-2 rounded-full bg-gray-200 p-1 dark:bg-gray-700"
                accessibilityLabel={t('common.speak')}
                accessibilityRole="button"
              >
                <MaterialIcons name="volume-up" size={14} color="#10b981" />
              </Pressable>
            </View>
            {e.translation ? (
              <Text className="mt-1 text-sm text-gray-500">
                {e.translation.includes('**')
                  ? e.translation.split('**').map((seg, si) =>
                      si % 2 === 1
                        ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
                        : <Text key={si}>{seg}</Text>
                    )
                  : e.translation}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    ) : null;

  const renderChoices = () => (
    <Animated.View layout={LinearTransition.duration(300)} className="mt-6 gap-2">
      {choices.map((c, i) => {
        const isCorrect = c === correctDefinition;
        const isSelected = choiceSelected === i;
        const showResult = choiceSelected !== null;
        if (showResult && !isCorrect && !isSelected) return null;
        let bg = 'bg-gray-50 dark:bg-gray-900';
        let borderStyle = {};
        if (showResult && isCorrect) {
          bg = '';
          borderStyle = { borderWidth: 2, borderColor: '#2EC4A5', backgroundColor: colorScheme === 'dark' ? '#064e3b' : '#ecfdf5' };
        } else if (showResult && isSelected && !isCorrect) {
          bg = '';
          borderStyle = { borderWidth: 2, borderColor: '#ef4444', backgroundColor: colorScheme === 'dark' ? '#450a0a' : '#fef2f2' };
        }
        return (
          <Animated.View key={i} exiting={FadeOut.duration(200)} layout={LinearTransition.duration(300)}>
            <Pressable
              onPress={() => choiceSelected === null && setChoiceSelected(i)}
              className={`flex-row items-center rounded-xl p-4 ${bg}`}
              style={Object.keys(borderStyle).length ? borderStyle : undefined}
              disabled={choiceSelected !== null}
            >
              <Text className="flex-1 text-base text-black dark:text-white" numberOfLines={3}>{c}</Text>
              {showResult && isCorrect ? (
                <MaterialIcons name="check-circle" size={22} color="#2EC4A5" style={{ marginLeft: 8 }} />
              ) : showResult && isSelected && !isCorrect ? (
                <MaterialIcons name="cancel" size={22} color="#ef4444" style={{ marginLeft: 8 }} />
              ) : null}
            </Pressable>
          </Animated.View>
        );
      })}
      {choiceSelected !== null ? (
        <Animated.View entering={FadeIn.duration(300).delay(250)}>
          {mode === 'context' && (() => {
            const examples = current.result.examples ?? [];
            const ex = examples.length > 0 ? examples[contextExampleIdx % examples.length] : null;
            if (!ex?.translation) return null;
            return (
              <View className="mb-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-900">
                <Text className="text-sm text-gray-500">
                  {ex.translation.includes('**')
                    ? ex.translation.split('**').map((seg, si) =>
                        si % 2 === 1
                          ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
                          : <Text key={si}>{seg}</Text>
                      )
                    : ex.translation}
                </Text>
              </View>
            );
          })()}
          {renderMeanings()}
        </Animated.View>
      ) : null}
    </Animated.View>
  );

  switch (mode) {
    case 'flashcard':
      return cardReversed ? (
        <Pressable onPress={() => !flipped && setFlipped(true)}>
          {renderMeanings()}
          {flipped ? (
            <View className="mt-6 items-center">{renderWordHeader()}</View>
          ) : (
            <View className="items-center justify-center py-16">
              <Text className="text-base text-gray-400">{t('review.show_answer')}</Text>
            </View>
          )}
        </Pressable>
      ) : (
        <Pressable onPress={() => !flipped && setFlipped(true)}>
          {renderWordHeader()}
          {flipped ? renderMeanings() : (
            <View className="items-center justify-center py-16">
              <Text className="text-base text-gray-400">{t('review.show_answer')}</Text>
            </View>
          )}
        </Pressable>
      );

    case 'context': {
      const examples = current.result.examples ?? [];
      if (examples.length === 0) {
        return <View>{renderWordHeader()}{renderChoices()}</View>;
      }
      const ex = examples[contextExampleIdx % examples.length];
      const ctxLang = current.bookId ? langs[current.bookId] ?? 'en' : 'en';
      const highlightStyle = { color: '#2EC4A5', fontWeight: '700' as const, textDecorationLine: 'underline' as const };
      const hasMarkers = ex.sentence.includes('**');

      const renderSentence = () => {
        const clean = ex.sentence.replace(/\*\*/g, '');
        const speakAll = () => speakWord(clean, ctxLang);
        if (hasMarkers) {
          return ex.sentence.split('**').map((seg, si) => {
            const marked = si % 2 === 1;
            return (
              <Text key={si} onPress={marked ? () => speakWord(seg, ctxLang) : speakAll} style={marked ? highlightStyle : undefined}>
                {seg}
              </Text>
            );
          });
        }
        const hw = current.result.headword ?? current.word;
        const escaped = hw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = ex.sentence.split(new RegExp(`(${escaped})`, 'i'));
        return parts.map((part, i) => {
          const isTarget = i % 2 === 1;
          return (
            <Text key={i} onPress={isTarget ? () => speakWord(part, ctxLang) : speakAll} style={isTarget ? highlightStyle : undefined}>
              {part}
            </Text>
          );
        });
      };

      const cleanSentence = ex.sentence.replace(/\*\*/g, '');
      return (
        <View>
          <View className="items-center rounded-xl bg-gray-50 p-5 dark:bg-gray-900">
            <Text className="text-center text-lg leading-7 text-black dark:text-white">
              {renderSentence()}
            </Text>
            <Pressable
              onPress={() => speakWord(cleanSentence, ctxLang)}
              className="mt-3 rounded-full bg-gray-200 p-2 dark:bg-gray-700"
              accessibilityLabel={t('common.speak')}
              accessibilityRole="button"
            >
              <MaterialIcons name="volume-up" size={20} color="#10b981" />
            </Pressable>
          </View>
          {renderChoices()}
        </View>
      );
    }

    case 'choice':
      return <View>{renderWordHeader()}{renderChoices()}</View>;

    case 'dictation':
      return (
        <View>
          <View className="items-center">
            <Pressable onPress={onSpeak} className="rounded-full bg-gray-100 p-4 dark:bg-gray-800" accessibilityLabel={t('common.speak')} accessibilityRole="button">
              <MaterialIcons name="volume-up" size={32} color="#10b981" />
            </Pressable>
            <Text className="mt-3 text-center text-base text-gray-500">
              {meanings[0]?.definition ?? ''}
            </Text>
          </View>
          <View className="mt-6">
            <View className="flex-row items-center gap-2">
              <TextInput
                value={dictationInput}
                onChangeText={setDictationInput}
                editable={!dictationChecked && !dictationListening}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={dictationListening ? t('review.speaking_listening') : t('review.dictation_placeholder')}
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (!dictationChecked && dictationInput.trim()) setDictationChecked(true);
                }}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-center text-xl text-black dark:border-gray-700 dark:text-white"
              />
              <Pressable
                onPress={onDictationMicPress}
                disabled={dictationChecked}
                className={`h-12 w-12 items-center justify-center rounded-full ${
                  dictationListening ? 'bg-red-500' : dictationChecked ? 'bg-gray-200 dark:bg-gray-800' : 'bg-emerald-500'
                }`}
                accessibilityLabel={t('review.speaking_prompt')}
                accessibilityRole="button"
              >
                <MaterialIcons
                  name={dictationListening ? 'stop' : 'mic'}
                  size={22}
                  color={dictationChecked && !dictationListening ? '#9ca3af' : '#ffffff'}
                />
              </Pressable>
            </View>
            {dictationChecked ? (
              <View className="mt-3 items-center">
                {(() => {
                  const lang = current.bookId ? langs[current.bookId] ?? 'en' : 'en';
                  const result = compareDictation(dictationInput, current.word, lang);
                  if (result === 'exact') {
                    return (
                      <View className="flex-row items-center gap-2">
                        <MaterialIcons name="check-circle" size={24} color="#2EC4A5" />
                        <Text className="text-lg font-bold" style={{ color: '#2EC4A5' }}>{current.word}</Text>
                      </View>
                    );
                  }
                  if (result === 'typo') {
                    return (
                      <View className="items-center gap-1">
                        <View className="flex-row items-center gap-2">
                          <MaterialIcons name="check-circle" size={24} color="#2EC4A5" />
                          <Text className="text-lg font-bold" style={{ color: '#2EC4A5' }}>{current.word}</Text>
                        </View>
                        <Text className="text-xs text-gray-500">
                          {t('review.dictation_typo_hint', { input: dictationInput.trim() })}
                        </Text>
                      </View>
                    );
                  }
                  return (
                    <View className="items-center gap-1">
                      <View className="flex-row items-center gap-2">
                        <MaterialIcons name="cancel" size={24} color="#ef4444" />
                        <Text className="text-lg text-red-500 line-through">{dictationInput.trim()}</Text>
                      </View>
                      <Text className="text-lg font-bold text-black dark:text-white">{current.word}</Text>
                    </View>
                  );
                })()}
              </View>
            ) : (
              <Pressable
                onPress={() => dictationInput.trim() && setDictationChecked(true)}
                className={`mt-3 items-center rounded-xl py-3 ${
                  dictationInput.trim() ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-800'
                }`}
                disabled={!dictationInput.trim()}
              >
                <Text className={`text-base font-semibold ${
                  dictationInput.trim() ? 'text-white dark:text-black' : 'text-gray-400'
                }`}>
                  {t('review.check')}
                </Text>
              </Pressable>
            )}
          </View>
          {dictationChecked ? renderMeanings() : null}
        </View>
      );

    case 'fill_blank': {
      // Show example sentence with the target word replaced by an underline
      // blank, then 4 word choices. Picks from the session's same-source-lang
      // pool. Falls back to the choice picker on words without examples.
      const examples = current.result.examples ?? [];
      if (examples.length === 0) {
        return <View>{renderWordHeader()}{renderChoices()}</View>;
      }
      const ex = examples[contextExampleIdx % examples.length];
      const ctxLang = current.bookId ? langs[current.bookId] ?? 'en' : 'en';
      const blank = '_____';
      const blanked = ex.sentence.includes('**')
        ? ex.sentence.replace(/\*\*([^*]+)\*\*/g, blank)
        : (() => {
            const hw = current.result.headword ?? current.word;
            const escaped = hw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return ex.sentence.replace(new RegExp(escaped, 'i'), blank);
          })();
      const cleanSentence = ex.sentence.replace(/\*\*/g, '');
      // Translation shown above choices as a hint so the learner can derive
      // the missing word from meaning rather than guess from collocation
      // alone. Preserve `**…**` markers as a mint highlight so the target
      // word's translation pops within the surrounding sentence.
      const renderTranslationHighlighted = (text: string) =>
        text.includes('**')
          ? text.split('**').map((seg, si) =>
              si % 2 === 1
                ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
                : <Text key={si}>{seg}</Text>
            )
          : text;
      // After answering, fill the blank in-place with the correct word and
      // highlight it. Avoids a redundant "original sentence + translation"
      // panel below the choices.
      const renderFilledSentence = () => {
        if (ex.sentence.includes('**')) {
          return ex.sentence.split('**').map((seg, si) =>
            si % 2 === 1
              ? <Text key={si} style={{ color: '#2EC4A5', fontWeight: '700' }}>{seg}</Text>
              : <Text key={si}>{seg}</Text>
          );
        }
        const hw = current.result.headword ?? current.word;
        const escaped = hw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = ex.sentence.split(new RegExp(`(${escaped})`, 'i'));
        return parts.map((part, i) =>
          i % 2 === 1
            ? <Text key={i} style={{ color: '#2EC4A5', fontWeight: '700' }}>{part}</Text>
            : <Text key={i}>{part}</Text>
        );
      };
      const showResult = choiceSelected !== null;
      return (
        <View>
          <View className="rounded-xl bg-gray-50 p-5 dark:bg-gray-900">
            <View className="flex-row items-start">
              <Text className="flex-1 text-center text-lg leading-7 text-black dark:text-white">
                {showResult ? renderFilledSentence() : blanked}
              </Text>
              {showResult ? (
                <Pressable
                  onPress={() => speakWord(cleanSentence, ctxLang)}
                  className="ml-2 rounded-full bg-gray-200 p-1.5 dark:bg-gray-700"
                  accessibilityLabel={t('common.speak')}
                  accessibilityRole="button"
                >
                  <MaterialIcons name="volume-up" size={16} color="#10b981" />
                </Pressable>
              ) : null}
            </View>
            {ex.translation ? (
              <Text className="mt-2 text-center text-sm text-gray-500">
                {renderTranslationHighlighted(ex.translation)}
              </Text>
            ) : null}
          </View>
          <Animated.View layout={LinearTransition.duration(300)} className="mt-6 gap-2">
            {choices.map((c, i) => {
              const isCorrect = c === correctDefinition;
              const isSelected = choiceSelected === i;
              if (showResult && !isCorrect && !isSelected) return null;
              let bg = 'bg-gray-50 dark:bg-gray-900';
              let borderStyle = {};
              if (showResult && isCorrect) {
                borderStyle = { borderWidth: 2, borderColor: '#2EC4A5', backgroundColor: colorScheme === 'dark' ? '#064e3b' : '#ecfdf5' };
                bg = '';
              } else if (showResult && isSelected && !isCorrect) {
                borderStyle = { borderWidth: 2, borderColor: '#ef4444', backgroundColor: colorScheme === 'dark' ? '#450a0a' : '#fef2f2' };
                bg = '';
              }
              return (
                <Animated.View key={i} exiting={FadeOut.duration(200)} layout={LinearTransition.duration(300)}>
                  <Pressable
                    onPress={() => choiceSelected === null && setChoiceSelected(i)}
                    className={`flex-row items-center rounded-xl p-4 ${bg}`}
                    style={Object.keys(borderStyle).length ? borderStyle : undefined}
                    disabled={choiceSelected !== null}
                  >
                    <Text className="flex-1 text-base font-semibold text-black dark:text-white">{c}</Text>
                    {showResult && isCorrect ? (
                      <MaterialIcons name="check-circle" size={22} color="#2EC4A5" style={{ marginLeft: 8 }} />
                    ) : showResult && isSelected && !isCorrect ? (
                      <MaterialIcons name="cancel" size={22} color="#ef4444" style={{ marginLeft: 8 }} />
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
            {showResult ? (
              <Animated.View entering={FadeIn.duration(300).delay(250)}>
                {renderMeanings()}
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
      );
    }

  }
}
