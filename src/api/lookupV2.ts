/**
 * v2 word-lookup client wrapper.
 *
 * The v2 edge function returns a plain JSON body (no SSE streaming), so
 * this module uses `fetch` rather than the XHR-based stream client. The
 * caller-facing API mirrors the existing flow so wordService can branch
 * transparently:
 *
 *   • lookupV2: one-shot fetch (quick or enrich), returns
 *     { result, cached, cacheLevel }.
 *   • lookupV2Stream: shim that mimics the streamWordLookup callback shape
 *     by firing onResult once the fetch resolves. onDelta is never called
 *     (no streaming) — callers using onDelta for typewriter UX simply see
 *     the result appear at once.
 *
 * The reverse-lookup ("translate" mode) path is intentionally NOT routed
 * here — v2 doesn't implement it yet. Callers continue to hit v1 for that.
 */
import { SUPABASE_URL, supabase } from './supabase';
import { markActivity } from '@src/services/edgeWarmup';
import type { WordLookupRequest, WordLookupResult } from '@src/types/word';
import type { StreamHandlers } from './streamLookup';

const V2_ENDPOINT = `${SUPABASE_URL}/functions/v1/word-lookup-v2`;
const DEFAULT_TIMEOUT_MS = 30000;

export interface LookupV2Response {
  result: WordLookupResult;
  cached: boolean;
  cacheLevel?: {
    canonical: boolean;
    translation: boolean;
    enriched: boolean;
  };
}

export class LookupV2Error extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = 'server_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function getJwt(): Promise<string> {
  let { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    const { ensureSession } = require('@src/services/authService');
    await ensureSession();
    ({ data } = await supabase.auth.getSession());
  }
  const jwt = data.session?.access_token;
  if (!jwt) throw new LookupV2Error('No session available', 401, 'unauthorized');
  return jwt;
}

/**
 * One-shot lookup via the v2 edge function. Returns the full response.
 * Throws LookupV2Error on non-2xx with an inferred error code.
 */
export async function lookupV2(
  req: WordLookupRequest,
  opts: { timeoutMs?: number } = {},
): Promise<LookupV2Response> {
  const jwt = await getJwt();
  markActivity();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const resp = await fetch(V2_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      let message = `HTTP ${resp.status}`;
      let code: string = 'server_error';
      try {
        const body = (await resp.json()) as { error?: string; code?: string };
        message = body.error ?? message;
        code = body.code ?? code;
      } catch {
        // body wasn't JSON — keep the default HTTP-status message
      }
      // Map known statuses to canonical client error codes.
      if (resp.status === 429) code = 'rate_limited';
      else if (resp.status === 402) code = 'budget_exhausted';
      else if (resp.status === 401) code = 'unauthorized';
      throw new LookupV2Error(message, resp.status, code);
    }

    const data = (await resp.json()) as LookupV2Response;
    if (!data?.result) {
      throw new LookupV2Error('Empty result', 500);
    }
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof LookupV2Error) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new LookupV2Error('Timeout', 408, 'timeout');
    }
    throw new LookupV2Error(
      err instanceof Error ? err.message : 'Network error',
      0,
      'network',
    );
  }
}

/**
 * Real SSE streaming for v2 QUICK mode.
 *
 * Uses XHR (not fetch) because React Native's fetch doesn't surface
 * ReadableStream on the response body. XHR.onprogress fires with the
 * accumulating responseText, which is enough for SSE parsing.
 *
 * Event stream from the server:
 *   • event: delta, data: {accumulated: string}  — repeated as tokens arrive
 *   • event: result, data: {result, cached, cacheLevel}  — terminal
 *   • event: error, data: {error: string}                — terminal (error)
 *
 * Cache-hit responses send a single `result` event with no preceding
 * `delta` — the caller's onDelta is simply never invoked in that case.
 */

function parseSseBlock(block: string): { event: string | null; data: string | null } {
  let event: string | null = null;
  let data: string | null = null;
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = line.slice(5).trim();
  }
  return { event, data };
}

export async function lookupV2Stream(
  req: WordLookupRequest,
  handlers: StreamHandlers,
): Promise<void> {
  const jwt = await getJwt();
  markActivity();

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', V2_ENDPOINT, true);
    xhr.setRequestHeader('Authorization', `Bearer ${jwt}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.timeout = DEFAULT_TIMEOUT_MS;

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

      // SSE events are separated by blank lines (\n\n).
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        if (!block.trim()) continue;
        const { event, data } = parseSseBlock(block);
        if (!event || !data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === 'delta' && typeof parsed.accumulated === 'string') {
            handlers.onDelta?.(parsed.accumulated);
          } else if (event === 'result') {
            handlers.onResult(parsed.result as WordLookupResult, !!parsed.cached);
            settle();
          } else if (event === 'error') {
            settle(new Error(parsed.error ?? 'Stream error'));
          }
        } catch {
          // Buffer boundary may have split a chunk mid-JSON; ignore and continue.
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
        } catch { /* keep default */ }
        settle(new Error(msg));
      } else if (!settled) {
        settle(new Error('Stream ended without result'));
      }
    };

    xhr.send(JSON.stringify({ ...req, stream: true }));
  });
}
