import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ReviewCardContent } from '@/components/review/ReviewCardContent';
import { ReportModal } from '@/components/report-modal';
import { Toast } from '@/components/toast';
import { VoiceToggle } from '@/components/voice-toggle';
import { ReviewLimitModal } from '@/components/review-limit-modal';
import { Paywall } from '@/components/paywall';
import type { StoredWord } from '@src/db/queries';

// Reviewer-facing mode (the per-card resolved mode that ReviewCardContent renders).
type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank';

interface Props {
  index: number;
  words: StoredWord[];
  current: StoredWord;
  currentBookName: string | null;
  reviewMode: ReviewMode;
  flipped: boolean;
  setFlipped: (v: boolean) => void;
  isAnswered: boolean;
  showFinish: boolean;

  // Card content props
  langs: Record<string, string>;
  cardReversed: boolean;
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

  // Gamification — drives the combo counter top-right of the progress bar
  // and the floating "+N XP" pop on each correct answer.
  combo: number;
  xpGain: { amount: number; key: number } | null;

  // Handlers
  handleRate: (quality: 'got_it' | 'uncertain' | 'still_learning') => void;
  handleBack: () => void;
  handleSkip: () => void;
  handleSpeak: () => void;
  goBackToPicker: () => void;
  getAnswerQuality: () => 'got_it' | 'uncertain' | 'still_learning' | null;

  // Report state
  showReport: boolean;
  setShowReport: (v: boolean) => void;
  reportToast: string;
  setReportToast: (v: string) => void;

  // Limit state
  premium: boolean;
  limitRemaining: number;
  limitTotal: number;
  showLimitModal: boolean;
  limitAdAvailable: boolean;
  handleLimitWatchAd: () => void;
  handleLimitPremium: () => void;
  handleLimitSwitchMode: () => void;
  handleLimitEnd: () => void;
  paywallVisible: boolean;
  setPaywallVisible: (v: boolean) => void;
  modeDisplayName: string;
}

export function ReviewActiveCard({
  index,
  words,
  current,
  currentBookName,
  reviewMode,
  flipped,
  setFlipped,
  isAnswered,
  showFinish,

  langs,
  cardReversed,
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

  combo,
  xpGain,

  handleRate,
  handleBack,
  handleSkip,
  handleSpeak,
  goBackToPicker,
  getAnswerQuality,

  showReport,
  setShowReport,
  reportToast,
  setReportToast,

  premium,
  limitRemaining,
  limitTotal,
  showLimitModal,
  limitAdAvailable,
  handleLimitWatchAd,
  handleLimitPremium,
  handleLimitSwitchMode,
  handleLimitEnd,
  paywallVisible,
  setPaywallVisible,
  modeDisplayName,
}: Props) {
  const { t } = useTranslation();

  // XP popup animation — slides up + fades out each time a new gain
  // arrives. Keyed on xpGain.key so consecutive equal-amount gains still
  // re-trigger the animation cleanly.
  const xpAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!xpGain) return;
    xpAnim.setValue(0);
    Animated.sequence([
      Animated.timing(xpAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(xpAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [xpGain?.key, xpAnim]);

  // Combo counter — gentle scale pop each time the value changes.
  const comboAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (combo === 0) return;
    Animated.sequence([
      Animated.timing(comboAnim, { toValue: 1.3, duration: 120, useNativeDriver: true }),
      Animated.timing(comboAnim, { toValue: 1.0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [combo, comboAnim]);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} className="flex-1 bg-white dark:bg-black">
      <View className="flex-1 px-6 pt-4">
        {/* Progress bar + back to list */}
        <View className="flex-row items-center justify-between">
          <Pressable onPress={goBackToPicker} className="mr-3" accessibilityLabel={t('common.close')} accessibilityRole="button">
            <MaterialIcons name="close" size={20} color="#6b7280" />
          </Pressable>
          <Text className="text-sm font-medium text-gray-500">
            {t('review.progress', { current: index + 1, total: words.length })}
          </Text>
          {!premium && limitRemaining !== Infinity ? (
            <Text className="ml-3 text-xs text-gray-400">
              {t('review.remaining_words', { remaining: limitRemaining, limit: limitTotal })}
            </Text>
          ) : null}
          <View className="ml-4 h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-800">
            <View
              className="h-2 rounded-full bg-black dark:bg-white"
              style={{ width: `${((index + 1) / words.length) * 100}%` }}
            />
          </View>
          {combo > 0 ? (
            <Animated.View
              className="ml-3 flex-row items-center rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-900"
              style={{ transform: [{ scale: comboAnim }] }}
            >
              <Text className="text-sm">⚡</Text>
              <Text className="ml-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                {combo}
              </Text>
            </Animated.View>
          ) : null}
        </View>

        {/* Floating XP gain — pinned to the top center, slides up + fades */}
        {xpGain ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 60,
              alignSelf: 'center',
              opacity: xpAnim,
              transform: [{
                translateY: xpAnim.interpolate({ inputRange: [0, 1], outputRange: [10, -8] }),
              }],
              zIndex: 10,
            }}
          >
            <View className="rounded-full bg-emerald-500 px-3 py-1">
              <Text className="text-sm font-bold text-white">+{xpGain.amount} XP</Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Book name badge + report */}
        <View className="mt-2 flex-row items-center justify-between">
          {currentBookName ? (
            <View className="self-start rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
              <Text className="text-xs text-gray-600 dark:text-gray-400" numberOfLines={1}>
                {currentBookName}
              </Text>
            </View>
          ) : <View />}
          <View className="flex-row items-center gap-2">
            <VoiceToggle iconSize={20} iconColor="#2EC4A5" />
            <Pressable
              onPress={() => setShowReport(true)}
              className="p-1"
              accessibilityLabel={t('report.title')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialIcons name="flag" size={16} color="#9ca3af" />
            </Pressable>
          </View>
        </View>

        {/* Card with floating side nav arrows */}
        <View className="mt-4 flex-1 justify-center">
          <View className="flex-1 rounded-2xl border border-gray-300 dark:border-gray-800">
            <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <ReviewCardContent
                mode={reviewMode}
                current={current}
                langs={langs}
                cardReversed={cardReversed}
                flipped={flipped}
                setFlipped={setFlipped}
                choices={choices}
                choiceSelected={choiceSelected}
                setChoiceSelected={setChoiceSelected}
                correctDefinition={correctDefinition}
                contextExampleIdx={contextExampleIdx}
                dictationInput={dictationInput}
                setDictationInput={setDictationInput}
                dictationChecked={dictationChecked}
                setDictationChecked={setDictationChecked}
                dictationListening={dictationListening}
                onDictationMicPress={onDictationMicPress}
                onSpeak={handleSpeak}
              />
            </ScrollView>
          </View>

          {/* Floating prev/next arrows: vertical center of the card area, sit
              on the card edges so they're always reachable without eating
              vertical space at the bottom. Hidden at session boundaries.
              The wrapping View spans the card height for vertical centering
              but uses pointerEvents: 'box-none' so taps fall through to
              children only — the actual tap zone is the 40x40 Pressable
              alone, NOT the whole right/left edge of the card (which would
              steal taps meant for in-card buttons like the dictation mic). */}
          {index > 0 ? (
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', left: -8, top: 0, bottom: 0, justifyContent: 'center' }}
            >
              <Pressable
                onPress={handleBack}
                accessibilityLabel={t('common.previous')}
                accessibilityRole="button"
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full bg-white shadow dark:bg-gray-900"
                style={{ shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}
              >
                <MaterialIcons name="chevron-left" size={26} color="#6b7280" />
              </Pressable>
            </View>
          ) : null}
          {index < words.length - 1 ? (
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', right: -8, top: 0, bottom: 0, justifyContent: 'center' }}
            >
              <Pressable
                onPress={handleSkip}
                accessibilityLabel={t('common.next')}
                accessibilityRole="button"
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full bg-white shadow dark:bg-gray-900"
                style={{ shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}
              >
                <MaterialIcons name="chevron-right" size={26} color="#6b7280" />
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Bottom buttons. Fixed height (matches a `py-4` button) so the card
            area above doesn't change size when buttons appear/disappear —
            keeps the floating side-nav arrows pinned to the same vertical
            position throughout the session. */}
        <View className="flex-row gap-3 pb-4 pt-4" style={{ height: 60 + 16 + 16 }}>
          {isAnswered ? (
            reviewMode === 'flashcard' ? (
              <>
                <Pressable
                  onPress={() => handleRate('still_learning')}
                  className="flex-1 items-center justify-center rounded-xl border border-red-400 dark:border-red-600"
                >
                  <MaterialIcons name="close" size={28} color="#ef4444" />
                </Pressable>
                <Pressable
                  onPress={() => handleRate('uncertain')}
                  className="flex-1 items-center justify-center rounded-xl border border-gray-400 dark:border-gray-600"
                >
                  <MaterialIcons name="change-history" size={28} color="#9ca3af" />
                </Pressable>
                <Pressable
                  onPress={() => handleRate('got_it')}
                  className="flex-1 items-center justify-center rounded-xl"
                  style={{ borderWidth: 1, borderColor: '#2EC4A5' }}
                >
                  <MaterialIcons name="check" size={28} color="#2EC4A5" />
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => { const q = getAnswerQuality(); if (q) handleRate(q); }}
                className="flex-1 items-center justify-center rounded-xl bg-black dark:bg-white"
              >
                <Text className="text-base font-semibold text-white dark:text-black">
                  {showFinish ? t('review.finish') : t('review.next')}
                </Text>
              </Pressable>
            )
          ) : (
            <View className="flex-1" />
          )}
        </View>
      </View>

      {current ? (
        <ReportModal
          visible={showReport}
          onClose={() => setShowReport(false)}
          word={current.word}
          wordId={current.id}
          context="review"
          onSubmitted={(msg) => setReportToast(msg)}
        />
      ) : null}
      <Toast visible={!!reportToast} message={reportToast} type="success" onHide={() => setReportToast('')} style={{ position: 'absolute', bottom: 132, left: 0, right: 0 }} />

      <ReviewLimitModal
        visible={showLimitModal}
        modeName={modeDisplayName}
        canWatchAd={limitAdAvailable}
        onWatchAd={handleLimitWatchAd}
        onPremium={handleLimitPremium}
        onSwitchMode={handleLimitSwitchMode}
        onEnd={handleLimitEnd}
      />
      <Paywall visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </SafeAreaView>
  );
}
