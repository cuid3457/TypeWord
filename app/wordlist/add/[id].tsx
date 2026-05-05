import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal } from 'react-native';
import { AppModal } from '@/components/app-modal';
import { Toast } from '@/components/toast';
import type { PartialLookup } from '@src/api/streamLookup';
import { findLanguage } from '@src/constants/languages';
import { getExamplePrefix, getPlaceholder } from '@src/constants/placeholders';
import { findWord, getBook, getTotalWordCount, saveWord } from '@src/db/queries';
import { isAnonymous } from '@src/services/authService';
import { getStreak, getTodayStreakDate } from '@src/services/streakService';
import {
  CELEBRATE_EVENT,
  getDailyVariant,
  shouldCelebrate,
  shouldCelebrateDaily,
} from '@src/services/streakMilestone';
import {
  IMAGE_LIMIT_FREE,
  IMAGE_LIMIT_PREMIUM,
  extractWordsFromImage,
  getImageExtractUsage,
  type ExtractedWord,
} from '@src/services/imageExtractService';
import {
  WordLookupError,
  enrichWord,
  genId,
  lookupWord,
  lookupWordStream,
  resolveHeadword,
  type HeadwordCandidate,
  type WordLookupResponse,
} from '@src/services/wordService';
import { isValidScript } from '@src/utils/scriptValidation';
import { getSttLocale } from '@src/utils/sttLocale';
import type { Book } from '@src/types/book';
import { useNetworkStatus } from '@src/hooks/useNetworkStatus';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePremium } from '@src/hooks/usePremium';
import { ImageCropModal } from '@/components/image-crop-modal';
import { AdBanner } from '@/components/ad-banner';
import { Paywall } from '@/components/paywall';
import { ReportModal } from '@/components/report-modal';
import { ReadingDisplay } from '@/components/reading-display';
import { fetchIpa, ipaApplicable, ipaSupported } from '@src/services/ipaService';
import { promoteToPersistent } from '@src/services/ttsCache';
import { getTtsText, prefetchSpeak, speakWord } from '@src/utils/ttsLocale';
import { VoiceToggle } from '@/components/voice-toggle';
import { formatPOS } from '@src/utils/normalizeResult';

// Per-language max input length (in code points). Mirrors server validator.
// Sized to admit most idioms/proverbs while still rejecting full sentences.
const LANG_LIMITS: Record<string, number> = {
  ko: 25, ja: 25, zh: 25, 'zh-CN': 25, 'zh-TW': 25,
  de: 60, ru: 60,
};
const DEFAULT_WORD_LIMIT = 50;
const MAX_EXPR_LENGTH = 8;

function getLangLimit(lang: string): number {
  return LANG_LIMITS[lang] ?? DEFAULT_WORD_LIMIT;
}

function codepointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/**
 * Fire-and-forget pre-warm for a single reverse-lookup candidate. Runs the
 * full lookup pipeline (quick + enrich + TTS for headword and examples) so
 * that when the user taps this candidate, every downstream cache is hit
 * and the screen renders instantly. Errors are silent — the user-initiated
 * path will retry on actual selection.
 */
function backgroundPrefetchCandidate(
  headword: string,
  sourceLang: string,
  targetLang: string,
  bookId: string,
): void {
  (async () => {
    try {
      const quick = await lookupWord({ word: headword, sourceLang, targetLang, bookId, mode: 'quick' });
      if (!quick?.result?.meanings?.length) return;
      prefetchSpeak(getTtsText(headword, sourceLang, quick.result.reading), sourceLang);
      const enriched = await enrichWord({
        word: headword,
        sourceLang,
        targetLang,
        bookId,
        mode: 'enrich',
        meanings: quick.result.meanings.map((m) => ({
          definition: m.definition,
          partOfSpeech: m.partOfSpeech,
        })),
      });
      for (const ex of enriched?.examples ?? []) {
        const plain = (ex.sentence ?? '').replace(/\*\*/g, '').trim();
        if (plain) prefetchSpeak(plain, sourceLang);
      }
    } catch {
      // silent — main flow handles user-facing errors
    }
  })();
}

function isNumericOrExpression(text: string): boolean {
  const t = text.trim().replace(/,/g, '');
  if (/^\d+(\.\d+)?$/.test(t)) return true;
  if (t.length > 0 && /^[\d\s+\-*/^!=<>().%]+$/.test(t)) return true;
  return false;
}

/**
 * Translate a server "note" code or empty-meanings result into a UI message key.
 */
function getNoteMessageKey(note?: string): string {
  switch (note) {
    case 'sentence': return 'add_word.note_sentence';
    case 'non_word': return 'add_word.note_non_word';
    case 'wrong_language': return 'add_word.note_wrong_language';
    case 'phrase_too_long': return 'add_word.note_phrase_too_long';
    default: return 'add_word.word_not_found';
  }
}
const SEARCH_COOLDOWN_MS = 2000;

// Detect if input text is in the study language or the native language.
// Must distinguish individual scripts — Korean, Japanese, Chinese are NOT interchangeable.
function isStudyLangInput(text: string, studyLang: string): boolean {
  const HANGUL = /[\uAC00-\uD7AF]/;
  const KANA = /[\u3040-\u309F\u30A0-\u30FF]/;
  const HAN = /[\u4E00-\u9FFF]/;
  const CYRILLIC = /[\u0400-\u04FF]/;
  const LATIN = /[a-zA-ZÀ-ÿ]/;

  let ko = 0, ja = 0, han = 0, ru = 0, la = 0;
  for (const ch of text) {
    if (HANGUL.test(ch)) ko++;
    else if (KANA.test(ch)) ja++;
    else if (HAN.test(ch)) han++;
    else if (CYRILLIC.test(ch)) ru++;
    else if (LATIN.test(ch)) la++;
  }

  const total = ko + ja + han + ru + la;
  if (total === 0) return true;

  switch (studyLang) {
    case 'ko': return ko > 0 || han > 0;
    case 'ja': return (ja + han) > 0 && ko === 0;
    case 'zh':
    case 'zh-CN':
    case 'zh-TW':
      return han > 0 && ko === 0 && ja === 0;
    case 'ru': return ru > 0;
    default: return la > 0;
  }
}

export default function AddWordScreen() {
  const { t, i18n } = useTranslation();
  const { id, q: prefillQuery } = useLocalSearchParams<{ id: string; q?: string }>();
  const isConnected = useNetworkStatus();
  const premium = usePremium();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [book, setBook] = useState<Omit<Book, 'userId'> | null>(null);
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [response, setResponse] = useState<WordLookupResponse | null>(null);
  const [partial, setPartial] = useState<PartialLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [toast, setToast] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportToast, setReportToast] = useState('');
  const [showSignupNudge, setShowSignupNudge] = useState(false);

  const [ocrWords, setOcrWords] = useState<ExtractedWord[]>([]);
  const [ocrSelected, setOcrSelected] = useState<Set<number>>(new Set());
  const [ocrModalVisible, setOcrModalVisible] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSaving, setOcrSaving] = useState(false);
  const [ocrUsed, setOcrUsed] = useState(0);

  const [cameraDeniedModal, setCameraDeniedModal] = useState(false);
  const [micDeniedModal, setMicDeniedModal] = useState(false);
  const [listening, setListening] = useState(false);
  const [candidates, setCandidates] = useState<HeadwordCandidate[]>([]);

  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [cropImage, setCropImage] = useState<{ uri: string; width: number; height: number } | null>(null);

  const lastSearchRef = useRef(0);
  const enrichSeqRef = useRef(0);

  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('');

  const startEnrich = useCallback(
    (res: WordLookupResponse, trimmed: string, sLang: string, tLang: string, bookId: string) => {
      if (hasEnriched(res)) return;
      const seq = ++enrichSeqRef.current;
      setEnriching(true);
      enrichWord({
        word: res.result.headword || trimmed,
        sourceLang: sLang,
        targetLang: tLang,
        bookId,
        mode: 'enrich',
        meanings: res.result.meanings?.map((m) => ({
          definition: m.definition,
          partOfSpeech: m.partOfSpeech,
        })),
      })
        .then((enriched) => {
          if (seq !== enrichSeqRef.current) return; // stale
          if (enriched) {
            setResponse((prev) =>
              prev
                ? {
                    ...prev,
                    result: {
                      ...prev.result,
                      synonyms: enriched.synonyms ?? [],
                      antonyms: enriched.antonyms ?? [],
                      examples: enriched.examples ?? [],
                    },
                  }
                : prev,
            );
            // Pre-warm TTS cache for each example sentence (no playback).
            // Strip ** markers since TTS speaks the sentence as-is.
            for (const ex of enriched.examples ?? []) {
              const plain = (ex.sentence ?? '').replace(/\*\*/g, '').trim();
              if (plain) prefetchSpeak(plain, sLang);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (seq === enrichSeqRef.current) setEnriching(false);
        });
    },
    [],
  );

  useEffect(() => {
    if (!id) return;
    getBook(id).then(setBook);
  }, [id, premium]);

  // Autosearch when navigated here with ?q=... (e.g. tapped a synonym).
  // Runs once after the book loads so book/lang context is ready.
  const autosearchTriggeredRef = useRef(false);
  useEffect(() => {
    if (!book || !prefillQuery || autosearchTriggeredRef.current) return;
    autosearchTriggeredRef.current = true;
    setWord(prefillQuery);
    handleLookup(prefillQuery);
  }, [book, prefillQuery]);

  useEffect(() => {
    getImageExtractUsage().then(setOcrUsed).catch(() => {});
  }, [premium]);

  useEffect(() => {
    if (!isConnected) setToast(t('error.offline_message'));
  }, []);



  const isBidi = book?.bidirectional ?? false;
  const studyLang = book?.studyLang ?? book?.sourceLang ?? 'en';
  const nativeLang = studyLang === book?.sourceLang
    ? (book?.targetLang ?? 'ko')
    : (book?.sourceLang ?? 'ko');

  // For bidirectional: detect if input is in study language or native language
  const inputIsStudyLang = isBidi && word.trim()
    ? isStudyLangInput(word.trim(), studyLang)
    : true;

  // Always look up study language → native language definitions
  // When user types in native language, use sentence hint for reverse lookup
  const sourceLang = isBidi ? studyLang : (book?.sourceLang ?? 'en');
  const targetLang = isBidi ? nativeLang : (book?.targetLang ?? 'ko');

  // Typewriter placeholder animation — must be after studyLang is defined
  const [randomWord, setRandomWord] = useState(() => getPlaceholder(studyLang).word);
  useEffect(() => { setRandomWord(getPlaceholder(studyLang).word); }, [studyLang]);
  const prevWordRef = useRef(word);
  useEffect(() => {
    if (prevWordRef.current.length > 0 && word.length === 0) {
      setRandomWord(getPlaceholder(studyLang).word);
    }
    prevWordRef.current = word;
  }, [word]);
  const fullPlaceholder = book ? `${getExamplePrefix(i18n.language)} ${randomWord}` : '';
  const isExpr = isNumericOrExpression(word);
  const effectiveMax = isExpr ? MAX_EXPR_LENGTH : getLangLimit(sourceLang);
  const wordOverLimit = codepointLength(word.trim()) > effectiveMax;
  const wordEmpty = word.length === 0 && !hasSearched;

  useEffect(() => {
    if (!wordEmpty || !fullPlaceholder) return;
    let i = 0;
    setAnimatedPlaceholder('');
    const timer = setInterval(() => {
      i++;
      if (i <= fullPlaceholder.length) {
        setAnimatedPlaceholder(fullPlaceholder.slice(0, i));
      } else {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [fullPlaceholder, wordEmpty]);

  const handleLookup = async (overrideWord?: string) => {
    if (!isConnected) {
      setToast(t('error.offline_message'));
      return;
    }
    // Callers (e.g. OCR word tap) can pass a word directly to avoid React
    // state update/closure timing — setWord() is async so a bare handleLookup()
    // right after setWord() would read the previous value.
    const trimmed = (overrideWord ?? word).trim();
    if (!trimmed) {
      setToast(t('add_word.word_required'));
      return;
    }
    if (!book) return;

    const now = Date.now();
    if (now - lastSearchRef.current < SEARCH_COOLDOWN_MS) return;
    lastSearchRef.current = now;

    Keyboard.dismiss();

    if (!isValidScript(trimmed, sourceLang, targetLang)) {
      setError(t('add_word.wrong_script'));
      setHasSearched(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    setPartial(null);
    setSaved(false);
    setAlreadyExists(false);
    setSaving(false);
    setCandidates([]);

    setHasSearched(true);

    // Kick off IPA fetch in parallel with the AI lookup. For most lookups the
    // headword == user input so this prefetch saves the post-lookup round trip.
    // If the AI corrects spelling, we'll re-fetch with the corrected form below.
    const earlyIpaPromise: Promise<string | null> | null = ipaSupported(sourceLang)
      ? fetchIpa(trimmed, sourceLang)
      : null;

    // If input doesn't match source language, resolve headword via reverse lookup
    const isReverse = !isStudyLangInput(trimmed, sourceLang);
    let lookupWord = trimmed;
    let reverseHeadword: string | undefined;

    if (isReverse) {
      const { candidates: results, note, timedOut } = await resolveHeadword(trimmed, sourceLang, targetLang);
      if (timedOut) {
        setToast(t('error.slow_network'));
        setLoading(false);
        return;
      }
      if (results.length === 0) {
        setError(t(getNoteMessageKey(note)));
        setLoading(false);
        return;
      }
      if (results.length > 1) {
        setCandidates(results);
        setLoading(false);
        // Pre-warm every candidate's full pipeline (quick + enrich + TTS)
        // while the user picks. By the time they tap one, all caches are
        // populated and the next screen renders instantly.
        for (const c of results) {
          backgroundPrefetchCandidate(c.headword, sourceLang, targetLang, book.id);
        }
        return;
      }
      reverseHeadword = results[0].headword;
      lookupWord = results[0].headword;
    }

    // Normal lookup (identical to direct search)
    await lookupWordStream(
      {
        word: lookupWord,
        sourceLang,
        targetLang,
        bookId: book.id,
        mode: 'quick',
      },
      {
        onPartial: (p) => setPartial(p),
        onFinal: async (res) => {
          // Check if the word was actually found
          const meanings = res.result.meanings ?? [];
          if (meanings.length === 0) {
            setError(t(getNoteMessageKey(res.result.note)));
            setPartial(null);
            setLoading(false);
            return;
          }

          // Attach headword so UI shows the translated word
          const finalRes = reverseHeadword
            ? { ...res, result: { ...res.result, headword: reverseHeadword } }
            : res;
          const hw = finalRes.result.headword || lookupWord;
          const existing = await findWord({ word: hw, bookId: book.id });
          if (existing) {
            setAlreadyExists(true);
          }
          setResponse(finalRes);
          setPartial(null);
          setLoading(false);
          // Pre-warm TTS cache for the headword (no playback) so the user
          // gets instant audio when they tap the speaker.
          prefetchSpeak(getTtsText(hw, sourceLang, finalRes.result.reading), sourceLang);
          // Resolve IPA: prefer the early-fetched promise when the headword
          // matches the user's input (no AI typo correction). Otherwise fetch
          // fresh for the corrected headword.
          if (ipaSupported(sourceLang) && ipaApplicable(finalRes.result.meanings)) {
            // Case-sensitive comparison: German espeak voice can't recognize
            // lowercase nouns ("könig" → letter-spelling garbage) and falls
            // back to spelling mode. Even pure case-correction by the AI
            // (könig → König) means the early IPA fetch result is unusable;
            // we must re-fetch with the corrected case.
            const sameInput = hw.trim() === trimmed.trim();
            const ipaPromise = sameInput && earlyIpaPromise
              ? earlyIpaPromise
              : fetchIpa(hw, sourceLang);
            ipaPromise.then((ipa) => {
              if (ipa) {
                setResponse((prev) =>
                  prev ? { ...prev, result: { ...prev.result, ipa } } : prev,
                );
              }
            });
          }
          if (finalRes.source !== 'local') {
            startEnrich(finalRes, lookupWord, sourceLang, targetLang, book.id);
          }
        },
        onError: (err) => {
          const isTimeout = (err instanceof WordLookupError && err.code === 'timeout') || err.message === 'Timeout';
          if (isTimeout) {
            setToast(t('error.slow_network'));
            setLoading(false);
            return;
          }
          const raw = err instanceof WordLookupError
            ? (err.message || err.code)
            : (err.message || 'Lookup failed');
          // Server may return "PHRASE_TOO_LONG:30" — strip the parameter.
          const errCode = raw.split(':')[0];
          const key = `add_word.error_${errCode}`;
          const translated = t(key);
          const msg = translated !== key ? translated : raw;
          setError(msg);
          setLoading(false);
        },
      },
    );
  };

  const maybeCelebrateStreak = () => {
    // Check streak after a save in case the user crossed today's threshold
    // (5+ adds qualifies as today's activity). Fires modal at most once per
    // streak day; subsequent saves are no-ops thanks to AsyncStorage flags.
    getStreak()
      .then(async (s) => {
        if (!s.todayDone || s.current <= 0) return;
        if (await shouldCelebrate(s.current)) {
          DeviceEventEmitter.emit(CELEBRATE_EVENT, {
            type: 'milestone',
            streak: s.current,
            variant: 0,
          });
          return;
        }
        const todayDate = getTodayStreakDate();
        if (await shouldCelebrateDaily(todayDate)) {
          DeviceEventEmitter.emit(CELEBRATE_EVENT, {
            type: 'daily',
            streak: s.current,
            variant: getDailyVariant(todayDate),
          });
        }
      })
      .catch(() => {});
  };

  const handleSave = async () => {
    const trimmed = word.trim();
    if (!trimmed || saving || !response || !book) return;

    setSaving(true);
    try {
      const wordId = genId();
      const savedWord = response.result.headword || trimmed;
      await saveWord({
        id: wordId,
        bookId: book.id,
        word: savedWord,
        result: response.result,
      });
      // Promote the cached TTS mp3s (both genders) to persistent storage so
      // playback works offline and survives system cache eviction. Headword
      // + every example sentence (with ** markers stripped, matching what
      // prefetchSpeak fed into the cache).
      try {
        const ttsText = getTtsText(savedWord, sourceLang, response.result.reading);
        promoteToPersistent(ttsText, sourceLang);
        for (const ex of response.result.examples ?? []) {
          const plain = ex.sentence?.replace(/\*\*/g, '').trim();
          if (plain) promoteToPersistent(plain, sourceLang);
        }
      } catch (err) {
        console.warn('promote tts cache failed:', err);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setSaved(true);
      // Keep saving=true through the collapse animation so the button content
      // (spinner) doesn't visually swap mid-animation. Reset happens when the
      // next search clears state.
      maybeCelebrateStreak();
      const NUDGE_KEY = 'typeword.signupNudgeShown';
      const alreadyNudged = await AsyncStorage.getItem(NUDGE_KEY);
      if (!alreadyNudged) {
        const [count, anon] = await Promise.all([getTotalWordCount(), isAnonymous()]);
        if (count >= 20 && anon) {
          await AsyncStorage.setItem(NUDGE_KEY, '1');
          setShowSignupNudge(true);
        }
      }
    } catch {
      setError(t('error.title'));
      setSaving(false);
    }
  };

  const handleCandidateSelect = async (candidate: HeadwordCandidate) => {
    setCandidates([]);
    if (!book) return;
    setLoading(true);
    setHasSearched(true);

    const lookupWord = candidate.headword;
    const reverseHeadword = lookupWord;

    await lookupWordStream(
      { word: lookupWord, sourceLang, targetLang, bookId: book.id, mode: 'quick' },
      {
        onPartial: (p) => setPartial(p),
        onFinal: async (res) => {
          const meanings = res.result.meanings ?? [];
          if (meanings.length === 0) {
            setError(t(getNoteMessageKey(res.result.note)));
            setPartial(null);
            setLoading(false);
            return;
          }
          const finalRes = { ...res, result: { ...res.result, headword: reverseHeadword } };
          const hw = finalRes.result.headword || lookupWord;
          const existing = await findWord({ word: hw, bookId: book.id });
          if (existing) setAlreadyExists(true);
          setResponse(finalRes);
          setPartial(null);
          setLoading(false);
          // Pre-warm TTS cache for the headword (no playback) so the user
          // gets instant audio when they tap the speaker.
          prefetchSpeak(getTtsText(hw, sourceLang, finalRes.result.reading), sourceLang);
          // Fetch IPA in parallel (European languages, non-expression POS only).
          if (ipaSupported(sourceLang) && ipaApplicable(finalRes.result.meanings)) {
            fetchIpa(hw, sourceLang).then((ipa) => {
              if (ipa) {
                setResponse((prev) =>
                  prev ? { ...prev, result: { ...prev.result, ipa } } : prev,
                );
              }
            });
          }
          if (finalRes.source !== 'local') {
            startEnrich(finalRes, lookupWord, sourceLang, targetLang, book.id);
          }
        },
        onError: (err) => {
          const isTimeout = (err instanceof WordLookupError && err.code === 'timeout') || err.message === 'Timeout';
          if (isTimeout) {
            setToast(t('error.slow_network'));
            setLoading(false);
            return;
          }
          const raw = err instanceof WordLookupError
            ? (err.message || err.code)
            : (err.message || 'Lookup failed');
          const errCode = raw.split(':')[0];
          const key = `add_word.error_${errCode}`;
          const translated = t(key);
          setError(translated !== key ? translated : raw);
          setLoading(false);
        },
      },
    );
  };

  // Auto-clear when focusing input after a search
  const handleInputFocus = () => {
    if (hasSearched && response) {
      enrichSeqRef.current++;
      setWord('');
      setResponse(null);
      setPartial(null);
      setError(null);
      setSaved(false);
      setAlreadyExists(false);
      setSaving(false);
      setHasSearched(false);
      setEnriching(false);
      setCandidates([]);
      setRandomWord(getPlaceholder(studyLang).word);
    }
  };

  const pickAndExtract = async (source: 'camera' | 'gallery') => {
    if (!book || !isConnected) {
      if (!isConnected) setToast(t('error.offline_message'));
      return;
    }

    setCropModalVisible(true);

    try {
      const { default: pickImage } = await import('@src/utils/imagePick');
      const result = await pickImage(source);
      if (!result) {
        setCropModalVisible(false);
        return;
      }
      setCropImage(result);
    } catch (err) {
      setCropModalVisible(false);
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'CAMERA_PERMISSION_DENIED') {
        setCameraDeniedModal(true);
      } else if (msg === 'NATIVE_UNAVAILABLE') {
        setToast(t('add_word.ocr_dev_build_required'));
      }
    }
  };

  const handleCropConfirm = async (crop: { originX: number; originY: number; width: number; height: number }) => {
    setCropModalVisible(false);
    if (!cropImage) return;

    setOcrLoading(true);
    setOcrModalVisible(true);
    setOcrWords([]);
    setOcrSelected(new Set());

    try {
      const { cropAndEncode } = await import('@src/utils/imagePick');
      const base64 = await cropAndEncode(cropImage.uri, crop);
      if (!base64) throw new Error('Crop failed');

      const extracted = await extractWordsFromImage(base64, sourceLang, targetLang);

      setOcrUsed((prev) => (prev ?? 0) + 1);
      setOcrWords(extracted.words);
      const all = new Set(extracted.words.map((_, i) => i));
      setOcrSelected(all);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'IMAGE_LIMIT_REACHED') {
        setToast(t('add_word.ocr_limit_reached'));
      } else if (msg === 'NO_WORDS_FOUND') {
        setToast(t('add_word.ocr_no_words'));
      } else if (msg === 'RATE_LIMIT') {
        setToast(t('add_word.error_RATE_LIMIT_MINUTE'));
      } else if (msg === 'BUDGET_EXHAUSTED') {
        setToast(t('add_word.error_BUDGET_EXHAUSTED'));
      } else if (msg === 'NATIVE_UNAVAILABLE') {
        setToast(t('add_word.ocr_dev_build_required'));
      } else if (msg === 'SLOW_NETWORK') {
        setToast(t('error.slow_network'));
      } else {
        setToast(t('add_word.ocr_no_words'));
      }
      setOcrModalVisible(false);
    } finally {
      setOcrLoading(false);
      setCropImage(null);
    }
  };

  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const cameraTranslateY = useSharedValue(0);

  // Save-button collapse animation: 1 = shown at full size, 0 = collapsed.
  // Appearing after lookup is instant; disappearing after save is animated.
  const saveBtnAnim = useSharedValue(0);
  const showSaveBtn = !!response && !saved && !alreadyExists;
  useEffect(() => {
    if (showSaveBtn) {
      saveBtnAnim.value = 1;
    } else {
      saveBtnAnim.value = withTiming(0, { duration: 1000 });
    }
  }, [showSaveBtn]);
  const saveBtnStyle = useAnimatedStyle(() => ({
    opacity: saveBtnAnim.value,
    maxHeight: saveBtnAnim.value * 80,
    marginTop: saveBtnAnim.value * 12,
    overflow: 'hidden',
  }));
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (cameraModalVisible) {
      cameraTranslateY.value = 1000;
      requestAnimationFrame(() => {
        cameraTranslateY.value = withTiming(0, { duration: 300 });
      });
    }
  }, [cameraModalVisible]);

  const hideCameraSheet = useCallback(() => {
    setCameraModalVisible(false);
  }, []);

  const dismissCameraSheet = useCallback(() => {
    cameraTranslateY.value = withTiming(1000, { duration: 250 }, () => {
      runOnJS(hideCameraSheet)();
    });
  }, [hideCameraSheet]);

  const cameraPanGesture = useMemo(() =>
    Gesture.Pan()
      .onUpdate((e) => {
        if (e.translationY > 0) cameraTranslateY.value = e.translationY;
      })
      .onEnd((e) => {
        if (e.translationY > 150 || e.velocityY > 800) {
          cameraTranslateY.value = withTiming(1000, { duration: 200 }, () => {
            runOnJS(hideCameraSheet)();
          });
        } else {
          cameraTranslateY.value = withTiming(0, { duration: 250 });
        }
      }),
    [hideCameraSheet],
  );

  const cameraSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cameraTranslateY.value }],
  }));

  const ocrLimit = premium ? IMAGE_LIMIT_PREMIUM : IMAGE_LIMIT_FREE;
  const ocrRemaining = Math.max(ocrLimit - ocrUsed, 0);

  const handleCameraPress = () => {
    if (ocrRemaining <= 0) {
      setToast(t('add_word.ocr_limit_reached'));
      return;
    }
    setCameraModalVisible(true);
  };

  const handlePickSource = (source: 'camera' | 'gallery') => {
    setCameraModalVisible(false);
    pickAndExtract(source);
  };

  const handleOcrWordTap = (w: ExtractedWord) => {
    setOcrModalVisible(false);
    setWord(w.word);
    setResponse(null);
    setPartial(null);
    setError(null);
    setSaved(false);
    setAlreadyExists(false);
    setSaving(false);
    setHasSearched(false);
    // Trigger lookup immediately with the picked word (overriding the
    // not-yet-committed `word` state from setWord above).
    handleLookup(w.word);
  };

  const handleMicPress = async () => {
    if (listening) {
      try {
        const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
        ExpoSpeechRecognitionModule.stop();
      } catch {}
      setListening(false);
      return;
    }

    try {
      const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setMicDeniedModal(true);
        return;
      }

      setResponse(null);
      setPartial(null);
      setError(null);
      setSaved(false);
      setAlreadyExists(false);
      setHasSearched(false);
      setWord('');
      setListening(true);
      Keyboard.dismiss();

      ExpoSpeechRecognitionModule.start({
        lang: getSttLocale(sourceLang),
        interimResults: true,
      });
    } catch {
      setToast(t('add_word.stt_dev_build_required'));
    }
  };

  useEffect(() => {
    try {
      const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
      const resultSub = ExpoSpeechRecognitionModule.addListener(
        'result',
        (event: { results: { transcript: string; isFinal?: boolean }[] }) => {
          const transcript = event.results[0]?.transcript ?? '';
          const limit = getLangLimit(sourceLang);
          // STT can produce CJK code points beyond ASCII — slice by code points.
          let n = 0;
          let trimmed = '';
          for (const ch of transcript) {
            if (n >= limit) break;
            trimmed += ch;
            n++;
          }
          setWord(trimmed.toLowerCase());
          if (event.results[0]?.isFinal) setListening(false);
        },
      );
      const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
        setListening(false);
      });
      const errorSub = ExpoSpeechRecognitionModule.addListener('error', () => {
        setListening(false);
      });
      return () => {
        resultSub.remove();
        endSub.remove();
        errorSub.remove();
      };
    } catch {
      // native module not available
    }
  }, [sourceLang]);

  const src = findLanguage(sourceLang);
  const tgt = findLanguage(targetLang);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Fixed top: input area ── */}
        <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
          <View className="flex-row items-center">
            <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')} accessibilityRole="button">
              <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
            </Pressable>
            <Text className="text-3xl font-bold text-black dark:text-white">
              {t('add_word.title')}
            </Text>
          </View>

          <View className="mt-1 flex-row items-center justify-between">
            <View className="mr-3 flex-1">
              {book ? (
                <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
                  {book.title}
                </Text>
              ) : null}
              <Text className="mt-0.5 text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
                {src?.flag} {t(`languages.${src?.code}`)} → {tgt?.flag} {t(`languages.${tgt?.code}`)}
              </Text>
            </View>
            <View className="shrink-0 flex-row items-start gap-3">
              <View className="items-center">
                <View className="rounded-full bg-gray-100 p-2.5 dark:bg-gray-800">
                  <VoiceToggle iconSize={22} iconColor="#2EC4A5" />
                </View>
              </View>
              <View className="items-center">
                <Pressable onPress={handleMicPress} className={`rounded-full p-2.5 ${listening ? 'bg-red-100 dark:bg-red-900' : 'bg-gray-100 dark:bg-gray-800'}`} accessibilityLabel={t('add_word.voice_search')} accessibilityRole="button">
                  <MaterialIcons name={listening ? 'stop' : 'mic'} size={22} color={listening ? '#ef4444' : '#2EC4A5'} />
                </Pressable>
              </View>
              <View className="items-center">
                <Pressable onPress={handleCameraPress} className="rounded-full bg-gray-100 p-2.5 dark:bg-gray-800" accessibilityLabel={t('common.camera')} accessibilityRole="button">
                  <MaterialIcons name="photo-camera" size={22} color="#2EC4A5" />
                </Pressable>
                <Text className="mt-1 text-center text-xs text-gray-400">
                  {ocrRemaining}/{ocrLimit}
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-6">
            <View className="flex-row items-center">
              <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t('add_word.word')}
              </Text>
              {listening ? (
                <Text className="ml-2 text-xs text-red-500">{t('add_word.listening')}</Text>
              ) : isBidi && word.trim() ? (
                <Text className="ml-2 text-xs text-gray-400">
                  {inputIsStudyLang
                    ? `${findLanguage(studyLang)?.flag} → ${findLanguage(nativeLang)?.flag}`
                    : `${findLanguage(nativeLang)?.flag} → ${findLanguage(studyLang)?.flag} (${t('add_word.reverse')})`
                  }
                </Text>
              ) : null}
            </View>
            <TextInput
              value={word}
              onChangeText={setWord}
              onFocus={handleInputFocus}
              onSubmitEditing={() => handleLookup()}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={effectiveMax}
              placeholder={animatedPlaceholder}
              placeholderTextColor="#9ca3af"
              className="mt-2 rounded-xl px-4 py-3 text-base text-black dark:text-white"
              style={{ borderWidth: 2, borderColor: listening ? '#ef4444' : '#2EC4A5' }}
            />
            {(() => {
              const wlen = codepointLength(word);
              if (wlen < effectiveMax - (isExpr ? 2 : 8)) return null;
              return (
                <Text className={`mt-1 text-right text-xs ${wlen > effectiveMax ? 'text-red-500' : 'text-gray-400'}`}>
                  {wlen}/{effectiveMax}
                </Text>
              );
            })()}
          </View>

          <View className="mt-6" style={{ position: 'relative' }}>
            <Pressable
              onPress={() => handleLookup()}
              disabled={loading || !book || wordOverLimit}
              className={`items-center rounded-xl py-4 ${
                loading || !word.trim() || !book || wordOverLimit
                  ? 'bg-gray-300'
                  : 'bg-black dark:bg-white'
              }`}
            >
              {loading && !partial ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-base font-semibold text-white dark:text-black">
                  {t('add_word.search')}
                </Text>
              )}
            </Pressable>

            {(!!error || !!toast || (response && (saved || alreadyExists))) && (
              <View
                pointerEvents="box-none"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' }}
              >
                <Toast visible={!!error} message={error ?? ''} onHide={() => setError(null)} />
                <Toast visible={!!toast} message={toast} onHide={() => setToast('')} />
                <Toast visible={!!(response && saved)} message={t('add_word.saved')} type="success" />
                <Toast visible={!!(response && alreadyExists)} message={t('add_word.already_exists')} />
              </View>
            )}
          </View>

          {/* Stacked save button — animated collapse on save */}
          <Animated.View style={saveBtnStyle} pointerEvents={showSaveBtn ? 'auto' : 'none'}>
            <Pressable
              onPress={handleSave}
              disabled={saving || !showSaveBtn}
              className="items-center rounded-xl py-4 bg-[#2EC4A5]"
            >
              <Text className="text-base font-semibold text-white">
                {t('add_word.save')}
              </Text>
            </Pressable>
          </Animated.View>

        </View>

        {/* ── Scrollable middle: results ── */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {candidates.length > 0 ? (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-black dark:text-white">
                {t('add_word.which_meaning')}
              </Text>
              {candidates.map((c, i) => (
                <Pressable
                  key={i}
                  onPress={() => handleCandidateSelect(c)}
                  className="mt-2 flex-row items-center rounded-xl border border-gray-300 p-4 dark:border-gray-700"
                >
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-black dark:text-white">
                      {c.headword}
                    </Text>
                    {c.hint ? (
                      <Text className="mt-0.5 text-sm text-gray-500">{c.hint}</Text>
                    ) : null}
                  </View>
                  <MaterialIcons name="arrow-forward" size={18} color="#9ca3af" />
                </Pressable>
              ))}
            </View>
          ) : null}

          {partial && !response ? <PartialCard partial={partial} t={t} /> : null}

          {response ? (
            <ResultCard
              response={response}
              word={word.trim()}
              sourceLang={sourceLang}
              t={t}
              onReport={() => setShowReport(true)}
            />
          ) : null}
        </ScrollView>

      </KeyboardAvoidingView>
      <AdBanner />

      <Paywall visible={paywallVisible} onClose={() => setPaywallVisible(false)} />

      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        word={word.trim()}
        context="search"
        onSubmitted={(msg) => setReportToast(msg)}
      />
      <Toast visible={!!reportToast} message={reportToast} type="success" onHide={() => setReportToast('')} style={{ position: 'absolute', bottom: 132, left: 0, right: 0 }} />

      <ImageCropModal
        visible={cropModalVisible}
        imageUri={cropImage?.uri ?? ''}
        imageWidth={cropImage?.width ?? 1}
        imageHeight={cropImage?.height ?? 1}
        onConfirm={handleCropConfirm}
        onCancel={() => { setCropModalVisible(false); setCropImage(null); }}
      />

      <Modal visible={ocrModalVisible} transparent animationType="fade" onRequestClose={() => !ocrLoading && setOcrModalVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="max-h-[80%] w-full rounded-2xl bg-white p-5 dark:bg-gray-900">
            {ocrLoading ? (
              <View className="items-center py-12">
                <ActivityIndicator size="large" color="#2EC4A5" />
                <Text className="mt-4 text-sm text-gray-500">
                  {t('add_word.ocr_extracting')}
                </Text>
              </View>
            ) : (
              <>
                <Text className="mb-1 text-lg font-bold text-black dark:text-white">
                  {t('add_word.ocr_select_words')}
                </Text>
                <Text className="mb-4 text-xs text-gray-400">
                  {ocrWords.length} {t('add_word.meanings').toLowerCase()}
                </Text>
                <ScrollView style={{ maxHeight: 400 }}>
                  {ocrWords.map((w, i) => (
                    <Pressable
                      key={i}
                      onPress={() => handleOcrWordTap(w)}
                      className="mb-2 flex-row items-center rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className="font-semibold text-black dark:text-white">{w.word}</Text>
                          {w.reading ? (
                            <Text className="ml-2 text-xs text-gray-400">{w.reading}</Text>
                          ) : null}
                        </View>
                        <Text className="mt-0.5 text-sm text-gray-500">{w.definition}</Text>
                      </View>
                      <MaterialIcons name="arrow-forward" size={18} color="#9ca3af" />
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  onPress={() => setOcrModalVisible(false)}
                  className="mt-4 items-center rounded-xl border border-gray-300 py-3 dark:border-gray-700"
                >
                  <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={cameraModalVisible} transparent animationType="none" onRequestClose={dismissCameraSheet} statusBarTranslucent>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Pressable
            onPress={dismissCameraSheet}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          >
            <GestureDetector gesture={cameraPanGesture}>
              <Animated.View
                style={[
                  {
                    backgroundColor: dark ? '#1a1a2e' : '#fff',
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    paddingHorizontal: 24,
                    paddingTop: 16,
                    paddingBottom: Math.max(insets.bottom, 16) + 16,
                  },
                  cameraSheetStyle,
                ]}
              >
                <Pressable onPress={() => {}}>
                  <View className="mb-5 items-center">
                    <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
                  </View>

                  <View className="flex-row justify-center gap-10">
                    <Pressable onPress={() => handlePickSource('camera')} className="items-center">
                      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                        <MaterialIcons name="photo-camera" size={28} color="#2EC4A5" />
                      </View>
                      <Text className="mt-2 text-sm text-black dark:text-white">{t('common.camera')}</Text>
                    </Pressable>
                    <Pressable onPress={() => handlePickSource('gallery')} className="items-center">
                      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                        <MaterialIcons name="photo-library" size={28} color="#2EC4A5" />
                      </View>
                      <Text className="mt-2 text-sm text-black dark:text-white">{t('common.gallery')}</Text>
                    </Pressable>
                  </View>

                  <View className="mt-6 items-center">
                    <Text className="text-xs text-gray-400">
                      {ocrRemaining}/{ocrLimit}
                    </Text>
                    <Text className="mt-2 text-center text-sm text-gray-500">
                      {t('add_word.ocr_hint')}
                    </Text>
                    <Text className="mt-1 text-center text-xs text-gray-400">
                      {t('add_word.ocr_ai_disclaimer')}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            </GestureDetector>
          </Pressable>
        </GestureHandlerRootView>
      </Modal>

      <AppModal
        visible={cameraDeniedModal}
        title={t('inquiry.permission_title')}
        message={t('add_word.camera_denied')}
        buttonText={t('common.close')}
        confirmText={t('settings.open_settings')}
        onConfirm={() => {
          setCameraDeniedModal(false);
          Linking.openSettings();
        }}
        onClose={() => setCameraDeniedModal(false)}
      />

      <AppModal
        visible={micDeniedModal}
        title={t('inquiry.permission_title')}
        message={t('add_word.mic_denied')}
        buttonText={t('common.close')}
        confirmText={t('settings.open_settings')}
        onConfirm={() => {
          setMicDeniedModal(false);
          Linking.openSettings();
        }}
        onClose={() => setMicDeniedModal(false)}
      />

      <Modal visible={showSignupNudge} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50 px-8">
          <View className="w-full rounded-2xl bg-white p-6 dark:bg-gray-900">
            <View className="items-center">
              <View className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
                <MaterialIcons name="cloud-upload" size={32} color="#3b82f6" />
              </View>
              <Text className="mt-4 text-center text-lg font-bold text-black dark:text-white">
                {t('signup_nudge.title')}
              </Text>
              <Text className="mt-2 text-center text-sm text-gray-500">
                {t('signup_nudge.description')}
              </Text>
            </View>
            <View className="mt-6 gap-3">
              <Pressable
                onPress={() => {
                  setShowSignupNudge(false);
                  router.push('/auth');
                }}
                className="items-center rounded-xl py-4"
                style={{ backgroundColor: '#2EC4A5' }}
              >
                <Text className="text-base font-semibold text-white">
                  {t('signup_nudge.signup')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowSignupNudge(false)}
                className="items-center py-3"
              >
                <Text className="text-sm text-gray-400">
                  {t('signup_nudge.later')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function hasEnriched(res: WordLookupResponse): boolean {
  const r = res.result;
  return !!(r.examples?.length || r.synonyms?.length || r.antonyms?.length);
}

type TFn = (key: string) => string;

function formatReading(reading?: string | string[]): string | undefined {
  if (!reading) return undefined;
  return Array.isArray(reading) ? reading.join(' / ') : reading;
}

function PartialCard({ partial, t }: { partial: PartialLookup; t: TFn }) {
  const { i18n } = useTranslation();
  const readingText = formatReading(partial.reading);
  return (
    <View className="mt-6">
      <View className="flex-row items-center">
        <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('add_word.generating')}
        </Text>
        <ActivityIndicator size="small" className="ml-2" />
      </View>

      {readingText ? (
        <Text className="mt-2 text-sm text-gray-400">{readingText}</Text>
      ) : null}

      {partial.meanings.length > 0 ? (
        <View className="mt-4">
          <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('add_word.meanings')}
          </Text>
          {partial.meanings.map((m, i) => (
            <View
              key={i}
              className="mt-2 rounded-xl border border-gray-300 p-3 dark:border-gray-800"
            >
              {m.partOfSpeech ? (
                <Text className="text-xs text-gray-500">{formatPOS(m.partOfSpeech, m.gender, i18n.language)}</Text>
              ) : null}
              <Text className="mt-1 text-base text-black dark:text-white">
                {m.definition}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ResultCard({
  response,
  word,
  sourceLang,
  t,
  onReport,
}: {
  response: WordLookupResponse;
  word: string;
  sourceLang: string;
  t: TFn;
  onReport?: () => void;
}) {
  const { i18n } = useTranslation();
  const { result } = response;
  const displayWord = result.headword || word;

  // Show "did you mean" only if the AI corrected to something different
  // from what THIS user typed. Compare against `word` (current input), not
  // result.originalInput — cache can serve a result whose originalInput came
  // from a previous user's typo lookup.
  // Skip for multi-token inputs (phrases/idioms/proverbs): the canonical form
  // is already shown prominently as the headword, so the hint is redundant
  // and adds visual noise.
  const userTyped = word.trim().toLowerCase();
  const corrected = result.correctedHeadword?.trim();
  const isMultiTokenInput = /\s/.test(userTyped);
  const showCorrection = !!corrected
    && corrected.toLowerCase() !== userTyped
    && userTyped.length > 0
    && !isMultiTokenInput;

  // Surface a soft warning when the AI is uncertain (40-69 = borderline).
  // <40 should never reach this card (handled as error upstream).
  const lowConfidence =
    typeof result.confidence === 'number' && result.confidence < 70;

  const handleSpeak = () => {
    speakWord(getTtsText(displayWord, sourceLang, result.reading), sourceLang);
  };

  return (
    <View className="mt-4">
      {showCorrection ? (
        <View className="mb-3 flex-row items-center rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950">
          <MaterialIcons name="auto-fix-high" size={16} color="#d97706" />
          <Text className="ml-2 flex-1 text-xs text-amber-800 dark:text-amber-200">
            {t('add_word.did_you_mean').replace('{{word}}', corrected!)}
          </Text>
        </View>
      ) : null}

      {/* Header — speaker and flag are grouped on the right so they always
          travel together. When the word fits on one line, all three render in
          a single row; when the word wraps to multiple lines, the icon group
          stays as a unit aligned to the top of the headword block. */}
      <View className="flex-row items-start">
        <Text className="shrink flex-1 text-xl font-bold text-black dark:text-white">
          {displayWord}
        </Text>
        <View className="shrink-0 ml-2 flex-row items-center">
          <Pressable
            onPress={handleSpeak}
            className="rounded-full bg-gray-100 p-2 dark:bg-gray-800"
          >
            <MaterialIcons name="volume-up" size={20} color="#10b981" />
          </Pressable>
          {onReport ? (
            <Pressable onPress={onReport} className="ml-2 rounded-full bg-gray-100 p-2 dark:bg-gray-800">
              <MaterialIcons name="flag" size={18} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
      </View>
      {result.reading ? (
        <ReadingDisplay reading={result.reading} sourceLang={sourceLang} word={displayWord} />
      ) : null}
      {result.ipa ? (
        <Text className="mt-1 text-sm text-gray-400">{result.ipa}</Text>
      ) : null}

      {lowConfidence ? (
        <View className="mt-2 flex-row items-center">
          <MaterialIcons name="info-outline" size={14} color="#9ca3af" />
          <Text className="ml-1 text-xs text-gray-500">
            {t('add_word.low_confidence_warning')}
          </Text>
        </View>
      ) : null}

      <View className="mt-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('add_word.meanings')}
        </Text>
        {result.meanings?.length ? (
          result.meanings.map((m, i) => (
            <View
              key={i}
              className="mt-2 rounded-xl border border-gray-300 p-3 dark:border-gray-800"
            >
              <Text className="text-xs text-gray-500">{formatPOS(m.partOfSpeech, m.gender, i18n.language)}</Text>
              <Text className="mt-1 text-base text-black dark:text-white">
                {m.definition}
              </Text>
            </View>
          ))
        ) : (
          <Text className="mt-2 text-sm text-gray-400">—</Text>
        )}
      </View>
    </View>
  );
}
