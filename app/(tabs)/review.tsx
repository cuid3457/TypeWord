import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, BackHandler, FlatList, Keyboard, Pressable, Text } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTtsText, phonemeForChinese, prefetchSpeak, speakWord } from '@src/utils/ttsLocale';
import { compareDictation } from '@src/utils/dictationCompare';
import { getSttLocale } from '@src/utils/sttLocale';
import { ReviewSettingsSheet } from '@/components/review/ReviewSettingsSheet';
import { ReviewComplete } from '@/components/review/ReviewComplete';
import { ReviewPicker } from '@/components/review/ReviewPicker';
import { ReviewActiveCard } from '@/components/review/ReviewActiveCard';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';

import * as Haptics from 'expo-haptics';
import { useRefreshReviewBadge, useTabBarVisibility } from '@/app/(tabs)/_layout';
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
import { awardXP, calculateXP } from '@src/services/xpService';
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
  type ReviewMode = 'flashcard' | 'choice' | 'dictation' | 'context' | 'fill_blank' | 'auto';
  // Modes a single card can actually render (auto resolves into one of these per card).
  type ResolvedMode = Exclude<ReviewMode, 'auto'>;
  const AUTO_CANDIDATE_MODES: ResolvedMode[] = ['flashcard', 'choice', 'dictation', 'context', 'fill_blank'];
  // Indices of examples whose translation contains highlight markers. context
  // and fill_blank both surface the translation as the bridge between sentence
  // and word — examples missing that bridge (e.g. negated form 모르다 for 知道)
  // make the card visually broken, so they're excluded from review picking.
  const markeredExampleIndices = (examples?: { translation?: string }[]): number[] => {
    if (!examples || examples.length === 0) return [];
    const out: number[] = [];
    for (let i = 0; i < examples.length; i++) {
      if (examples[i]?.translation?.includes('**')) out.push(i);
    }
    return out;
  };
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
  const [settingsRemaining, setSettingsRemaining] = useState<Record<string, number>>({ flashcard: Infinity, choice: Infinity, dictation: Infinity, context: Infinity, fill_blank: Infinity, auto: Infinity });

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const sheetTranslateY = useSharedValue(0);
  const hideSettings = useCallback(() => {
    setShowSettings(false);
  }, []);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);
  const [reviewOrder, setReviewOrder] = useState<ReviewOrder>('shuffle');
  const [reviewMode, setReviewMode] = useState<ReviewMode>((settings?.reviewMode as ReviewMode) ?? 'auto');
  // settings hook loads async — once it arrives, hydrate from the stored
  // last-used mode. Tracked by ref so we only hydrate once (subsequent
  // user changes within the session must not be clobbered).
  const reviewModeHydratedRef = useRef(false);
  useEffect(() => {
    if (reviewModeHydratedRef.current) return;
    if (!settings) return;
    reviewModeHydratedRef.current = true;
    const stored = settings.reviewMode as ReviewMode | undefined;
    if (stored && stored !== reviewMode) {
      setReviewMode(stored);
    }
  }, [settings, reviewMode]);
  // Persist reviewMode the moment the user picks one — saving only at
  // session start meant cancelling out of the sheet would lose the
  // selection on the next app launch.
  useEffect(() => {
    if (!reviewModeHydratedRef.current || !settings) return;
    if (settings.reviewMode === reviewMode) return;
    saveUserSettings({ ...settings, reviewMode }).catch(() => {});
  }, [reviewMode, settings]);
  const [sessionCount, setSessionCount] = useState(settings?.sessionCount ?? DEFAULT_SESSION);

  // Choice / context mode state
  const [choices, setChoices] = useState<string[]>([]);
  const [choiceSelected, setChoiceSelected] = useState<number | null>(null);
  const [contextExampleIdx, setContextExampleIdx] = useState(0);
  // Per-card example index cache keyed by word id. Without this, going back
  // and forward through the deck re-randomizes the example sentence shown
  // for context / fill_blank, so the same card looks different on revisit.
  const [cardExampleIdx, setCardExampleIdx] = useState<Record<string, number>>({});

  // Dictation mode state. Mic input writes into dictationInput via STT —
  // typing and speaking share the same input + grading path.
  const [dictationInput, setDictationInput] = useState('');
  const [dictationChecked, setDictationChecked] = useState(false);
  const [dictationListening, setDictationListening] = useState(false);

  // Per-card resolved mode for `auto`. Empty for non-auto sessions; for auto,
  // length matches `words` and indexes align so resolvedMode() can read by idx.
  const [cardModes, setCardModes] = useState<ResolvedMode[]>([]);

  // Gamification — combo (resets on still_learning, kept on uncertain) and
  // a transient XP gain popup that fades after each correct answer. Total
  // XP lives in xpService and is shown on the dashboard.
  const [combo, setCombo] = useState(0);
  const [xpGain, setXpGain] = useState<{ amount: number; key: number } | null>(null);


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
    // Reset session state so the next startReview doesn't render with the
    // previous session's stale completeCelebrate / words / index.
    setWords([]);
    setCardModes([]);
    setIndex(0);
    setCompleteCelebrate(null);
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

  // Hide the tab bar during an active review session — the bottom tabs
  // steal vertical space and break focus when the user is mid-card. Picker
  // phase keeps the tabs so navigation between Wordlists / Review /
  // Dashboard / Settings is one tap away. Goes through the layout's
  // TabBarVisibleContext so the layout-owned tabBarStyle (height,
  // paddingBottom, background) is preserved — setOptions on the screen
  // would replace the entire style and shift the bar's position.
  const { setHidden: setTabBarHidden } = useTabBarVisibility();
  useEffect(() => {
    setTabBarHidden(phase === 'review');
    return () => { setTabBarHidden(false); };
  }, [phase, setTabBarHidden]);

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
    if (settings && (settings.sessionCount !== sessionCount || settings.reviewMode !== reviewMode)) {
      await saveUserSettings({ ...settings, sessionCount, reviewMode });
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

  // Fill-blank picks WORDS from the same source language as distractors
  // (instead of definitions). The blank in the example sentence asks "which
  // word fills this spot?" so the choice list must be word forms.
  const generateFillBlankChoices = (ws: StoredWord[], idx: number, langMap?: Record<string, string>) => {
    const cur = ws[idx];
    if (!cur) return;
    const map = langMap ?? langs;
    const curSrc = cur.bookId ? map[cur.bookId] : '';
    const correct = cur.word;

    const candidates = ws
      .filter((w, i) => i !== idx && w.word)
      .filter((w) => {
        if (!curSrc) return true;
        const sl = w.bookId ? map[w.bookId] : '';
        return sl === curSrc;
      })
      .map((w) => w.word);

    const unique = [...new Set(candidates)].filter((w) => w !== correct);
    const wrong = shuffleArray(unique).slice(0, 3);
    setChoices(shuffleArray([correct, ...wrong]));
    setChoiceSelected(null);
  };

  const startReview = async (bookId?: string | null, order: ReviewOrder = 'shuffle', count = DEFAULT_SESSION) => {
    setReviewLoading(true);
    setSelectedBookId(bookId ?? null);
    try {
      const { getNewCardsRemainingToday } = await import('@src/services/newCardLimitService');
      const newCardBudget = await getNewCardsRemainingToday();
      const ws = await getReviewableWords(count, bookId, newCardBudget);

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

      // fill_blank and context both lean on the marker bridge between the
      // example sentence and its translation. Drop words with no markered
      // example so every card can render that bridge; auto mode handles this
      // per-card by demoting these cards out of the fill_blank/context pool.
      if (reviewMode === 'fill_blank' || reviewMode === 'context') {
        ordered = ordered.filter((w) => markeredExampleIndices(w.result.examples).length > 0);
      }

      // Empty session → bail back to picker with a toast instead of falling
      // through to ReviewComplete (which would otherwise show a stale streak
      // celebration from the previous session).
      if (ordered.length === 0) {
        setPhase('picker');
        setWords([]);
        setCardModes([]);
        setIndex(0);
        setCompleteCelebrate(null);
        setToastMsg(t('review.no_cards_for_mode'));
        setToastVisible(true);
        return;
      }

      // Resolve per-card mode for auto sessions. fill_blank and context both
      // require at least one markered example; cards without one fall back to
      // the remaining modes uniformly.
      const resolvedModes: ResolvedMode[] = reviewMode === 'auto'
        ? ordered.map((w) => {
            const hasMarkered = markeredExampleIndices(w.result.examples).length > 0;
            const pool = hasMarkered
              ? AUTO_CANDIDATE_MODES
              : AUTO_CANDIDATE_MODES.filter((m) => m !== 'fill_blank' && m !== 'context');
            return pool[Math.floor(Math.random() * pool.length)];
          })
        : [];

      setWords(ordered);
      setCardModes(resolvedModes);
      setLangs(langMap);
      setTargetLangs(tgtLangMap);
      setBookNames(nameMap);
      setIndex(0);
      setCompleteCelebrate(null);

      // Pre-warm audio for the first 2 words of a dictation session so the
      // initial playback isn't bottlenecked on a fresh fetchTts round-trip.
      if (reviewMode === 'dictation') {
        for (let i = 0; i < Math.min(2, ordered.length); i++) {
          const w = ordered[i];
          const lang = w.bookId ? (langMap[w.bookId] ?? 'en') : 'en';
          prefetchSpeak(
            getTtsText(w.word, lang, w.result.reading),
            lang,
            w.readingKey
              ? phonemeForChinese(lang, w.result.reading, w.word) ?? undefined
              : undefined,
          );
        }
      }
      setFlipped(false);
      setDictationInput('');
      setDictationChecked(false);
      setDictationListening(false);
      setStats({ total: 0, gotIt: 0, uncertain: 0, stillLearning: 0 });
      setHistory([]);
      setReExposureCount({});
      setWordResults({});
      setSkipCount({});
      setCardExampleIdx({});
      setCombo(0);
      setXpGain(null);
      committedCardsRef.current = new Set();
      setPhase('review');

      const remaining = await getRemaining(reviewMode as LimitReviewMode);
      const limit = getDailyLimit(reviewMode as LimitReviewMode);
      setLimitRemaining(remaining);
      setLimitTotal(limit);

      if ((reviewMode === 'choice' || reviewMode === 'context') && ordered.length > 0) {
        // context picks only from markered examples; choice is unaffected by
        // markers so it falls back to the full list.
        const examples = ordered[0]?.result.examples;
        const pool = reviewMode === 'context'
          ? markeredExampleIndices(examples)
          : examples?.map((_, i) => i) ?? [];
        const exIdx = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : 0;
        setContextExampleIdx(exIdx);
        generateChoices(ordered, 0, tgtLangMap, reviewMode === 'context' ? exIdx : undefined);
      }
      if (reviewMode === 'fill_blank' && ordered.length > 0) {
        const pool = markeredExampleIndices(ordered[0]?.result.examples);
        const exIdx = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : 0;
        setContextExampleIdx(exIdx);
        generateFillBlankChoices(ordered, 0, langMap);
      }
    } catch {
      setPickerError(true);
    } finally {
      setReviewLoading(false);
    }
  };


  const current = words[index];
  // Flashcards show word → definition only (no direction alternation).
  const cardReversed = false;
  // For auto sessions, each card's mode comes from the per-card resolution
  // generated at startReview time. Falls back to flashcard if the array is
  // shorter than expected (defensive — shouldn't normally happen).
  const activeMode: ResolvedMode = reviewMode === 'auto'
    ? (cardModes[index] ?? 'flashcard')
    : reviewMode;
  const isComplete = phase === 'review' && !reviewLoading && (words.length === 0 || index >= words.length);

  // Prefetch TTS for the current card so the speaker button is instant.
  // Includes the headword and any example sentences attached to the saved word.
  useEffect(() => {
    if (!current) return;
    const lang = (current.bookId ? langs[current.bookId] : 'en') ?? 'en';
    prefetchSpeak(
      getTtsText(current.word, lang, current.result.reading),
      lang,
      current.readingKey
        ? phonemeForChinese(lang, current.result.reading, current.word) ?? undefined
        : undefined,
    );
    for (const ex of current.result.examples ?? []) {
      const plain = (ex.sentence ?? '').replace(/\*\*/g, '').trim();
      if (plain) prefetchSpeak(plain, lang);
    }
  }, [current, langs]);

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
    // For auto sessions count against the resolved per-card mode bucket so
    // limit accounting matches the modes actually rendered.
    const { allowed, remaining } = await consumeWord(activeMode as LimitReviewMode);
    setLimitRemaining(remaining);
    if (!allowed || remaining <= 0) {
      const adOk = await canWatchRewardedAd();
      setLimitAdAvailable(adOk);
      setShowLimitModal(true);
    }
  }, [premium, activeMode]);

  // Tracks cards whose answer effects (haptic, XP, combo) have already
  // fired this session — so handleRate (called on the Next button) doesn't
  // double-award when the commit already happened on choice/check tap.
  const committedCardsRef = useRef<Set<string>>(new Set());

  // Fire the immediate "you answered" feedback: haptic + XP + combo update +
  // floating XP popup. Idempotent per (session, card) — second call for the
  // same card is a no-op so flashcard's handleRate path and the choice/
  // dictation wrappers can both call it safely.
  const commitAnswerEffects = useCallback((quality: 'got_it' | 'uncertain' | 'still_learning') => {
    if (!current) return;
    if (committedCardsRef.current.has(current.id)) return;
    committedCardsRef.current.add(current.id);
    if (quality === 'got_it') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const earned = calculateXP({
        mode: activeMode,
        intervalDays: current.intervalDays ?? 0,
        reviewCount: current.reviewCount ?? 0,
        combo,
      });
      awardXP(earned).catch(() => {});
      setXpGain({ amount: earned, key: Date.now() });
      setCombo((c) => c + 1);
    } else if (quality === 'still_learning') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCombo(0);
    }
    // uncertain: no haptic, no XP, combo unchanged.
  }, [current, activeMode, combo]);

  const wrappedSetFlipped = useCallback((v: boolean) => {
    if (v && !flipped) consumeOnAnswer();
    setFlipped(v);
  }, [flipped, consumeOnAnswer]);

  const wrappedSetChoiceSelected = useCallback((i: number | null) => {
    if (i !== null && choiceSelected === null) {
      consumeOnAnswer();
      // Compute correctness inline (mirrors the `correctDefinition` derivation
      // below) and fire commit effects immediately — no need to wait for the
      // user to tap Next.
      const cur = words[index];
      let correct = '';
      if (cur) {
        if (activeMode === 'context') {
          correct = findContextDefinition(cur, contextExampleIdx);
        } else if (activeMode === 'fill_blank') {
          correct = cur.word;
        } else {
          correct = cur.result.meanings?.[0]?.definition ?? '';
        }
      }
      commitAnswerEffects(choices[i] === correct ? 'got_it' : 'still_learning');
    }
    setChoiceSelected(i);
  }, [choiceSelected, consumeOnAnswer, choices, activeMode, words, index, contextExampleIdx, commitAnswerEffects]);

  const wrappedSetDictationChecked = useCallback((v: boolean) => {
    if (v && !dictationChecked && current) {
      consumeOnAnswer();
      const lang = current.bookId ? langs[current.bookId] ?? 'en' : 'en';
      const result = compareDictation(dictationInput, current.word, lang);
      commitAnswerEffects(result === 'wrong' ? 'still_learning' : 'got_it');
    }
    setDictationChecked(v);
  }, [dictationChecked, consumeOnAnswer, current, langs, dictationInput, commitAnswerEffects]);

  const handleRate = async (quality: 'got_it' | 'uncertain' | 'still_learning') => {
    if (!current) return;
    pendingRef.current = null;
    // Fires haptic + XP + combo for cards that haven't committed yet (the
    // flashcard rate buttons are themselves the commit). For choice/
    // dictation modes the commit already fired on answer tap, so this is
    // a no-op via committedCardsRef.
    commitAnswerEffects(quality);
    let nextReviewMs: number;
    try {
      const result = await updateReviewResult(current.id, quality, activeMode);
      nextReviewMs = result.nextReviewMs;
    } catch {
      nextReviewMs = 0;
    }
    refreshBadge();

    // Within-session re-exposure: a wrong card reappears once, after a
    // distance proportional to the remaining session size. Anki/Pimsleur
    // research shows 1 re-exposure (= 2 total appearances) hits the boredom
    // vs retention sweet spot for adult learners; 3+ wears engagement.
    if (quality === 'still_learning') {
      const count = reExposureCount[current.id] ?? 0;
      if (count < 1) {
        const remaining = Math.max(1, words.length - index - 1);
        const distance = Math.min(8, Math.max(3, Math.floor(remaining / 3)));
        const jitter = Math.floor(Math.random() * 3);
        const insertAt = Math.min(index + distance + jitter, words.length);
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
    setDictationListening(false);

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
    setDictationListening(false);
    setIndex((i) => i - 1);
  };

  const getAnswerQuality = (): 'got_it' | 'uncertain' | 'still_learning' | null => {
    if ((activeMode === 'choice' || activeMode === 'context') && choiceSelected !== null) {
      return choices[choiceSelected] === correctDefinition ? 'got_it' : 'still_learning';
    }
    if (activeMode === 'fill_blank' && choiceSelected !== null && current) {
      return choices[choiceSelected] === current.word ? 'got_it' : 'still_learning';
    }
    if (activeMode === 'dictation' && dictationChecked && current) {
      const lang = current.bookId ? langs[current.bookId] ?? 'en' : 'en';
      const result = compareDictation(dictationInput, current.word, lang);
      return result === 'wrong' ? 'still_learning' : 'got_it';
    }
    if (activeMode === 'flashcard' && flipped) {
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
    setDictationListening(false);
    setIndex((i) => i + 1);
  };

  const handleSpeak = () => {
    if (!current) return;
    const lang = current.bookId ? langs[current.bookId] : 'en';
    const safeLang = lang ?? 'en';
    speakWord(
      getTtsText(current.word, safeLang, current.result.reading),
      safeLang,
      current.readingKey
        ? phonemeForChinese(safeLang, current.result.reading, current.word) ?? undefined
        : undefined,
    );
  };

  // ── Dictation mic: speech-to-text into the dictation input ──
  // Same STT plumbing as the add screen's mic flow: request permission →
  // start → stream interim transcripts → stop. The transcript is piped into
  // dictationInput so typing and speaking share one grading path. Wrapped
  // in try/catch because the native module is absent under Expo Go.
  const handleDictationMicPress = useCallback(async () => {
    if (dictationChecked) return; // already graded — mic is locked
    if (dictationListening) {
      try {
        const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
        ExpoSpeechRecognitionModule.stop();
      } catch { /* no-op */ }
      setDictationListening(false);
      return;
    }
    try {
      const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) return; // user can re-tap mic to re-trigger the system prompt
      const lang = current?.bookId ? langs[current.bookId] : 'en';
      setDictationInput('');
      setDictationListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: getSttLocale(lang ?? 'en'),
        interimResults: true,
      });
    } catch {
      // Module unavailable (Expo Go without dev client). Fall through silently.
      setDictationListening(false);
    }
  }, [dictationListening, dictationChecked, current, langs]);

  // STT event listener — only the dictation mode reacts. Auto sessions also
  // fire only when the resolved per-card mode is dictation.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    const sttActive = () => activeMode === 'dictation';
    try {
      const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
      const resultSub = ExpoSpeechRecognitionModule.addListener(
        'result',
        (event: { results: { transcript: string; isFinal?: boolean }[] }) => {
          if (!sttActive()) return;
          const transcript = event.results[0]?.transcript ?? '';
          setDictationInput(transcript);
          if (event.results[0]?.isFinal) {
            setDictationListening(false);
            if (transcript.trim()) setDictationChecked(true);
          }
        },
      );
      const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
        if (!sttActive()) return;
        setDictationListening(false);
      });
      const errorSub = ExpoSpeechRecognitionModule.addListener('error', () => {
        if (!sttActive()) return;
        setDictationListening(false);
      });
      cleanup = () => {
        resultSub.remove();
        endSub.remove();
        errorSub.remove();
      };
    } catch { /* native module missing */ }
    return () => { cleanup?.(); };
  }, [activeMode]);

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
    pendingRef.current = q ? { wordId: current.id, mode: activeMode, quality: q } : null;
  }, [phase, current?.id, choiceSelected, dictationChecked, dictationInput, flipped, activeMode]);

  // Generate choices / auto-play TTS when index changes. Branches off the
  // resolved per-card mode so auto sessions get the right setup per card.
  // Resolves the example index from the per-card cache when available so
  // navigating back to an earlier card shows the same example sentence.
  useEffect(() => {
    if (phase !== 'review' || words.length === 0 || index >= words.length) return;
    const m: ResolvedMode = reviewMode === 'auto'
      ? (cardModes[index] ?? 'flashcard')
      : reviewMode;
    const wordId = words[index]?.id;
    // restrictToMarkered=true narrows the pool to examples whose translation
    // has highlight markers — required for context/fill_blank where the
    // marker is the visible bridge between sentence and word.
    const pickExampleIdx = (restrictToMarkered: boolean): number => {
      const examples = words[index]?.result.examples;
      const exLen = examples?.length ?? 0;
      if (exLen === 0) return 0;
      const pool = restrictToMarkered
        ? markeredExampleIndices(examples)
        : Array.from({ length: exLen }, (_, i) => i);
      if (pool.length === 0) return 0;
      const cached = wordId ? cardExampleIdx[wordId] : undefined;
      if (cached !== undefined && pool.includes(cached)) return cached;
      const fresh = pool[Math.floor(Math.random() * pool.length)];
      if (wordId) {
        setCardExampleIdx((prev) => ({ ...prev, [wordId]: fresh }));
      }
      return fresh;
    };
    if (m === 'choice' || m === 'context') {
      const exIdx = pickExampleIdx(m === 'context');
      setContextExampleIdx(exIdx);
      generateChoices(words, index, undefined, m === 'context' ? exIdx : undefined);
    }
    if (m === 'fill_blank') {
      const exIdx = pickExampleIdx(true);
      setContextExampleIdx(exIdx);
      generateFillBlankChoices(words, index);
    }
    if (m === 'dictation') {
      const w = words[index];
      const lang = (w.bookId ? langs[w.bookId] : 'en') ?? 'en';
      speakWord(
        getTtsText(w.word, lang, w.result.reading),
        lang,
        w.readingKey
          ? phonemeForChinese(lang, w.result.reading, w.word) ?? undefined
          : undefined,
      );
      // Pre-warm the next word's audio so when the user advances, the cloud
      // TTS response is already in cache and playback starts immediately.
      const next = words[index + 1];
      if (next) {
        const nextLang = (next.bookId ? langs[next.bookId] : 'en') ?? 'en';
        prefetchSpeak(
          getTtsText(next.word, nextLang, next.result.reading),
          nextLang,
          next.readingKey
            ? phonemeForChinese(nextLang, next.result.reading, next.word) ?? undefined
            : undefined,
        );
      }
    }
  }, [index, phase, targetLangs]);

  const isAnswered =
    activeMode === 'choice' || activeMode === 'context' || activeMode === 'fill_blank' ? choiceSelected !== null
    : activeMode === 'dictation' ? dictationChecked
    : flipped;

  // For fill_blank the "correct choice" is the WORD itself; for context it's
  // the definition tied to the chosen example; for choice it's the primary
  // definition. ReviewCardContent compares each candidate to this value.
  const correctDefinition = phase === 'review' && words[index]
    ? activeMode === 'context'
      ? findContextDefinition(words[index], contextExampleIdx)
      : activeMode === 'fill_blank'
      ? words[index].word
      : words[index].result.meanings?.[0]?.definition ?? ''
    : '';

  const showFinish = index >= words.length - 1 && !(
    getAnswerQuality() === 'still_learning' && (reExposureCount[current?.id ?? ''] ?? 0) < 1
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
      reviewMode={activeMode}
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
      dictationListening={dictationListening}
      onDictationMicPress={handleDictationMicPress}
      combo={combo}
      xpGain={xpGain}
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
