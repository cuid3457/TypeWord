import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, BackHandler, FlatList, Keyboard, Pressable, Text } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTtsText, phonemeForChinese, prefetchSpeak, prefetchSpeakAwaitable, speakWord, stopSpeaking } from '@src/utils/ttsLocale';
import { compareDictation } from '@src/utils/dictationCompare';
import { getSttLocale } from '@src/utils/sttLocale';
import { ReviewSettingsSheet } from '@/components/review/ReviewSettingsSheet';
import { ReviewComplete } from '@/components/review/ReviewComplete';
import { ReviewPicker } from '@/components/review/ReviewPicker';
import { ReviewActiveCard } from '@/components/review/ReviewActiveCard';
import { ReviewLimitModal } from '@/components/review-limit-modal';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';

import * as Haptics from 'expo-haptics';
import { useRefreshReviewBadge, useTabBarVisibility } from '@/app/(tabs)/_layout';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { saveUserSettings } from '@src/storage/userSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedReview, refreshReview, subscribeReview } from '@src/services/reviewCache';
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
import { isComboMilestone, playSfx } from '@src/services/sfxService';
import { getStreak, getTodayStreakDate, recordStudyDateIfQualified, type StreakInfo } from '@src/services/streakService';
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
  const markeredExampleIndices = (examples?: { sentence?: string }[]): number[] => {
    if (!examples || examples.length === 0) return [];
    const out: number[] = [];
    for (let i = 0; i < examples.length; i++) {
      if (examples[i]?.sentence?.includes('**')) out.push(i);
    }
    return out;
  };
  const DEFAULT_SESSION = 20;
  const MIN_SESSION = 10;
  const MAX_SESSION = 50;

  // Phase: 'picker' = choose wordlist, 'review' = flashcard session
  const [phase, setPhase] = useState<'picker' | 'review'>('picker');

  // Seed from boot-prefetch cache so first focus avoids the loading flash.
  const initialReview = getCachedReview();
  // Picker state
  const [bookCounts, setBookCounts] = useState<BookReviewCount[]>(initialReview?.bookCounts ?? []);
  const [totalDue, setTotalDue] = useState(initialReview?.totalDue ?? 0);
  const [hasWords, setHasWords] = useState(initialReview?.hasWords ?? true);
  const [pickerLoading, setPickerLoading] = useState(!initialReview);
  const [sortMode, setSortMode] = useState<BookSortMode>('recent');
  const [sortReversed, setSortReversed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedBookId, setHighlightedBookId] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(initialReview?.streak ?? null);
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
  const [settingsRemaining, setSettingsRemaining] = useState<Record<string, number>>({ flashcard: Infinity, choice: Infinity, dictation: Infinity, context: Infinity, fill_blank: Infinity, auto: Infinity });

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const sheetTranslateY = useSharedValue(0);
  const hideSettings = useCallback(() => {
    setShowSettings(false);
  }, []);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);
  const [reviewOrder, setReviewOrder] = useState<ReviewOrder>((settings?.reviewOrder as ReviewOrder) ?? 'shuffle');
  const reviewOrderHydratedRef = useRef(false);
  useEffect(() => {
    if (reviewOrderHydratedRef.current) return;
    if (!settings) return;
    reviewOrderHydratedRef.current = true;
    const stored = settings.reviewOrder as ReviewOrder | undefined;
    if (stored && stored !== reviewOrder) {
      setReviewOrder(stored);
    }
  }, [settings, reviewOrder]);
  useEffect(() => {
    if (!reviewOrderHydratedRef.current || !settings) return;
    if (settings.reviewOrder === reviewOrder) return;
    saveUserSettings({ ...settings, reviewOrder }).catch(() => {});
  }, [reviewOrder, settings]);
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
  const [sessionCount, setSessionCount] = useState(Math.max(MIN_SESSION, settings?.sessionCount ?? DEFAULT_SESSION));

  // Auto-play TTS at card start — defaults to true (existing behavior).
  // Persisted via userSettings so the toggle survives app restarts.
  const [autoPlayTts, setAutoPlayTtsState] = useState<boolean>(settings?.autoPlayTts ?? true);
  const autoPlayTtsHydratedRef = useRef(false);
  useEffect(() => {
    if (autoPlayTtsHydratedRef.current) return;
    if (!settings) return;
    autoPlayTtsHydratedRef.current = true;
    if (typeof settings.autoPlayTts === 'boolean' && settings.autoPlayTts !== autoPlayTts) {
      setAutoPlayTtsState(settings.autoPlayTts);
    }
  }, [settings, autoPlayTts]);
  const setAutoPlayTts = useCallback((v: boolean) => {
    setAutoPlayTtsState(v);
    if (settings) saveUserSettings({ ...settings, autoPlayTts: v }).catch(() => {});
  }, [settings]);

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

  // Listen for cache updates (boot prefetch, focus refresh).
  useEffect(() => {
    return subscribeReview((snap) => {
      setBookCounts(snap.bookCounts);
      setTotalDue(snap.totalDue);
      setHasWords(snap.hasWords);
      if (snap.streak) setStreak(snap.streak);
      setPickerLoading(false);
      setPickerError(false);
    });
  }, []);

  const loadPickerData = useCallback(async (sort: BookSortMode, reversed: boolean) => {
    try {
      await refreshReview(sort, reversed);
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

  const goBackToPicker = useCallback(async () => {
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

  // Auto-rate on screen blur (tab switch, navigation away)
  useFocusEffect(
    useCallback(() => {
      return () => {
        flushPending();
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

  // Cut audio whenever we leave the review screen so a card's in-flight
  // playback can't continue running over the picker / next session.
  useEffect(() => {
    if (phase !== 'review') stopSpeaking();
  }, [phase]);

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
    if (meanings.length === 0) return '';
    if (meanings.length === 1) return meanings[0].definition;
    const ex = cur.result.examples?.[exIdx];
    if (ex && ex.meaningIndex !== undefined
        && ex.meaningIndex >= 0
        && ex.meaningIndex < meanings.length) {
      return meanings[ex.meaningIndex].definition;
    }
    return meanings[0].definition;
  };

  const generateChoices = (ws: StoredWord[], idx: number, tgtMap?: Record<string, string>, contextExIdx?: number) => {
    const cur = ws[idx];
    const map = tgtMap ?? targetLangs;
    const curTgt = cur?.bookId ? map[cur.bookId] : '';

    const correct = contextExIdx !== undefined
      ? findContextDefinition(cur, contextExIdx)
      : cur?.result.meanings?.[0]?.definition ?? '';

    const sameTargetCandidates = ws
      .filter((w, i) => i !== idx && w.result.meanings?.length)
      .filter((w) => {
        if (!curTgt) return true;
        const tgt = w.bookId ? map[w.bookId] : '';
        return tgt === curTgt;
      })
      .map((w) => (w.result.meanings[0].definition ?? '').trim())
      .filter((d) => d.length > 0);

    const sameTargetUnique = [...new Set(sameTargetCandidates)].filter((d) => d !== correct);
    let wrong = shuffleArray(sameTargetUnique).slice(0, 3);

    // Cross-target fallback: when the user only has a few words in this
    // target language, dipping into other books avoids the "blank slot"
    // bug where setChoices got 1-3 entries and the 4th radio rendered empty.
    if (wrong.length < 3) {
      const allCandidates = ws
        .filter((w, i) => i !== idx && w.result.meanings?.length)
        .map((w) => (w.result.meanings[0].definition ?? '').trim())
        .filter((d) => d.length > 0 && d !== correct);
      const allUnique = [...new Set(allCandidates)];
      wrong = shuffleArray(allUnique).slice(0, 3);
    }

    // Final guard — if correct itself is empty or we still don't have 3
    // wrong options, refuse to set choices (caller still renders the card
    // but the choice list is short). Better than a phantom empty radio.
    if (!correct.trim() || wrong.length === 0) {
      setChoices([]);
      setChoiceSelected(null);
      return;
    }
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

    const sameSrcCandidates = ws
      .filter((w, i) => i !== idx && w.word)
      .filter((w) => {
        if (!curSrc) return true;
        const sl = w.bookId ? map[w.bookId] : '';
        return sl === curSrc;
      })
      .map((w) => (w.word ?? '').trim())
      .filter((w) => w.length > 0);

    const sameSrcUnique = [...new Set(sameSrcCandidates)].filter((w) => w !== correct);
    let wrong = shuffleArray(sameSrcUnique).slice(0, 3);

    if (wrong.length < 3) {
      const allCandidates = ws
        .filter((w, i) => i !== idx && w.word)
        .map((w) => (w.word ?? '').trim())
        .filter((w) => w.length > 0 && w !== correct);
      const allUnique = [...new Set(allCandidates)];
      wrong = shuffleArray(allUnique).slice(0, 3);
    }

    if (!correct.trim() || wrong.length === 0) {
      setChoices([]);
      setChoiceSelected(null);
      return;
    }
    setChoices(shuffleArray([correct, ...wrong]));
    setChoiceSelected(null);
  };

  const startReview = async (bookId?: string | null, order: ReviewOrder = 'shuffle', count = DEFAULT_SESSION) => {
    // Halt any in-flight playback from the previous session so leftover
    // audio doesn't bleed into the loading screen / first card of the new
    // one. stopSpeaking bumps the speakSeq token in ttsService, invalidating
    // any awaiting speakCloud calls before they reach startPlayback.
    stopSpeaking();
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

      // Per-word freshness probe removed 2026-05-14 (v1 mechanism deleted).
      // sync-user-words RPC keeps user_words fresh against word_entries on
      // app launch / foreground resume, so reviewable words are already
      // up-to-date by the time the session starts.
      const freshWords = ws;

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

      // Audio pre-warm: BLOCK on the first word's audio (the user always hears
      // it immediately on the first card, dictation or otherwise). Words 2-3
      // and the first example of each fire as fire-and-forget so they're
      // likely ready by the time the user navigates to them. A 30s safety
      // timeout guards against a stuck network — the loading screen stays
      // visible during the await (reviewLoading is still true).
      if (ordered.length > 0) {
        const w = ordered[0];
        const lang = w.bookId ? (langMap[w.bookId] ?? 'en') : 'en';
        const firstWordPromise = prefetchSpeakAwaitable(
          getTtsText(w.word, lang, w.result.reading),
          lang,
          w.readingKey
            ? phonemeForChinese(lang, w.result.reading, w.word) ?? undefined
            : undefined,
        );
        await Promise.race([
          firstWordPromise,
          new Promise<void>((r) => setTimeout(r, 30000)),
        ]);
      }
      // Background warm-up for the next two cards + first example each — fire-
      // and-forget so they overlap with the user reading the first card.
      for (let i = 1; i < Math.min(3, ordered.length); i++) {
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
      for (let i = 0; i < Math.min(3, ordered.length); i++) {
        const w = ordered[i];
        const lang = w.bookId ? (langMap[w.bookId] ?? 'en') : 'en';
        const firstExample = (w.result.examples ?? [])[0];
        if (firstExample?.sentence) {
          const plain = firstExample.sentence.replace(/\*\*/g, '').trim();
          if (plain) prefetchSpeak(plain, lang);
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
      const limit = getDailyLimit();
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

    playSfx('session-complete');

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

      // Persist today's streak-date so the calendar / streak survive future
      // wordlist deletion. Fire-and-forget; idempotent.
      recordStudyDateIfQualified().catch(() => {});

      // Award session points: correct × accuracy multiplier. No daily cap —
      // engagement maximization is the launch goal, accuracy-weighting
      // already prevents low-effort grinding (5-word perfect = ~8 pts vs
      // 20-word perfect = ~30 pts). Server caps per-call to 50 anyway.
      try {
        const total = stats.total;
        const correct = stats.gotIt;
        if (total >= 5 && correct > 0) {
          const accuracy = correct / total;
          const mult = accuracy >= 0.9 ? 1.5
            : accuracy >= 0.7 ? 1.0
            : accuracy >= 0.5 ? 0.7
            : 0.3;
          const amount = Math.round(correct * mult);
          if (amount > 0) {
            const { awardSessionPoints } = await import('@src/services/pointsService');
            awardSessionPoints(amount).catch(() => {});
          }
        }
      } catch { /* silent */ }

      const s = await getStreak();
      setStreak(s);
      if (s.todayDone && s.current > 0) {
        const milestone = await shouldCelebrate(s.current);
        if (milestone) {
          await markCelebrated(s.current);
          setCompleteCelebrate({ type: 'milestone', streak: s.current, variant: 0 });
          // Streak milestone reuses level-up SFX — same "stepped up" family.
          // Delayed past session-complete (1.0s) so they never overlap.
          setTimeout(() => playSfx('level-up'), 1000);
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
      // Combo milestone (5/10/20) replaces the Correct ding with the louder
      // Combo arpeggio — milestone-only firing keeps it from going stale.
      playSfx(isComboMilestone(combo + 1) ? 'combo' : 'correct');
      // Level-up SFX rides on the awardXP promise. Delay so it doesn't
      // collide with the correct/combo ding that just played.
      awardXP(earned).then((res) => {
        if (res.leveledUp) setTimeout(() => playSfx('level-up'), 500);
      }).catch(() => {});
      setXpGain({ amount: earned, key: Date.now() });
      setCombo((c) => c + 1);
    } else if (quality === 'still_learning') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playSfx('wrong');
      setCombo(0);
    } else {
      // uncertain: selection haptic only. SFX stays silent so the correct/
      // wrong family meaning isn't blurred — "neither right nor wrong, just
      // moving on" deserves a different sensory channel.
      Haptics.selectionAsync();
    }
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
    router.push('/subscription');
  };

  const handleLimitEnd = () => {
    setShowLimitModal(false);
    if (phase === 'review') {
      setIndex(words.length);
    }
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
    // Hoisted so the cleanup at the bottom of the effect can cancel a pending
    // TTS timer when the user advances to the next card faster than the SFX
    // gap (otherwise the prior card's playWord fires into the new card).
    let ttsTimer: ReturnType<typeof setTimeout> | null = null;
    const m: ResolvedMode = reviewMode === 'auto'
      ? (cardModes[index] ?? 'flashcard')
      : reviewMode;
    const wordId = words[index]?.id;
    // restrictToMarkered=true narrows the pool to examples whose translation
    // has highlight markers — required for context/fill_blank where the
    // marker is the visible bridge between sentence and word.
    // Pick the meaning first (weighted toward the primary sense), then a
    // random example within that meaning. This decouples display frequency
    // from how many examples the data happens to hold per meaning, so a word
    // Per-sense frequency weight derived from each meaning's
    // relevanceScore (0–100 range, prompt instructs the model to emit
    // sense frequency: 80+ core / 40–79 secondary). A cubic power
    // amplifies the spread so highly-skewed words like "New York"
    // (city 99 / state 1 / cocktail 1) yield nearly-deterministic
    // first-sense picks while balanced homonyms like "배" (90/90/85)
    // still rotate roughly evenly. If relevanceScore is missing /
    // identical, falls back to uniform.
    const meaningWeights = (
      meanings: { relevanceScore?: number }[],
    ): number[] => {
      const n = meanings.length;
      if (n <= 1) return [1];
      const raw = meanings.map((m) =>
        Math.max(1, Math.min(100, m.relevanceScore ?? 50)),
      );
      const powered = raw.map((r) => Math.pow(r, 3));
      const sum = powered.reduce((a, b) => a + b, 0);
      if (sum <= 0) return Array.from({ length: n }, () => 1 / n);
      return powered.map((p) => p / sum);
    };
    const pickExampleIdx = (restrictToMarkered: boolean): number => {
      const w = words[index];
      const examples = w?.result.examples ?? [];
      if (examples.length === 0) return 0;
      const meanings = w?.result.meanings ?? [];
      const isValid = (i: number) => !restrictToMarkered || examples[i]?.sentence?.includes('**');
      const validIndices = examples.map((_, i) => i).filter(isValid);
      if (validIndices.length === 0) return 0;
      const cached = wordId ? cardExampleIdx[wordId] : undefined;
      if (cached !== undefined && validIndices.includes(cached)) return cached;

      // Group valid example indices by meaningIndex
      const byMeaning = new Map<number, number[]>();
      for (const i of validIndices) {
        const mi = examples[i]?.meaningIndex ?? 0;
        if (!byMeaning.has(mi)) byMeaning.set(mi, []);
        byMeaning.get(mi)!.push(i);
      }

      const weights = meaningWeights(meanings.length > 0 ? meanings : [{}]);
      // Restrict to meanings that actually have valid examples
      const eligible = [...byMeaning.keys()].filter((mi) => mi < weights.length);
      const totalWeight = eligible.reduce((s, mi) => s + (weights[mi] ?? 0), 0);
      let chosenMeaning: number;
      if (totalWeight <= 0) {
        // Fallback: uniform across all valid examples (data has no usable meaningIndex)
        const fresh = validIndices[Math.floor(Math.random() * validIndices.length)];
        if (wordId) setCardExampleIdx((prev) => ({ ...prev, [wordId]: fresh }));
        return fresh;
      }
      let r = Math.random() * totalWeight;
      chosenMeaning = eligible[0];
      for (const mi of eligible) {
        r -= weights[mi] ?? 0;
        if (r <= 0) { chosenMeaning = mi; break; }
      }

      const candidates = byMeaning.get(chosenMeaning)!;
      const fresh = candidates[Math.floor(Math.random() * candidates.length)];
      if (wordId) setCardExampleIdx((prev) => ({ ...prev, [wordId]: fresh }));
      return fresh;
    };
    // Compute the example index ONCE per card transition so auto-play and
    // the choice generator agree. Reading contextExampleIdx state here would
    // be stale — the setContextExampleIdx call above is queued and won't
    // apply until the next render, so the auto-play would use the previous
    // card's index and play a sentence that doesn't match what's on screen.
    const needsExampleIdx = m === 'choice' || m === 'context' || m === 'fill_blank';
    const pickedExIdx = needsExampleIdx
      ? pickExampleIdx(m === 'context' || m === 'fill_blank')
      : 0;
    if (m === 'choice' || m === 'context') {
      setContextExampleIdx(pickedExIdx);
      generateChoices(words, index, undefined, m === 'context' ? pickedExIdx : undefined);
    }
    if (m === 'fill_blank') {
      setContextExampleIdx(pickedExIdx);
      generateFillBlankChoices(words, index);
    }
    // Auto-play audio for modes that show the prompt up front. For
    // flashcard reverse (definitions shown, word hidden) and fill_blank
    // (word hidden in the blank), playing the headword would reveal the
    // answer — skip those. Context plays the example sentence (the word
    // is visible inside it anyway). The next word's audio is pre-warmed
    // so navigation feels instant.
    const w = words[index];
    if (w) {
      const lang = (w.bookId ? langs[w.bookId] : 'en') ?? 'en';
      const phoneme = w.readingKey
        ? phonemeForChinese(lang, w.result.reading, w.word) ?? undefined
        : undefined;
      const playWord = () =>
        speakWord(getTtsText(w.word, lang, w.result.reading), lang, phoneme);

      // First card has no SFX before it — play immediately. Subsequent cards
      // wait so the correct/wrong/combo ding finishes before TTS grabs the
      // audio focus (iOS single-channel default kills any in-flight SFX
      // the moment speakCloud opens a new player).
      const ttsDelay = index === 0 ? 0 : 600;
      if (autoPlayTts) {
        ttsTimer = setTimeout(() => {
          if (m === 'dictation' || m === 'choice' || (m === 'flashcard' && !cardReversed)) {
            playWord();
          } else if (m === 'context') {
            const examples = w.result.examples ?? [];
            const ex = examples[pickedExIdx] ?? examples[0];
            if (ex?.sentence) {
              speakWord(ex.sentence.replace(/\*\*/g, '').trim(), lang);
            }
          }
        }, ttsDelay);
      }

      // Pre-warm the next word's audio so navigation feels instant.
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
    return () => {
      if (ttsTimer) clearTimeout(ttsTimer);
    };
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
      autoPlayTts={autoPlayTts}
      setAutoPlayTts={setAutoPlayTts}
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
      <>
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
        <ReviewLimitModal
          visible={showLimitModal}
          canWatchAd={limitAdAvailable}
          onWatchAd={handleLimitWatchAd}
          onPremium={handleLimitPremium}
          onEnd={handleLimitEnd}
        />
      </>
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
      targetLangs={targetLangs}
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
      handleLimitEnd={handleLimitEnd}
    />
  );
}
