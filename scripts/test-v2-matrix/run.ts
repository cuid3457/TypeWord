/**
 * Test matrix runner — sweeps 8 source langs × 7 target langs × 200 words
 * = 11,200 word-lookup-v2 calls. Uses a worker pool for concurrency.
 *
 * Strategy:
 *   • Per source lang, for each word, call enrich mode with 7 target langs.
 *   • Within one (source, word) group: the first target call triggers
 *     COMBINED_QUICK + ANALYZE_ENRICH (cold canonical); subsequent target
 *     calls reuse the canonical and run only the translation legs.
 *   • Saves every response to a JSON output file for the validator.
 *   • Tracks tokens / cost / latency per call.
 *
 * Concurrency caveat: we DON'T parallelize within a (source, word) group
 * (must be sequential to share canonical). We DO parallelize across
 * different (source, word) groups via a worker pool.
 *
 * Run:
 *   cd TypeWord && npx --yes tsx scripts/test-v2-matrix/run.ts [--workers=N] [--source=ko] [--limit=N]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { SOURCE_LANGS, TARGET_LANGS_BY_SOURCE, WORDS_BY_SOURCE, type Category } from './words.ts';

// ── env ──
function loadEnv(): Record<string, string> {
  const envPath = join(process.cwd(), '.env.local');
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {/* */}
  return out;
}
const env = loadEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE env vars'); process.exit(1);
}

// ── args ──
function arg(name: string, def?: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}
const WORKERS = parseInt(arg('workers', '10')!, 10);
const SOURCE_FILTER = arg('source');
const LIMIT = arg('limit') ? parseInt(arg('limit')!, 10) : null;

// ── supabase admin (service role bypasses rate limits + auth) ──
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── output dir ──
const OUT_DIR = join(process.cwd(), 'scripts', 'test-v2-matrix', 'results');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_FILE = join(OUT_DIR, `run-${RUN_STAMP}.jsonl`);

interface ResultRow {
  source: string;
  target: string;
  word: string;
  category: Category;
  ok: boolean;
  durationMs: number;
  // partial result data — enough for the validator
  result?: {
    headword?: string;
    confidence?: number;
    note?: string;
    meanings?: Array<{ definition: string; partOfSpeech: string; gender?: string; relevanceScore?: number }>;
    synonyms?: string[];
    antonyms?: string[];
    examples?: Array<{ sentence: string; translation: string; meaningIndex?: number }>;
    ipa?: string;
    reading?: string | string[];
  };
  cached?: boolean;
  cacheLevel?: { canonical: boolean; translation: boolean; enriched: boolean };
  error?: string;
}

// Buffer rows and flush periodically.
const ROWS: ResultRow[] = [];
const FLUSH_EVERY = 50;
let flushed = 0;
function flush() {
  if (ROWS.length === 0) return;
  const lines = ROWS.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(OUT_FILE, lines, { flag: 'a' });
  flushed += ROWS.length;
  ROWS.length = 0;
}

async function callV2(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ ok: boolean; result?: any; cached?: boolean; cacheLevel?: any; error?: string; durationMs: number }> {
  const started = Date.now();
  try {
    const r = await admin.functions.invoke('word-lookup-v2', {
      body: { word, sourceLang, targetLang, mode: 'enrich' },
    });
    const durationMs = Date.now() - started;
    if (r.error) {
      return { ok: false, error: r.error.message ?? String(r.error), durationMs };
    }
    const data = r.data as { result?: any; cached?: boolean; cacheLevel?: any };
    return {
      ok: !!data?.result,
      result: data?.result,
      cached: data?.cached,
      cacheLevel: data?.cacheLevel,
      durationMs,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message, durationMs: Date.now() - started };
  }
}

async function processOneWord(source: string, word: string, category: Category, targets: string[]): Promise<void> {
  // Sequencing rule:
  //   • First target: SEQUENTIAL — this call may set canonical (COMBINED_QUICK)
  //     and enrich (ANALYZE_ENRICH). Subsequent calls need both to be cached.
  //   • Remaining targets: PARALLEL — canonical + has_enrich now exist; each
  //     remaining call only triggers TRANSLATE_MEANING + TRANSLATE_SENTENCE
  //     for its own target_lang, which write to different cache rows. Safe
  //     to run concurrently.
  // This roughly 3× the per-group throughput vs full-sequential (1 cold ≈ 6s
  // + 6 parallel translations ≈ 3s → 9s/group instead of ~15s/group).
  const pushRow = (target: string, res: Awaited<ReturnType<typeof callV2>>) => {
    ROWS.push({
      source, target, word, category,
      ok: res.ok, durationMs: res.durationMs,
      result: res.result, cached: res.cached, cacheLevel: res.cacheLevel,
      error: res.error,
    });
    if (ROWS.length >= FLUSH_EVERY) flush();
  };

  // 1) Sequential first target.
  const first = targets[0];
  const firstRes = await callV2(word, source, first);
  pushRow(first, firstRes);

  // 2) Parallel remaining targets.
  const rest = targets.slice(1);
  if (rest.length > 0) {
    const results = await Promise.all(rest.map((t) => callV2(word, source, t)));
    for (let i = 0; i < rest.length; i++) pushRow(rest[i], results[i]);
  }
}

interface Job { source: string; word: string; category: Category; targets: string[] }

async function workerLoop(workerId: number, queue: Job[]): Promise<void> {
  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    try {
      await processOneWord(job.source, job.word, job.category, job.targets);
    } catch (err) {
      console.error(`[worker ${workerId}] error on ${job.source}|${job.word}:`, (err as Error).message);
    }
  }
}

(async () => {
  // Build job queue.
  const sources = SOURCE_FILTER ? [SOURCE_FILTER] : SOURCE_LANGS;
  const queue: Job[] = [];
  for (const source of sources) {
    const words = WORDS_BY_SOURCE[source];
    if (!words) { console.warn(`No words for ${source}, skipping`); continue; }
    const targets = TARGET_LANGS_BY_SOURCE[source];
    const subset = LIMIT ? words.slice(0, LIMIT) : words;
    for (const w of subset) {
      queue.push({ source, word: w.word, category: w.category, targets });
    }
  }

  const totalCalls = queue.reduce((n, j) => n + j.targets.length, 0);
  console.log(`Matrix: ${queue.length} (source, word) groups → ${totalCalls} v2 calls`);
  console.log(`Workers: ${WORKERS}`);
  console.log(`Output: ${OUT_FILE}`);

  const started = Date.now();
  // Progress reporter.
  const progressTimer = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const rate = flushed / Math.max(elapsed, 1);
    const remaining = totalCalls - flushed - ROWS.length;
    const eta = remaining / Math.max(rate, 0.01);
    process.stdout.write(`\rprogress: ${flushed + ROWS.length}/${totalCalls} | ${rate.toFixed(1)}/s | ETA ${(eta / 60).toFixed(1)}min   `);
  }, 5000);

  // Start workers.
  const workers = Array.from({ length: WORKERS }, (_, i) => workerLoop(i, queue));
  await Promise.all(workers);
  flush();
  clearInterval(progressTimer);

  const elapsed = (Date.now() - started) / 1000;
  console.log(`\nDone. ${flushed} calls in ${(elapsed / 60).toFixed(1)} min (${(flushed / elapsed).toFixed(1)} calls/s).`);
  console.log(`Output: ${OUT_FILE}`);
})();
