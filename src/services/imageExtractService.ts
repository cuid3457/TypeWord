import { supabase } from '@src/api/supabase';
import { isTimeoutError, withTimeout } from '@src/utils/timeout';

const EXTRACT_TIMEOUT_MS = 45000;

export interface ExtractedWord {
  word: string;
  reading: string | null;
  definition: string;
  partOfSpeech: string;
}

export interface ImageExtractResult {
  detectedLang: string;
  words: ExtractedWord[];
}

export const IMAGE_LIMIT_FREE = 3;
export const IMAGE_LIMIT_PREMIUM = 50;

function currentMonthBucket(timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    if (y && m) return `${y}-${m}`;
  } catch {
    // Fall through to UTC.
  }
  const now = new Date();
  const y = now.getUTCFullYear().toString();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Reads the user's image-extract quota counter directly from profiles.
 * Returns 0 if the stored bucket doesn't match the user's current month
 * (the server will reset it on the next successful consume).
 */
export async function getImageExtractUsage(): Promise<number> {
  const { data: userResp } = await supabase.auth.getUser();
  const userId = userResp?.user?.id;
  if (!userId) return 0;

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, image_extract_bucket, image_extract_count')
    .eq('user_id', userId)
    .single();

  if (!profile) return 0;

  const timezone = profile.timezone ?? 'UTC';
  const bucket = currentMonthBucket(timezone);
  if (profile.image_extract_bucket !== bucket) return 0;
  return profile.image_extract_count ?? 0;
}

export async function extractWordsFromImage(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
): Promise<ImageExtractResult> {
  let data, error;
  try {
    ({ data, error } = await withTimeout(
      supabase.functions.invoke<{
        result: ImageExtractResult;
        error?: string;
        limit?: number;
        used?: number;
      }>('image-extract', {
        body: { image: imageBase64, sourceLang, targetLang },
      }),
      EXTRACT_TIMEOUT_MS,
    ));
  } catch (err) {
    if (isTimeoutError(err)) throw new Error('SLOW_NETWORK');
    throw err;
  }

  if (error) {
    // supabase-js FunctionsHttpError exposes the fetch Response as `context`.
    // The body is a ReadableStream until awaited — we must call `.json()` /
    // `.text()` to read it. (Previous code accessed `context.body` directly
    // which returned the stream and silently failed to parse.)
    const ctx = error.context as Response | undefined;
    const status = ctx?.status;

    let parsed: { error?: string; limit?: number; used?: number } | null = null;
    if (ctx && typeof ctx.json === 'function') {
      try {
        parsed = await ctx.json();
      } catch {
        // Body may have been consumed or not JSON — leave parsed as null.
      }
    }

    if (status === 429 && parsed?.error === 'IMAGE_LIMIT_REACHED') {
      throw new Error('IMAGE_LIMIT_REACHED');
    }
    if (status === 429) throw new Error('RATE_LIMIT');
    if (status === 402) throw new Error('BUDGET_EXHAUSTED');
    throw new Error(parsed?.error || error.message || 'Image extraction failed');
  }

  if (!data?.result?.words?.length) {
    throw new Error('NO_WORDS_FOUND');
  }

  return data.result;
}
