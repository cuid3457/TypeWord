import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ReviewCardContent } from '@/components/review/ReviewCardContent';
import { ReportModal } from '@/components/report-modal';
import { Toast } from '@/components/toast';
import { ReviewLimitModal } from '@/components/review-limit-modal';
import { Paywall } from '@/components/paywall';
import type { StoredWord } from '@src/db/queries';

type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context';

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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-white dark:bg-black">
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
        </View>

        {/* Book name badge + report */}
        <View className="mt-2 flex-row items-center justify-between">
          {currentBookName ? (
            <View className="self-start rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
              <Text className="text-xs text-gray-600 dark:text-gray-400" numberOfLines={1}>
                {currentBookName}
              </Text>
            </View>
          ) : <View />}
          {isAnswered ? (
            <Pressable onPress={() => setShowReport(true)} className="flex-row items-center rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
              <MaterialIcons name="flag" size={14} color="#9ca3af" />
              <Text className="ml-1 text-xs text-gray-400">{t('report.title')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Card */}
        <View className="mt-4 flex-1 rounded-2xl border border-gray-300 dark:border-gray-800">
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
              onSpeak={handleSpeak}
            />
          </ScrollView>
        </View>

        {/* Bottom buttons */}
        <View className="flex-row gap-3 pb-4 pt-4">
          <View style={{ width: 56 }}>
            {index > 0 ? (
              <Pressable
                onPress={handleBack}
                className="items-center justify-center rounded-xl border border-gray-300 py-4 dark:border-gray-700"
                accessibilityLabel={t('common.previous')}
                accessibilityRole="button"
              >
                <MaterialIcons name="chevron-left" size={28} color="#6b7280" />
              </Pressable>
            ) : null}
          </View>

          {isAnswered ? (
            reviewMode === 'flashcard' ? (
              <>
                <Pressable
                  onPress={() => handleRate('still_learning')}
                  className="flex-1 items-center justify-center rounded-xl border border-red-400 py-4 dark:border-red-600"
                >
                  <MaterialIcons name="close" size={28} color="#ef4444" />
                </Pressable>
                <Pressable
                  onPress={() => handleRate('uncertain')}
                  className="flex-1 items-center justify-center rounded-xl border border-gray-400 py-4 dark:border-gray-600"
                >
                  <MaterialIcons name="change-history" size={28} color="#9ca3af" />
                </Pressable>
                <Pressable
                  onPress={() => handleRate('got_it')}
                  className="flex-1 items-center justify-center rounded-xl py-4"
                  style={{ borderWidth: 1, borderColor: '#2EC4A5' }}
                >
                  <MaterialIcons name="check" size={28} color="#2EC4A5" />
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => { const q = getAnswerQuality(); if (q) handleRate(q); }}
                className="flex-1 items-center justify-center rounded-xl bg-black py-4 dark:bg-white"
              >
                <Text className="text-base font-semibold text-white dark:text-black">
                  {showFinish ? t('review.finish') : t('review.next')}
                </Text>
              </Pressable>
            )
          ) : (
            <View className="flex-1" />
          )}

          <View style={{ width: 56 }}>
            {index < words.length - 1 ? (
              <Pressable
                onPress={handleSkip}
                className="items-center justify-center rounded-xl border border-gray-300 py-4 dark:border-gray-700"
                accessibilityLabel={t('common.next')}
                accessibilityRole="button"
              >
                <MaterialIcons name="chevron-right" size={28} color="#6b7280" />
              </Pressable>
            ) : null}
          </View>
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
