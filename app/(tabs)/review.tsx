import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, BackHandler, FlatList, Keyboard, Pressable, Text } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTtsText, speakWord } from '@src/utils/ttsLocale';
import { ReviewSettingsSheet } from '@/components/review/ReviewSettingsSheet';
import { ReviewComplete } from '@/components/review/ReviewComplete';
import { ReviewPicker } from '@/components/review/ReviewPicker';
import { ReviewActiveCard } from '@/components/review/ReviewActiveCard';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';

import * as Haptics from 'expo-haptics';
import { useRefreshReviewBadge } from '@/app/(tabs)/_layout';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { saveUserSettings } from '@src/storage/userSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showInterstitialIfReady } from '@src/services/interstitialAd';
import { showRewardedAd } from '@src/services/rewardedAd';
import {
  consumeWord,
  canWatchRewardedAd,
  recordRewardedAdWatch,
  getRemaining,
  getRemainingAll,
  getDailyLimit,
  type ReviewMode as LimitReviewMode,
} from '@src/services/reviewLimitService';
import { usePremium } from '@src/hooks/usePremium';
import { isNotificationAvailable } from '@src/services/notificationService';
import {
  getBook,
  getReviewableCount,
  getReviewableCountsByBook,
  getReviewableWords,
  getTotalWordCount,
  updateReviewResult,
  type BookReviewCount,
  type BookSortMode,
  type StoredWord,
} from '@src/db/queries';
import { checkWordFreshness } from '@src/services/wordService';
import { getStreak, getTodayStreakDate, type StreakInfo } from '@src/services/streakService';
import {
  shouldCelebrate,
  shouldCelebrateDaily,
  getDailyVariant,
  markCelebrated,
  markDailyCelebrated,
  type CelebrateInfo,
} from '@src/services/streakMilestone';

export default function ReviewScreen() {
  const { t } = useTranslation();
  const refreshBadge = useRefreshReviewBadge();
  const { settings } = useUserSettings();
  const params = useLocalSearchParams<{ bookId?: string }>();

  type ReviewOrder = 'newest' | 'shuffle';
  type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context';
  const DEFAULT_SESSION = 20;
  const MIN_SESSION = 5;
  const MAX_SESSION = 50;

  // Phase: 'picker' = choose wordlist, 'review' = flashcard session
  const [phase, setPhase] = useState<'picker' | 'review'>('picker');

  // Picker state
  const [bookCounts, setBookCounts] = useState<BookReviewCount[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [hasWords, setHasWords] = useState(true);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [sortMode, setSortMode] = useState<BookSortMode>('recent');
  const [sortReversed, setSortReversed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedBookId, setHighlightedBookId] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const pickerListRef = useRef<FlatList<BookReviewCount>>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Review state
  const [words, setWords] = useState<StoredWord[]>([]);
  const [langs, setLangs] = useState<Record<string, string>>({});
  const [targetLangs, setTargetLangs] = useState<Record<string, string>>({});
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, gotIt: 0, uncertain: 0, stillLearning: 0 });
  const [history, setHistory] = useState<{ wordIndex: number; quality: 'got_it' | 'uncertain' | 'still_learning' }[]>([]);
  const [reExposureCount, setReExposureCount] = useState<Record<string, number>>({});
  const [wordResults, setWordResults] = useState<Record<string, 'got_it' | 'uncertain' | 'still_learning'>>({});
  const [skipCount, setSkipCount] = useState<Record<string, number>>({});
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportToast, setReportToast] = useState('');

  // Review limit state
  const premium = usePremium();
  const [limitRemaining, setLimitRemaining] = useState<number>(Infinity);
  const [limitTotal, setLimitTotal] = useState<number>(50);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitAdAvailable, setLimitAdAvailable] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [settingsRemaining, setSettingsRemaining] = useState<Record<string, number>>({ flashcard: Infinity, choice: Infinity, dictation: Infinity, context: Infinity });

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const sheetTranslateY = useSharedValue(0);
  const hideSettings = useCallback(() => {
    setShowSettings(false);
  }, []);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);
  const [reviewOrder, setReviewOrder] = useState<ReviewOrder>('shuffle');
  const [reviewMode, setReviewMode] = useState<ReviewMode>('flashcard');
  const [sessionCount, setSessionCount] = useState(settings?.sessionCount ?? DEFAULT_SESSION);

  // Choice / context mode state
  const [choices, setChoices] = useState<string[]>([]);
  const [choiceSelected, setChoiceSelected] = useState<number | null>(null);
  const [contextExampleIdx, setContextExampleIdx] = useState(0);
  const initialReversedRef = useRef(Math.random() < 0.5);

  // Dictation mode state
  const [dictationInput, setDictationInput] = useState('');
  const [dictationChecked, setDictationChecked] = useState(false);


  // Refs for auto-rate on blur/exit
  const pendingRef = useRef<{ wordId: string; mode: string; quality: 'got_it' | 'uncertain' | 'still_learning' } | null>(null);

  const [pickerError, setPickerError] = useState(false);

  const loadPickerData = useCallback(async (sort: BookSortMode, reversed: boolean) => {
    try {
      const [counts, total, wordCount] = await Promise.all([
        getReviewableCountsByBook(sort, reversed),
        getReviewableCount(),
        getTotalWordCount(),
      ]);
      setBookCounts(counts);
      setTotalDue(total);
      setHasWords(wordCount > 0);
      setPickerError(false);
    } catch {
      setPickerError(true);
    } finally {
      setPickerLoading(false);
      refreshBadge();
    }
  }, [refreshBadge]);

  const handleSortChange = (mode: BookSortMode) => {
    if (mode === sortMode) {
      const next = !sortReversed;
      setSortReversed(next);
      loadPickerData(mode, next);
    } else {
      setSortMode(mode);
      setSortReversed(false);
      loadPickerData(mode, false);
    }
  };

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const lower = q.toLocaleLowerCase();
    return bookCounts.filter((b) => b.title.toLocaleLowerCase().includes(lower));
  }, [searchQuery, bookCounts]);

  const handleSearchComplete = (book: BookReviewCount) => {
    setSearchQuery(book.title);
    Keyboard.dismiss();
    const index = bookCounts.indexOf(book);
    if (index >= 0) {
      pickerListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    }
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedBookId(book.bookId);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedBookId(null);
      setSearchQuery('');
    }, 2000);
  };

  const pendingAdRef = useRef(false);

  const goBackToPicker = useCallback(async () => {
    if (pendingAdRef.current) {
      pendingAdRef.current = false;
      showInterstitialIfReady();
    }
    setPhase('picker');
    await loadPickerData(sortMode, sortReversed);
  }, [loadPickerData, sortMode, sortReversed]);

  const handledBookIdRef = useRef<string | null>(null);

  // Load picker data on focus, auto-start if bookId param passed (once only)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await loadPickerData(sortMode, sortReversed);
        getStreak().then(setStreak);
        if (!cancelled && params.bookId && handledBookIdRef.current !== params.bookId) {
          handledBookIdRef.current = params.bookId;
          handleStartRequest(params.bookId);
        }
      })();
      return () => { cancelled = true; };
    }, [loadPickerData, sortMode, sortReversed, params.bookId]),
  );

  // Intercept Android back button: return to picker instead of switching tabs
  useFocusEffect(
    useCallback(() => {
      if (phase !== 'review') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goBackToPicker();
        return true;
      });
      return () => sub.remove();
    }, [phase, goBackToPicker]),
  );

  // Flush pending answer to DB (fire-and-forget)
  const flushPending = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    updateReviewResult(p.wordId, p.quality, p.mode).catch(() => {});
    refreshBadge();
  }, [refreshBadge]);

  // Auto-rate on screen blur (tab switch, navigation away) + show pending ad
  useFocusEffect(
    useCallback(() => {
      return () => {
        flushPending();
        if (pendingAdRef.current) {
          pendingAdRef.current = false;
          showInterstitialIfReady();
        }
      };
    }, [flushPending]),
  );

  // Auto-rate on app background / close
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') flushPending();
    });
    return () => sub.remove();
  }, [flushPending]);

  // Tap review tab again while already on it → return to picker
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress' as any, () => {
      if (phase === 'review' && navigation.isFocused()) {
        goBackToPicker();
      }
    });
    return unsubscribe;
  }, [navigation, phase, goBackToPicker]);

  const handleStartRequest = (bookId?: string | null) => {
    setPendingBookId(bookId ?? null);
    sheetTranslateY.value = 1000;
    setShowSettings(true);
    if (!premium) {
      getRemainingAll().then(setSettingsRemaining);
    }
    requestAnimationFrame(() => {
      sheetTranslateY.value = withTiming(0, { duration: 300 });
    });
  };

  const handleConfirmStart = async () => {
    if (settings && settings.sessionCount !== sessionCount) {
      await saveUserSettings({ ...settings, sessionCount });
    }
    if (!premium) {
      const rem = await getRemaining(reviewMode as LimitReviewMode);
      if (rem <= 0) {
        hideSettings();
        const adOk = await canWatchRewardedAd();
        setLimitAdAvailable(adOk);
        setShowLimitModal(true);
        return;
      }
    }
    setPhase('review');
    hideSettings();
    startReview(pendingBookId, reviewOrder, sessionCount);
  };

  const shuffleArray = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const findContextDefinition = (cur: StoredWord, exIdx: number): string => {
    const meanings = cur.result.meanings ?? [];
    if (meanings.length <= 1) return meanings[0]?.definition ?? '';
    const ex = cur.result.examples?.[exIdx];
    if (!ex) return meanings[0]?.definition ?? '';

    if (ex.meaningIndex !== undefined && ex.meaningIndex >= 0 && ex.meaningIndex < meanings.length) {
      return meanings[ex.meaningIndex].definition;
    }

    if (!ex.translation?.includes('**')) return meanings[0]?.definition ?? '';
    const parts = ex.translation.split('**');
    const highlighted = parts.filter((_, i) => i % 2 === 1).join(' ').trim().toLowerCase();
    if (!highlighted) return meanings[0]?.definition ?? '';

    let bestIdx = 0;
    let bestScore = 0;
    for (let i = 0; i < meanings.length; i++) {
      const defs = meanings[i].definition.toLowerCase().split(/[,;、·]/);
      for (const d of defs) {
        const dt = d.trim();
        if (!dt) continue;
        if (dt === highlighted) return meanings[i].definition;
        if (dt.includes(highlighted) || highlighted.includes(dt)) {
          const score = Math.min(dt.length, highlighted.length) / Math.max(dt.length, highlighted.length);
          if (score > bestScore) { bestScore = score; bestIdx = i; }
        } else {
          let prefix = 0;
          for (let j = 0; j < Math.min(dt.length, highlighted.length); j++) {
            if (dt[j] === highlighted[j]) prefix++; else break;
          }
          if (prefix >= 2) {
            const score = prefix / Math.max(dt.length, highlighted.length);
            if (score > bestScore) { bestScore = score; bestIdx = i; }
          }
        }
      }
    }
    return meanings[bestIdx].definition;
  };

  const generateChoices = (ws: StoredWord[], idx: number, tgtMap?: Record<string, string>, contextExIdx?: number) => {
    const cur = ws[idx];
    const map = tgtMap ?? targetLangs;
    const curTgt = cur?.bookId ? map[cur.bookId] : '';

    const correct = contextExIdx !== undefined
      ? findContextDefinition(cur, contextExIdx)
      : cur?.result.meanings?.[0]?.definition ?? '';

    const candidates = ws
      .filter((w, i) => i !== idx && w.result.meanings?.length)
      .filter((w) => {
        if (!curTgt) return true;
        const tgt = w.bookId ? map[w.bookId] : '';
        return tgt === curTgt;
      })
      .map((w) => w.result.meanings[0].definition);

    const unique = [...new Set(candidates)].filter((d) => d !== correct);
    const wrong = shuffleArray(unique).slice(0, 3);
    setChoices(shuffleArray([correct, ...wrong]));
    setChoiceSelected(null);
  };

  const startReview = async (bookId?: string | null, order: ReviewOrder = 'shuffle', count = DEFAULT_SESSION) => {
    setReviewLoading(true);
    setSelectedBookId(bookId ?? null);
    try {
      const ws = await getReviewableWords(count, bookId);

      const langMap: Record<string, string> = {};
      const tgtLangMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      for (const w of ws) {
        if (w.bookId && !langMap[w.bookId]) {
          const book = await getBook(w.bookId);
          if (book) {
            langMap[w.bookId] = book.sourceLang;
            tgtLangMap[w.bookId] = book.targetLang ?? '';
            nameMap[w.bookId] = book.title;
          }
        }
      }

      const freshResults = await Promise.all(
        ws.map((w) => {
          const sl = w.bookId ? langMap[w.bookId] : '';
          const tl = w.bookId ? tgtLangMap[w.bookId] : '';
          if (!sl || !tl) return Promise.resolve(null);
          return checkWordFreshness(w.id, w.word, sl, tl, w.cacheSyncedAt).catch(() => null);
        }),
      );
      const freshWords = ws.map((w, i) => freshResults[i] ? { ...w, result: freshResults[i]! } : w);

      let ordered: StoredWord[];
      if (order === 'newest') {
        ordered = [...freshWords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else {
        ordered = shuffleArray(freshWords);
      }

      initialReversedRef.current = Math.random() < 0.5;
      setWords(ordered);
      setLangs(langMap);
      setTargetLangs(tgtLangMap);
      setBookNames(nameMap);
      setIndex(0);
      setFlipped(false);
      setDictationInput('');
      setDictationChecked(false);
      setStats({ total: 0, gotIt: 0, uncertain: 0, stillLearning: 0 });
      setHistory([]);
      setReExposureCount({});
      setWordResults({});
      setSkipCount({});
      setPhase('review');

      const remaining = await getRemaining(reviewMode as LimitReviewMode);
      const limit = getDailyLimit(reviewMode as LimitReviewMode);
      setLimitRemaining(remaining);
      setLimitTotal(limit);

      if ((reviewMode === 'choice' || reviewMode === 'context') && ordered.length > 0) {
        const exLen = ordered[0]?.result.examples?.length ?? 0;
        const exIdx = exLen > 0 ? Math.floor(Math.random() * exLen) : 0;
        setContextExampleIdx(exIdx);
        generateChoices(ordered, 0, tgtLangMap, reviewMode === 'context' ? exIdx : undefined);
      }
    } catch {
      setPickerError(true);
    } finally {
      setReviewLoading(false);
    }
  };


  const current = words[index];
  const cardReversed = (index % 2 === 0) === initialReversedRef.current;
  const isComplete = phase === 'review' && !reviewLoading && (words.length === 0 || index >= words.length);

  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [completeCelebrate, setCompleteCelebrate] = useState<CelebrateInfo | null>(null);

  useEffect(() => {
    if (!isComplete || words.length === 0) return;

    pendingAdRef.current = true;

    (async () => {
      const key = 'review_complete_count';
      const promptKey = 'notif_prompt_shown';
      const count = Number(await AsyncStorage.getItem(key) || '0') + 1;
      await AsyncStorage.setItem(key, String(count));

      const alreadyShown = await AsyncStorage.getItem(promptKey);
      if (count === 3 && !alreadyShown && isNotificationAvailable()) {
        setShowNotifPrompt(true);
        await AsyncStorage.setItem(promptKey, '1');
      }

      const s = await getStreak();
      setStreak(s);
      if (s.todayDone && s.current > 0) {
        const milestone = await shouldCelebrate(s.current);
        if (milestone) {
          await markCelebrated(s.current);
          setCompleteCelebrate({ type: 'milestone', streak: s.current, variant: 0 });
        } else {
          const todayDate = getTodayStreakDate();
          const daily = await shouldCelebrateDaily(todayDate);
          if (daily) {
            await markDailyCelebrated(todayDate);
            setCompleteCelebrate({ type: 'daily', streak: s.current, variant: getDailyVariant(todayDate) });
          } else {
            setCompleteCelebrate(null);
          }
        }
      } else {
        setCompleteCelebrate(null);
      }
    })();
  }, [isComplete]);

  const formatNextReview = (nextMs: number): string => {
    const diffMs = nextMs - Date.now();
    if (diffMs <= 0) return t('review.next_now');
    const minutes = diffMs / 60_000;
    if (minutes < 60) {
      const rounded = Math.max(10, Math.round(minutes / 10) * 10);
      return t('review.next_minutes', { count: rounded });
    }
    const hours = diffMs / 3_600_000;
    if (hours < 24) {
      const rounded = Math.round(hours);
      return t('review.next_hours', { count: rounded });
    }
    const days = Math.round(diffMs / 86_400_000);
    if (days < 30) return t('review.next_days', { count: days });
    const months = Math.round(days / 30);
    return t('review.next_months', { count: months });
  };


  const consumeOnAnswer = useCallback(async () => {
    if (premium) return;
    const { allowed, remaining } = await consumeWord(reviewMode as LimitReviewMode);
    setLimitRemaining(remaining);
    if (!allowed || remaining <= 0) {
      const adOk = await canWatchRewardedAd();
      setLimitAdAvailable(adOk);
      setShowLimitModal(true);
    }
  }, [premium, reviewMode]);

  const wrappedSetFlipped = useCallback((v: boolean) => {
    if (v && !flipped) consumeOnAnswer();
    setFlipped(v);
  }, [flipped, consumeOnAnswer]);

  const wrappedSetChoiceSelected = useCallback((i: number | null) => {
    if (i !== null && choiceSelected === null) consumeOnAnswer();
    setChoiceSelected(i);
  }, [choiceSelected, consumeOnAnswer]);

  const wrappedSetDictationChecked = useCallback((v: boolean) => {
    if (v && !dictationChecked) consumeOnAnswer();
    setDictationChecked(v);
  }, [dictationChecked, consumeOnAnswer]);

  const handleRate = async (quality: 'got_it' | 'uncertain' | 'still_learning') => {
    if (!current) return;
    pendingRef.current = null;
    if (quality === 'got_it') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (quality === 'still_learning') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    let nextReviewMs: number;
    try {
      const result = await updateReviewResult(current.id, quality, reviewMode);
      nextReviewMs = result.nextReviewMs;
    } catch {
      nextReviewMs = 0;
    }
    refreshBadge();

    // Within-session re-exposure: X words reappear 5-8 cards later (max 2 times)
    if (quality === 'still_learning') {
      const count = reExposureCount[current.id] ?? 0;
      if (count < 2) {
        const offset = 5 + Math.floor(Math.random() * 4);
        const insertAt = Math.min(index + offset, words.length);
        setWords((prev) => {
          const next = [...prev];
          next.splice(insertAt, 0, current);
          return next;
        });
        setReExposureCount((prev) => ({ ...prev, [current.id]: count + 1 }));
      }
    }

    setHistory((prev) => [...prev, { wordIndex: index, quality }]);
    const wordId = current.id;
    setStats((prev) => {
      const prevQuality = wordResults[wordId];
      const next = { ...prev };
      if (prevQuality) {
        if (prevQuality === 'got_it') next.gotIt--;
        else if (prevQuality === 'uncertain') next.uncertain--;
        else next.stillLearning--;
      } else {
        next.total++;
      }
      if (quality === 'got_it') next.gotIt++;
      else if (quality === 'uncertain') next.uncertain++;
      else next.stillLearning++;
      return next;
    });
    setWordResults((prev) => ({ ...prev, [wordId]: quality }));
    setFlipped(false);
    setChoiceSelected(null);
    setDictationInput('');
    setDictationChecked(false);

    setIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    if (index <= 0) return;
    const prevEntry = history[history.length - 1];
    if (prevEntry) {
      const prevWord = words[prevEntry.wordIndex];
      if (prevWord) {
        const earlierResults = history.slice(0, -1).filter((h) => words[h.wordIndex]?.id === prevWord.id);
        const earlierQuality = earlierResults.length > 0 ? earlierResults[earlierResults.length - 1].quality : undefined;
        setStats((s) => {
          const next = { ...s };
          if (prevEntry.quality === 'got_it') next.gotIt--;
          else if (prevEntry.quality === 'uncertain') next.uncertain--;
          else next.stillLearning--;
          if (earlierQuality) {
            if (earlierQuality === 'got_it') next.gotIt++;
            else if (earlierQuality === 'uncertain') next.uncertain++;
            else next.stillLearning++;
          } else {
            next.total--;
          }
          return next;
        });
        setWordResults((prev) => {
          const next = { ...prev };
          if (earlierQuality) next[prevWord.id] = earlierQuality;
          else delete next[prevWord.id];
          return next;
        });
      }
      setHistory((h) => h.slice(0, -1));
    }
    setFlipped(false);
    setChoiceSelected(null);
    setDictationInput('');
    setDictationChecked(false);
    setIndex((i) => i - 1);
  };

  const getAnswerQuality = (): 'got_it' | 'uncertain' | 'still_learning' | null => {
    if ((reviewMode === 'choice' || reviewMode === 'context') && choiceSelected !== null) {
      return choices[choiceSelected] === correctDefinition ? 'got_it' : 'still_learning';
    }
    if (reviewMode === 'dictation' && dictationChecked) {
      return dictationInput.trim().toLocaleLowerCase() === current?.word.toLocaleLowerCase()
        ? 'got_it' : 'still_learning';
    }
    if (reviewMode === 'flashcard' && flipped) {
      return 'uncertain';
    }
    return null;
  };

  const handleSkip = () => {
    if (!current) return;
    const autoQuality = getAnswerQuality();
    if (autoQuality) {
      handleRate(autoQuality);
      return;
    }
    const skipped = skipCount[current.id] ?? 0;
    if (skipped < 1) {
      const offset = 3 + Math.floor(Math.random() * 3);
      const insertAt = Math.min(index + offset, words.length);
      setWords((prev) => {
        const next = [...prev];
        next.splice(insertAt, 0, current);
        return next;
      });
      setSkipCount((prev) => ({ ...prev, [current.id]: skipped + 1 }));
    }
    setFlipped(false);
    setChoiceSelected(null);
    setDictationInput('');
    setDictationChecked(false);
    setIndex((i) => i + 1);
  };

  const handleSpeak = () => {
    if (!current) return;
    const lang = current.bookId ? langs[current.bookId] : 'en';
    speakWord(getTtsText(current.word, lang ?? 'en', current.result.reading), lang ?? 'en');
  };

  const handleLimitWatchAd = async () => {
    const wasInReview = phase === 'review';
    setShowLimitModal(false);
    const rewarded = await showRewardedAd();
    if (rewarded) {
      await recordRewardedAdWatch();
      const remaining = await getRemaining(reviewMode as LimitReviewMode);
      setLimitRemaining(remaining);
      if (!wasInReview) {
        setPhase('review');
        startReview(pendingBookId, reviewOrder, sessionCount);
      }
    } else {
      setShowLimitModal(true);
    }
  };

  const handleLimitPremium = () => {
    setShowLimitModal(false);
    setPaywallVisible(true);
  };

  const handleLimitSwitchMode = () => {
    setShowLimitModal(false);
    if (phase === 'review') {
      goBackToPicker();
    }
    handleStartRequest(pendingBookId);
  };

  const handleLimitEnd = () => {
    setShowLimitModal(false);
    if (phase === 'review') {
      setIndex(words.length);
    }
  };

  const modeDisplayName = (mode: ReviewMode): string => {
    return t(`review.mode_${mode}`);
  };

  // Keep pendingRef in sync for blur/exit auto-rate
  useEffect(() => {
    if (phase !== 'review' || !current) {
      pendingRef.current = null;
      return;
    }
    const q = getAnswerQuality();
    pendingRef.current = q ? { wordId: current.id, mode: reviewMode, quality: q } : null;
  }, [phase, current?.id, choiceSelected, dictationChecked, dictationInput, flipped, reviewMode]);

  // Generate choices / auto-play TTS when index changes
  useEffect(() => {
    if (phase !== 'review' || words.length === 0 || index >= words.length) return;
    if (reviewMode === 'choice' || reviewMode === 'context') {
      const exLen = words[index]?.result.examples?.length ?? 0;
      const exIdx = exLen > 0 ? Math.floor(Math.random() * exLen) : 0;
      setContextExampleIdx(exIdx);
      generateChoices(words, index, undefined, reviewMode === 'context' ? exIdx : undefined);
    }
    if (reviewMode === 'dictation') {
      const w = words[index];
      const lang = w.bookId ? langs[w.bookId] : 'en';
      speakWord(getTtsText(w.word, lang ?? 'en', w.result.reading), lang ?? 'en');
    }
  }, [index, phase, targetLangs]);

  const isAnswered =
    reviewMode === 'choice' || reviewMode === 'context' ? choiceSelected !== null
    : reviewMode === 'dictation' ? dictationChecked
    : flipped;

  const correctDefinition = phase === 'review' && words[index]
    ? reviewMode === 'context'
      ? findContextDefinition(words[index], contextExampleIdx)
      : words[index].result.meanings?.[0]?.definition ?? ''
    : '';

  const showFinish = index >= words.length - 1 && !(
    getAnswerQuality() === 'still_learning' && (reExposureCount[current?.id ?? ''] ?? 0) < 2
  );

  const settingsModal = (
    <ReviewSettingsSheet
      visible={showSettings}
      sheetTranslateY={sheetTranslateY}
      reviewOrder={reviewOrder}
      setReviewOrder={setReviewOrder}
      reviewMode={reviewMode}
      setReviewMode={setReviewMode}
      sessionCount={sessionCount}
      setSessionCount={setSessionCount}
      settingsRemaining={settingsRemaining}
      onDismiss={hideSettings}
      onStart={handleConfirmStart}
    />
  );

  const handleSearchQueryChange = useCallback((text: string) => {
    setSearchQuery(text);
    setHighlightedBookId(null);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  const handleMinWordToast = useCallback(() => {
    setToastMsg(t('review.min_words', { count: MIN_SESSION }));
    setToastVisible(true);
  }, [t]);

  // ── Picker Phase ──
  if (phase === 'picker') {
    if (pickerLoading) {
      return (
        <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 items-center justify-center bg-white dark:bg-black">
          <Text className="text-sm text-gray-400">{t('review.loading')}</Text>
        </SafeAreaView>
      );
    }

    if (pickerError) {
      return (
        <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 items-center justify-center bg-white px-10 dark:bg-black">
          <MaterialIcons name="error-outline" size={48} color="#9ca3af" />
          <Text className="mt-4 text-xl font-bold text-black dark:text-white">
            {t('error.title')}
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-500">
            {t('error.message')}
          </Text>
          <Pressable
            onPress={() => {
              setPickerLoading(true);
              loadPickerData(sortMode, sortReversed);
            }}
            className="mt-8 items-center rounded-xl bg-black px-8 py-4 dark:bg-white"
          >
            <Text className="text-base font-semibold text-white dark:text-black">
              {t('error.retry')}
            </Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return (
      <ReviewPicker
        totalDue={totalDue}
        hasWords={hasWords}
        bookCounts={bookCounts}
        sortMode={sortMode}
        sortReversed={sortReversed}
        searchQuery={searchQuery}
        onSearchQueryChange={handleSearchQueryChange}
        highlightedBookId={highlightedBookId}
        searchMatches={searchMatches}
        handleSearchComplete={handleSearchComplete}
        handleSortChange={handleSortChange}
        handleStartRequest={handleStartRequest}
        loadPickerData={loadPickerData}
        streak={streak}
        toastMsg={toastMsg}
        toastVisible={toastVisible}
        setToastVisible={setToastVisible}
        onMinWordToast={handleMinWordToast}
        pickerListRef={pickerListRef}
        highlightTimerRef={highlightTimerRef}
        settingsModal={settingsModal}
      />
    );
  }

  // ── Review Phase: Loading ──
  if (reviewLoading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Text className="text-sm text-gray-400">{t('review.loading')}</Text>
      </SafeAreaView>
    );
  }

  // ── Review Phase: Complete ──
  if (isComplete) {
    return (
      <ReviewComplete
        stats={stats}
        completeCelebrate={completeCelebrate}
        showNotifPrompt={showNotifPrompt}
        setShowNotifPrompt={setShowNotifPrompt}
        limitRemaining={limitRemaining}
        goBackToPicker={goBackToPicker}
        paywallVisible={paywallVisible}
        setPaywallVisible={setPaywallVisible}
      />
    );
  }

  // ── Review Phase: Active Card ──
  const currentBookName = current.bookId ? bookNames[current.bookId] : null;

  return (
    <ReviewActiveCard
      index={index}
      words={words}
      current={current}
      currentBookName={currentBookName}
      reviewMode={reviewMode}
      flipped={flipped}
      setFlipped={wrappedSetFlipped}
      isAnswered={isAnswered}
      showFinish={showFinish}
      langs={langs}
      cardReversed={cardReversed}
      choices={choices}
      choiceSelected={choiceSelected}
      setChoiceSelected={wrappedSetChoiceSelected}
      correctDefinition={correctDefinition}
      contextExampleIdx={contextExampleIdx}
      dictationInput={dictationInput}
      setDictationInput={setDictationInput}
      dictationChecked={dictationChecked}
      setDictationChecked={wrappedSetDictationChecked}
      handleRate={handleRate}
      handleBack={handleBack}
      handleSkip={handleSkip}
      handleSpeak={handleSpeak}
      goBackToPicker={goBackToPicker}
      getAnswerQuality={getAnswerQuality}
      showReport={showReport}
      setShowReport={setShowReport}
      reportToast={reportToast}
      setReportToast={setReportToast}
      premium={premium}
      limitRemaining={limitRemaining}
      limitTotal={limitTotal}
      showLimitModal={showLimitModal}
      limitAdAvailable={limitAdAvailable}
      handleLimitWatchAd={handleLimitWatchAd}
      handleLimitPremium={handleLimitPremium}
      handleLimitSwitchMode={handleLimitSwitchMode}
      handleLimitEnd={handleLimitEnd}
      paywallVisible={paywallVisible}
      setPaywallVisible={setPaywallVisible}
      modeDisplayName={modeDisplayName(reviewMode)}
    />
  );
}
