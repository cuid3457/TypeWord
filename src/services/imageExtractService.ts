import { supabase } from '@src/api/supabase';

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

export async function getImageExtractUsage(isPremium: boolean): Promise<number> {
  let query = supabase
    .from('api_calls')
    .select('*', { count: 'exact', head: true })
    .eq('endpoint', 'image-extract')
    .eq('status', 'ok');

  if (isPremium) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    query = query.gte('created_at', monthStart.toISOString());
  }

  const { count } = await query;
  return count ?? 0;
}

export async function extractWordsFromImage(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
): Promise<ImageExtractResult> {
  const { data, error } = await supabase.functions.invoke<{
    result: ImageExtractResult;
    error?: string;
    limit?: number;
    used?: number;
  }>('image-extract', {
    body: { image: imageBase64, sourceLang, targetLang },
  });

  if (error) {
    const status = (error.context as { status?: number } | undefined)?.status;
    const body = error.context as { body?: string } | undefined;
    let parsed: { error?: string; limit?: number; used?: number } | null = null;
    try {
      if (body?.body) parsed = JSON.parse(body.body);
    } catch {}

    if (status === 429 && parsed?.error === 'IMAGE_LIMIT_REACHED') {
      throw new Error('IMAGE_LIMIT_REACHED');
    }
    if (status === 429) throw new Error('RATE_LIMIT');
    if (status === 402) throw new Error('BUDGET_EXHAUSTED');
    throw new Error(error.message || 'Image extraction failed');
  }

  if (!data?.result?.words?.length) {
    throw new Error('NO_WORDS_FOUND');
  }

  return data.result;
}
