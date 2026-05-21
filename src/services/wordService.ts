/**
 * Orchestrates a word lookup:
 *   1. Local SQLite — return immediately if already saved
 *   2. Edge Function `word-lookup` (→ global cache → OpenAI)
 *   3. Free Dictionary fallback (English only, when server errors or budget)
 *
 * Mode:
 *   - "quick" (default): meanings only — used for the search screen
 *   - "enrich": full result incl. examples/synonyms/antonyms — used on save
 */
import { supabase } from '@src/api/supabase';
import { fetchFromFallbackDictionary } from '@src/api/fallbackDictionary';
import {
  extractPartialLookup,
  streamWordLookup,
  type PartialLookup,
} from '@src/api/streamLookup';
import { lookupV2, lookupV2Stream, LookupV2Error } from '@src/api/lookupV2';
import { USE_V2_LOOKUP, V2_SUPPORTS_TRANSLATE_MODE } from '@src/config/lookupVersion';
import { findWord, saveWord, updateWordResult, applyCacheUpdate } from '@src/db/queries';
import type { WordLookupMode, WordLookupRequest, WordLookupResult } from '@src/types/word';
import { normalizeResult } from '@src/utils/normalizeResult';
import { isTimeoutError, withTimeout } from '@src/utils/timeout';

const REQUEST_TIMEOUT_MS = 15000;

export type WordLookupSource = 'local' | 'server_cache' | 'openai' | 'fallback';

export interface WordLookupResponse {
  result: WordLookupResult;
  source: WordLookupSource;
}

function hasEnrichedFields(r: WordLookupResult): boolean {
  return !!(r.examples?.length || r.synonyms?.length || r.antonyms?.length);
}

export class WordLookupError extends Error {
  code: 'rate_limited' | 'budget_exhausted' | 'unauthorized' | 'server_error' | 'unavailable' | 'timeout';
  constructor(
    message: string,
    code: WordLookupError['code'] = 'server_error',
  ) {
    super(message);
    this.code = code;
  }
}

export interface HeadwordCandidate {
  headword: string;
  hint: string;
}

export interface ResolveHeadwordResult {
  candidates: HeadwordCandidate[];
  note?: 'sentence' | 'non_word' | 'wrong_language';
  timedOut?: boolean;
}

/**
 * Resolve a reverse lookup: translate a native-language word to the study language.
 * Returns candidates for disambiguation (e.g. "은행" → [{headword:"bank"}, {headword:"ginkgo"}]),
 * or an empty list with a `note` when the input is out of scope (sentence / non-word / wrong language).
 */
async function resolveHeadwordOnce(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<ResolveHeadwordResult> {
  // Reverse lookup endpoint: v2 (since 2026-05-14) or v1 (legacy).
  const endpoint = V2_SUPPORTS_TRANSLATE_MODE ? 'word-lookup-v2' : 'word-lookup';
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke<{
        result: { candidates?: HeadwordCandidate[]; headword?: string; note?: string };
      }>(endpoint, {
        body: {
          word,
          sourceLang,
          targetLang,
          translate: true,
        },
      }),
      REQUEST_TIMEOUT_MS,
    );
    if (error) {
      console.warn('resolveHeadword error:', error);
      return { candidates: [] };
    }
    const r = data?.result;
    const note = r?.note;
    const validNote = note === 'sentence' || note === 'non_word' || note === 'wrong_language' ? note : undefined;
    if (r?.candidates?.length) {
      return { candidates: r.candidates.filter((c) => c.headword), note: validNote };
    }
    if (r?.headword) {
      return { candidates: [{ headword: r.headword, hint: '' }], note: validNote };
    }
    return { candidates: [], note: validNote };
  } catch (err) {
    if (isTimeoutError(err)) {
      return { candidates: [], timedOut: true };
    }
    console.warn('resolveHeadword exception:', err);
    return { candidates: [] };
  }
}

/**
 * Reverse-lookup translation with one automatic retry on empty result.
 * Cold-start variability of the OpenAI translate prompt occasionally returns
 * `candidates=[]` for valid words on the first call (the second succeeds via
 * prompt cache + warm function). Retry only when the empty result lacks a
 * definitive note ('sentence' / 'wrong_language' / 'non_word' = real refusals).
 */
export async function resolveHeadword(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<ResolveHeadwordResult> {
  const first = await resolveHeadwordOnce(word, sourceLang, targetLang);
  if (first.candidates.length > 0) return first;
  if (first.timedOut) return first;
  // Hard refusals — don't waste a retry; the AI knows what it's doing.
  if (first.note === 'sentence' || first.note === 'wrong_language') return first;
  // 'non_word' or no note + zero candidates: likely cold-start variability.
  // Single short retry (~700ms backoff) usually succeeds via prompt cache.
  await new Promise((r) => setTimeout(r, 700));
  const second = await resolveHeadwordOnce(word, sourceLang, targetLang);
  if (second.candidates.length > 0) return second;
  return first; // preserve original note for the error message
}

export function genId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const h = '0123456789abcdef';
  let u = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) u += '-';
    else if (i === 14) u += '4';
    else if (i === 19) u += h[(Math.random() * 4 | 0) + 8];
    else u += h[Math.random() * 16 | 0];
  }
  return u;
}

/**
 * Fetch enrichment data (examples/synonyms/antonyms) from the edge function.
 * Returns the supplementary fields, or null on failure.
 * If the word is already saved locally, also merges and persists the result.
 */
export async function enrichWord(
  req: WordLookupRequest & { meanings?: { definition: string; partOfSpeech: string }[] },
): Promise<Pick<WordLookupResult, 'synonyms' | 'antonyms' | 'examples'> | null> {
  try {
    const { meanings, ...rest } = req;
    let resultData: Pick<WordLookupResult, 'synonyms' | 'antonyms' | 'examples'> | undefined;
    if (USE_V2_LOOKUP) {
      const v2 = await lookupV2({ ...rest, mode: 'enrich' });
      resultData = v2.result;
    } else {
      const { data } = await withTimeout(
        supabase.functions.invoke<{
          result: Pick<WordLookupResult, 'synonyms' | 'antonyms' | 'examples'>;
        }>('word-lookup', {
          body: { ...rest, mode: 'enrich', ...(meanings?.length ? { meanings } : {}) },
        }),
        REQUEST_TIMEOUT_MS,
      );
      resultData = data?.result;
    }
    if (!resultData) return null;
    const data = { result: resultData };

    // If already saved locally, merge enrichment into the stored result
    const existing = await findWord({ word: req.word.trim(), bookId: req.bookId ?? null });
    if (existing) {
      const merged: WordLookupResult = {
        ...existing.result,
        synonyms: data.result.synonyms ?? [],
        antonyms: data.result.antonyms ?? [],
        examples: data.result.examples ?? [],
      };
      await updateWordResult(existing.id, merged);
    }

    return data.result;
  } catch {
    return null;
  }
}

/**
 * Streaming variant — used for the search screen's quick lookup so the user
 * sees the definition appearing live instead of waiting ~2s for a blank screen.
 * Falls through to the non-streaming flow on local cache hit.
 */
export async function lookupWordStream(
  req: WordLookupRequest,
  handlers: {
    onPartial?: (partial: PartialLookup) => void;
    onFinal: (res: WordLookupResponse) => void;
    onError: (err: Error) => void;
  },
): Promise<void> {
  const local = await findWord({
    word: req.word.trim(),
    bookId: req.bookId ?? null,
  });
  if (local) {
    handlers.onFinal({ result: local.result, source: 'local' });
    return;
  }

  // Cold-start variability: gpt-4.1-mini occasionally returns
  // `meanings=[]` + `note='non_word'` for valid short CJK inputs (e.g.
  // 学校) on the first call, then succeeds on retry via the prompt cache.
  // Same pattern as resolveHeadword's retry. Only retry on non_word /
  // missing-note empties — 'sentence' / 'wrong_language' are real refusals
  // and retrying wouldn't change the answer.
  // Explicit type so the union of {lookupV2Stream, streamWordLookup}
  // narrows cleanly — both have identical signatures but TS struggles
  // with the union otherwise.
  const streamer: typeof streamWordLookup =
    USE_V2_LOOKUP ? (lookupV2Stream as typeof streamWordLookup) : streamWordLookup;

  const runOnce = (
    onPartial: (partial: PartialLookup) => void,
    onResult: (res: WordLookupResponse) => void,
    onError: (err: Error) => void,
  ) => streamer(
    { ...req, mode: req.mode ?? 'quick' },
    {
      onDelta: (accumulated) => onPartial(extractPartialLookup(accumulated)),
      onResult: (result, cached) => onResult({
        result: normalizeResult(result, {
          sourceLang: req.sourceLang,
          targetLang: req.targetLang,
        }),
        source: cached ? 'server_cache' : 'openai',
      }),
      onError,
    },
  );

  const isRetryableEmpty = (res: WordLookupResponse): boolean => {
    const meanings = res.result.meanings ?? [];
    if (meanings.length > 0) return false;
    const note = res.result.note;
    return !note || note === 'non_word';
  };

  try {
    let firstResult: WordLookupResponse | null = null;
    await runOnce(
      (p) => handlers.onPartial?.(p),
      (res) => { firstResult = res; },
      handlers.onError,
    );
    if (!firstResult) return;
    if (!isRetryableEmpty(firstResult)) {
      handlers.onFinal(firstResult);
      return;
    }
    // Cold-start empty: wait briefly then retry once via warm prompt cache.
    await new Promise((r) => setTimeout(r, 700));
    // Wrap in an object so TS doesn't narrow-to-null on the let binding
    // through the callback closure (mutable-capture narrowing quirk).
    const slot: { value: WordLookupResponse | null } = { value: null };
    await runOnce(
      (p) => handlers.onPartial?.(p),
      (res) => { slot.value = res; },
      handlers.onError,
    );
    const secondResult = slot.value;
    handlers.onFinal(
      secondResult && (secondResult.result.meanings ?? []).length > 0
        ? secondResult
        : firstResult,
    );
  } catch (err) {
    handlers.onError(err instanceof Error ? err : new Error('stream failed'));
  }
}

export async function lookupWord(
  req: WordLookupRequest & { meanings?: { definition: string; partOfSpeech: string }[] },
  opts: { persist?: boolean } = {},
): Promise<WordLookupResponse> {
  const mode: WordLookupMode = req.mode ?? 'quick';
  // Quick mode never persists — only the explicit save flow does.
  // Enrich mode persists by default (caller opted into saving).
  const persist = opts.persist ?? mode === 'enrich';

  // 1. Local cache — only serve from local when we have what the caller wants.
  const local = await findWord({
    word: req.word.trim(),
    bookId: req.bookId ?? null,
  });
  if (local && (mode === 'quick' || hasEnrichedFields(local.result))) {
    return { result: local.result, source: 'local' };
  }

  // 2. Edge Function
  try {
    const { meanings, ...restReq } = req;
    let data: { result: WordLookupResult; cached: boolean } | undefined;

    if (USE_V2_LOOKUP) {
      try {
        const v2 = await lookupV2({ ...restReq, mode });
        data = { result: v2.result, cached: v2.cached };
      } catch (e) {
        // Translate LookupV2Error → WordLookupError for unified handling.
        if (e instanceof LookupV2Error) {
          const validCodes: WordLookupError['code'][] = [
            'rate_limited', 'budget_exhausted', 'unauthorized',
            'server_error', 'unavailable', 'timeout',
          ];
          const mapped = (validCodes as string[]).includes(e.code)
            ? (e.code as WordLookupError['code'])
            : 'server_error';
          throw new WordLookupError(e.message, mapped);
        }
        throw e;
      }
    } else {
      const { data: invokeData, error } = await withTimeout(
        supabase.functions.invoke<{
          result: WordLookupResult;
          cached: boolean;
        }>('word-lookup', {
          body: { ...restReq, mode, ...(mode === 'enrich' && meanings?.length ? { meanings } : {}) },
        }),
        REQUEST_TIMEOUT_MS,
      );

      if (error) {
        const status = (error.context as { status?: number } | undefined)?.status;
        if (status === 429) throw new WordLookupError(error.message, 'rate_limited');
        if (status === 402) throw new WordLookupError(error.message, 'budget_exhausted');
        if (status === 401) throw new WordLookupError(error.message, 'unauthorized');
        throw new WordLookupError(error.message, 'server_error');
      }
      data = invokeData ?? undefined;
    }

    if (!data?.result) {
      throw new WordLookupError('Edge Function returned empty result', 'server_error');
    }

    // Enrich returns only supplementary fields — merge with existing quick result
    let finalResult: WordLookupResult = normalizeResult(data.result, {
      sourceLang: req.sourceLang,
      targetLang: req.targetLang,
    });
    if (mode === 'enrich' && local) {
      finalResult = {
        ...local.result,
        synonyms: finalResult.synonyms ?? [],
        antonyms: finalResult.antonyms ?? [],
        examples: finalResult.examples ?? [],
      };
    }

    if (persist) {
      await saveWord({
        id: genId(),
        bookId: req.bookId ?? null,
        word: req.word.trim(),
        result: finalResult,
        sourceSentence: null,
      });
    }

    return {
      result: finalResult,
      source: data.cached ? 'server_cache' : 'openai',
    };
  } catch (err) {
    // 3. Fallback — only for recoverable errors
    if (err instanceof WordLookupError && err.code === 'unauthorized') throw err;
    if (isTimeoutError(err)) throw new WordLookupError('Timeout', 'timeout');

    const fallback = await fetchFromFallbackDictionary(req.word, req.sourceLang);
    if (!fallback) {
      if (err instanceof WordLookupError) throw err;
      throw new WordLookupError(
        err instanceof Error ? err.message : 'Unavailable',
        'unavailable',
      );
    }

    if (persist) {
      await saveWord({
        id: genId(),
        bookId: req.bookId ?? null,
        word: req.word.trim(),
        result: fallback,
        sourceSentence: null,
      });
    }

    return { result: fallback, source: 'fallback' };
  }
}

// checkWordFreshness removed 2026-05-14 — v1's per-word freshness probe
// against global_word_cache. Covered now by syncUserWordsContent which
// runs on app launch + foreground (services/userWordsSyncService.ts).
