/**
 * Streams a word lookup from the word-lookup Edge Function via SSE.
 *
 * Why XMLHttpRequest instead of fetch?
 * React Native's fetch doesn't expose ReadableStream on the response body,
 * so we can't read chunks as they arrive. XHR's `onprogress` fires with
 * the accumulated `responseText`, which is enough for SSE parsing.
 */
import { SUPABASE_URL, supabase } from './supabase';
import { markActivity } from '@src/services/edgeWarmup';
import type { WordLookupRequest, WordLookupResult } from '@src/types/word';

export interface StreamHandlers {
  onDelta?: (accumulated: string) => void;
  onResult: (result: WordLookupResult, cached: boolean) => void;
  onError: (err: Error) => void;
}

export interface PartialLookup {
  reading?: string | string[];
  meanings: { definition: string; partOfSpeech?: string; gender?: 'm' | 'f' | 'n' | 'mf' }[];
}

/**
 * Extracts what's parseable from a partial (possibly mid-chunk) JSON string.
 * Relies on the OpenAI output order (definition → partOfSpeech → relevanceScore)
 * defined in the system prompt. Matches 1:1 by index.
 */
export function extractPartialLookup(accumulated: string): PartialLookup {
  const defRegex = /"definition"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  const posRegex = /"partOfSpeech"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  const genderRegex = /"gender"\s*:\s*"(mf|[mfn])"/g;

  const defs = [...accumulated.matchAll(defRegex)].map((m) => unescapeJson(m[1]));
  const poss = [...accumulated.matchAll(posRegex)].map((m) => unescapeJson(m[1]));
  const genders = [...accumulated.matchAll(genderRegex)].map((m) => m[1] as 'm' | 'f' | 'n' | 'mf');

  // reading can be a string or an array of strings
  let reading: string | string[] | undefined;
  const readingArrayRegex = /"reading"\s*:\s*\[([^\]]*)\]/;
  const readingStringRegex = /"reading"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/;
  const arrMatch = accumulated.match(readingArrayRegex);
  if (arrMatch) {
    const items = [...arrMatch[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => unescapeJson(m[1]));
    if (items.length > 0) reading = items;
  } else {
    const strMatch = accumulated.match(readingStringRegex);
    if (strMatch) reading = unescapeJson(strMatch[1]);
  }

  const meanings = defs.map((d, i) => ({
    definition: d,
    partOfSpeech: poss[i],
    gender: genders[i],
  }));

  return { reading, meanings };
}

function unescapeJson(s: string): string {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function parseSseBlock(block: string): { event: string | null; data: string | null } {
  let event: string | null = null;
  let data: string | null = null;
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = line.slice(5).trim();
  }
  return { event, data };
}

export async function streamWordLookup(
  req: WordLookupRequest,
  handlers: StreamHandlers,
): Promise<void> {
  let { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    const { ensureSession } = require('@src/services/authService');
    await ensureSession();
    ({ data } = await supabase.auth.getSession());
  }
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error('No session available');

  const url = `${SUPABASE_URL}/functions/v1/word-lookup`;
  markActivity();

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${jwt}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.timeout = 30000;

    let lastIndex = 0;
    let buffer = '';
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) {
        handlers.onError(err);
        reject(err);
      } else {
        resolve();
      }
    };

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;
      buffer += chunk;

      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        if (!block.trim()) continue;
        const { event, data: eventData } = parseSseBlock(block);
        if (!event || !eventData) continue;
        try {
          const parsed = JSON.parse(eventData);
          if (event === 'delta' && typeof parsed.accumulated === 'string') {
            handlers.onDelta?.(parsed.accumulated);
          } else if (event === 'result') {
            handlers.onResult(parsed.result as WordLookupResult, !!parsed.cached);
            settle();
          } else if (event === 'error') {
            settle(new Error(parsed.error ?? 'Stream error'));
          }
        } catch {
          // Ignore malformed chunks — the buffer boundary may have split a JSON.
        }
      }
    };

    xhr.onerror = () => settle(new Error('Network error'));
    xhr.ontimeout = () => settle(new Error('Timeout'));
    xhr.onload = () => {
      if (xhr.status >= 400 && !settled) {
        let msg = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          msg = body.error ?? msg;
        } catch { /* use default msg */ }
        settle(new Error(msg));
      } else if (!settled) {
        // Server closed without a `result` event — surface an error.
        settle(new Error('Stream ended without result'));
      }
    };

    xhr.send(JSON.stringify({ ...req, stream: true }));
  });
}
