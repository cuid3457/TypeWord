import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ReadingDisplay } from '@/components/reading-display';
import { getTtsText, speakWord } from '@src/utils/ttsLocale';
import { formatPOS } from '@src/utils/normalizeResult';
import { compareDictation } from '@src/utils/dictationCompare';
import { splitMarkerParticle } from '@src/utils/splitMarkerParticle';
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

  // Dictation visuals: render the answer as two pieces — typed prefix
  // (natural letter spacing) and remaining-blanks suffix (extra letterSpacing
  // so blanks read as discrete cells). Both pieces sit in a centered flex-row,
  // so the whole composition stays centered as the typed prefix grows. A
  // synthetic blinking cursor renders between the two pieces. A real TextInput
  // is overlaid invisibly to capture keyboard input.
  const dictationInputRef = useRef<TextInput>(null);
  const [dictationFocused, setDictationFocused] = useState(false);
  const [dictationCursorOn, setDictationCursorOn] = useState(true);
  useEffect(() => {
    if (!dictationFocused) return;
    setDictationCursorOn(true);
    const id = setInterval(() => setDictationCursorOn((c) => !c), 530);
    return () => clearInterval(id);
  }, [dictationFocused]);
  const dictationSplit = useMemo(() => {
    if (!current?.word) return { pre: '', post: '', totalLetters: 0 };
    const wordChars = Array.from(current.word.normalize('NFC'));
    const isLetter = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
    const typedLetters = Array.from(dictationInput.normalize('NFC')).filter(isLetter);
    const totalLetters = wordChars.filter(isLetter).length;
    let consumed = 0;
    let splitIdx = wordChars.length;
    for (let i = 0; i < wordChars.length; i += 1) {
      if (isLetter(wordChars[i])) {
        if (consumed < typedLetters.length) {
          consumed += 1;
        } else {
          splitIdx = i;
          break;
        }
      }
    }
    let lp = 0;
    const pre = wordChars
      .slice(0, splitIdx)
      .map((ch) => (isLetter(ch) ? typedLetters[lp++] : ch))
      .join('');
    const post = wordChars
      .slice(splitIdx)
      .map((ch) => (isLetter(ch) ? '_' : ch))
      .join('');
    return { pre, post, totalLetters };
  }, [current?.word, dictationInput]);

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
      {meanings.map((m, i) => {
        const marker = formatPOS(m.partOfSpeech, m.gender, i18n.language);
        return (
          <View key={i} className="mb-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
            {marker ? (
              <Text className="text-xs text-gray-500">{marker}</Text>
            ) : null}
            <Text className="mt-1 text-base text-black dark:text-white">
              {meanings.length > 1 ? `${i + 1}. ` : ''}{m.definition}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // Highlight the marker span minus its trailing grammatical particle.
  // The example-generator prompt wraps host + particle together
  // (`**책은**`, `**学校に**`, `**好的**`) for natural prose, but learner
  // cards want emphasis on the headword only. Per-example POS picks up
  // from the meaningIndex slot so verb forms (which look like particles
  // at the end but aren't) stay intact.
  const renderMarkedSentence = (sentence: string, meaningIndex: number | undefined) => {
    const lang = current.bookId ? langs[current.bookId] ?? 'en' : 'en';
    const headword = current.result.headword ?? current.word;
    const pos = current.result.meanings?.[meaningIndex ?? 0]?.partOfSpeech;
    return sentence.split('**').map((seg, si) => {
      if (si % 2 === 0) return <Text key={si}>{seg}</Text>;
      const { head, tail } = splitMarkerParticle(seg, headword, lang, pos);
      return (
        <Text key={si}>
          <Text style={{ color: '#2EC4A5', fontWeight: '700' }}>{head}</Text>
          {tail ? <Text>{tail}</Text> : null}
        </Text>
      );
    });
  };

  const renderExamples = () =>
    current.result.examples?.length ? (
      <View className="mt-3">
        {current.result.examples.map((e, i) => (
          <View key={i} className="mb-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
            <View className="flex-row items-start">
              <Text className="flex-1 text-sm italic text-black dark:text-white">
                {e.sentence.includes('**')
                  ? renderMarkedSentence(e.sentence, e.meaningIndex)
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
                {e.translation.replace(/\*\*/g, '')}
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
                  {ex.translation.replace(/\*\*/g, '')}
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
          const headword = current.result.headword ?? current.word;
          const pos = current.result.meanings?.[ex.meaningIndex ?? 0]?.partOfSpeech;
          return ex.sentence.split('**').map((seg, si) => {
            const marked = si % 2 === 1;
            if (!marked) {
              return (
                <Text key={si} onPress={speakAll}>{seg}</Text>
              );
            }
            // Drop trailing particle (조사/助詞/助词) from the highlighted
            // span so the underline + accent color hit the headword only.
            // Tail still speaks the original full marked text for TTS
            // continuity (mirrors how the LLM wrote it).
            const { head, tail } = splitMarkerParticle(seg, headword, ctxLang, pos);
            return (
              <Text key={si}>
                <Text onPress={() => speakWord(seg, ctxLang)} style={highlightStyle}>{head}</Text>
                {tail ? <Text onPress={() => speakWord(seg, ctxLang)}>{tail}</Text> : null}
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

    case 'dictation': {
      const inputDisabled = dictationChecked || dictationListening;
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
              {/* Centered "typed-prefix · cursor · remaining-blanks" row.
                  Pre uses natural letter spacing so typed letters look normal;
                  post uses extra letterSpacing so blanks read as discrete cells.
                  An invisible TextInput overlay captures all keyboard input. */}
              <Pressable
                onPress={() => dictationInputRef.current?.focus()}
                disabled={inputDisabled}
                className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700"
                style={{ minHeight: 50, position: 'relative', justifyContent: 'center' }}
              >
                {dictationListening ? (
                  <Text className="text-center text-xl text-gray-400" style={{ paddingVertical: 12 }}>
                    {t('review.speaking_listening')}
                  </Text>
                ) : (
                  <>
                    <View
                      className="flex-row items-center justify-center"
                      style={{ paddingHorizontal: 16, paddingVertical: 12 }}
                      pointerEvents="none"
                    >
                      <Text className="text-xl text-black dark:text-white">{dictationSplit.pre}</Text>
                      {dictationFocused && !inputDisabled ? (
                        <Text
                          className="text-xl text-black dark:text-white"
                          style={{ opacity: dictationCursorOn ? 1 : 0, marginHorizontal: 1 }}
                        >
                          |
                        </Text>
                      ) : null}
                      <Text
                        className="text-xl text-gray-300 dark:text-gray-600"
                        style={{ letterSpacing: 6 }}
                      >
                        {dictationSplit.post}
                      </Text>
                    </View>
                    <TextInput
                      ref={dictationInputRef}
                      value={dictationInput}
                      onChangeText={(text) => {
                        const newLetters = Array.from(text.normalize('NFC')).filter((c) =>
                          /[\p{L}\p{N}]/u.test(c),
                        );
                        if (newLetters.length > dictationSplit.totalLetters) return;
                        setDictationInput(text);
                      }}
                      onFocus={() => setDictationFocused(true)}
                      onBlur={() => setDictationFocused(false)}
                      editable={!inputDisabled}
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (!dictationChecked && dictationInput.trim()) setDictationChecked(true);
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: 0,
                      }}
                    />
                  </>
                )}
              </Pressable>
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
    }

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
      // Translation is plain prose (markers were dropped from the prompt
      // because target morphology often differs enough to break alignment).
      // Existing data may still contain stray ** chars — strip them.
      const renderTranslationHighlighted = (text: string) => text.replace(/\*\*/g, '');
      // After answering, fill the blank in-place with the correct word and
      // highlight it. Avoids a redundant "original sentence + translation"
      // panel below the choices.
      const renderFilledSentence = () => {
        if (ex.sentence.includes('**')) {
          return renderMarkedSentence(ex.sentence, ex.meaningIndex);
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
