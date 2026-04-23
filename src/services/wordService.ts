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
import { findWord, saveWord, updateWordResult, applyCacheUpdate } from '@src/db/queries';
import type { WordLookupMode, WordLookupRequest, WordLookupResult } from '@src/types/word';
import { normalizeResult } from '@src/utils/normalizeResult';

export type WordLookupSource = 'local' | 'server_cache' | 'openai' | 'fallback';

export interface WordLookupResponse {
  result: WordLookupResult;
  source: WordLookupSource;
}

function hasEnrichedFields(r: WordLookupResult): boolean {
  return !!(r.examples?.length || r.synonyms?.length || r.antonyms?.length);
}

export class WordLookupError extends Error {
  code: 'rate_limited' | 'budget_exhausted' | 'unauthorized' | 'server_error' | 'unavailable';
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

/**
 * Resolve a reverse lookup: translate a native-language word to the study language.
 * Returns an array of candidates for disambiguation (e.g. "은행" → [{headword:"bank", hint:"금융 기관"}, {headword:"ginkgo", hint:"은행나무 열매"}]).
 */
export async function resolveHeadword(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<HeadwordCandidate[]> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      result: { candidates?: HeadwordCandidate[]; headword?: string };
    }>('word-lookup', {
      body: {
        word,
        sourceLang,
        targetLang,
        translate: true,
      },
    });
    if (error) {
      console.warn('resolveHeadword error:', error);
      return [];
    }
    if (data?.result?.candidates?.length) {
      return data.result.candidates.filter((c) => c.headword);
    }
    const hw = data?.result?.headword;
    if (hw) return [{ headword: hw, hint: '' }];
    return [];
  } catch (err) {
    console.warn('resolveHeadword exception:', err);
    return [];
  }
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
    const { data } = await supabase.functions.invoke<{
      result: Pick<WordLookupResult, 'synonyms' | 'antonyms' | 'examples'>;
    }>('word-lookup', {
      body: { ...rest, mode: 'enrich', ...(meanings?.length ? { meanings } : {}) },
    });
    if (!data?.result) return null;

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

  try {
    await streamWordLookup(
      { ...req, mode: req.mode ?? 'quick' },
      {
        onDelta: (accumulated) => {
          handlers.onPartial?.(extractPartialLookup(accumulated));
        },
        onResult: (result, cached) => {
          handlers.onFinal({
            result: normalizeResult(result, {
              sourceLang: req.sourceLang,
              targetLang: req.targetLang,
            }),
            source: cached ? 'server_cache' : 'openai',
          });
        },
        onError: handlers.onError,
      },
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
    const { data, error } = await supabase.functions.invoke<{
      result: WordLookupResult;
      cached: boolean;
    }>('word-lookup', {
      body: { ...restReq, mode, ...(mode === 'enrich' && meanings?.length ? { meanings } : {}) },
    });

    if (error) {
      const status = (error.context as { status?: number } | undefined)?.status;
      if (status === 429) throw new WordLookupError(error.message, 'rate_limited');
      if (status === 402) throw new WordLookupError(error.message, 'budget_exhausted');
      if (status === 401) throw new WordLookupError(error.message, 'unauthorized');
      throw new WordLookupError(error.message, 'server_error');
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

export async function checkWordFreshness(
  wordId: string,
  word: string,
  sourceLang: string,
  targetLang: string,
  cacheSyncedAt: number,
): Promise<WordLookupResult | null> {
  try {
    const { data, error } = await supabase.rpc('check_word_freshness', {
      p_word: word.trim().toLowerCase(),
      p_source_lang: sourceLang,
      p_target_lang: targetLang,
      p_since: new Date(cacheSyncedAt || 0).toISOString(),
    });

    if (error || !data?.length) return null;

    const { getDb } = await import('@src/db');
    const db = await getDb();
    const existing = await db.getFirstAsync<{ result_json: string }>(
      'SELECT result_json FROM user_words WHERE id = ?',
      [wordId],
    );
    if (!existing) return null;

    let result: Record<string, unknown>;
    try { result = JSON.parse(existing.result_json); } catch { return null; }

    for (const row of data as { cache_result: Record<string, unknown>; cache_mode: string }[]) {
      if (row.cache_mode === 'quick') {
        const q = row.cache_result;
        if (q.headword) result.headword = q.headword;
        if (q.meanings) result.meanings = q.meanings;
        if (q.reading) result.reading = q.reading;
      } else if (row.cache_mode === 'enrich') {
        const e = row.cache_result;
        if (e.examples) result.examples = e.examples;
        if (e.synonyms) result.synonyms = e.synonyms;
        if (e.antonyms) result.antonyms = e.antonyms;
      }
    }

    const merged = normalizeResult(result as unknown as WordLookupResult, { sourceLang, targetLang });
    await applyCacheUpdate(wordId, merged);
    return merged;
  } catch {
    return null;
  }
}
