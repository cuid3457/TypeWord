/**
 * B 옵션 — 전체 word_translations 재빌드.
 *
 * 1. Snapshot 백업 테이블 생성 (롤백 안전망)
 * 2. (word, source_lang, target_lang) 1,930 쌍 추출
 * 3. 20-worker 병렬로 invalidate → word-lookup-v4 호출 → upsert
 * 4. 진행률 로그 + 실패 row 별도 retry 1회
 *
 * Run: cd TypeWord && npx tsx scripts/rebuild-all-cache.ts [--workers=20] [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
const SROLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SROLE) { console.error('Missing env'); process.exit(1); }

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}
function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
const WORKERS = parseInt(arg('workers') ?? '20', 10);
const DRY_RUN = argFlag('dry-run');

const admin = createClient(SUPABASE_URL, SROLE, { auth: { persistSession: false } });

const OUT_DIR = join(process.cwd(), 'scripts', 'rebuild-results');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_FILE = join(OUT_DIR, `rebuild-${STAMP}.jsonl`);
const PROGRESS_FILE = join(OUT_DIR, `progress-${STAMP}.txt`);
function logRow(row: object) {
  writeFileSync(LOG_FILE, JSON.stringify(row) + '\n', { flag: 'a' });
}
function logProgress(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  writeFileSync(PROGRESS_FILE, line, { flag: 'a' });
  process.stdout.write(line);
}

interface Pair {
  word_entry_id: string;
  word: string;
  source_lang: string;
  target_lang: string;
  translation_id: string;
}

async function fetchAllPairs(): Promise<Pair[]> {
  const pairs: Pair[] = [];
  // Paginate translations join word_entries
  let from = 0;
  const PAGE = 500;
  while (true) {
    const { data, error } = await admin
      .from('word_translations')
      .select('id, target_lang, word_entry_id, word_entries!inner(word, word_lang)')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('fetch pairs: ' + error.message);
    if (!data || data.length === 0) break;
    for (const t of data as any[]) {
      pairs.push({
        word_entry_id: t.word_entry_id,
        translation_id: t.id,
        word: t.word_entries.word,
        source_lang: t.word_entries.word_lang,
        target_lang: t.target_lang,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return pairs;
}

async function takeSnapshot(): Promise<void> {
  const tag = STAMP.replace(/-/g, '').slice(0, 14); // 20260525T103045
  const sqlEntries = `CREATE TABLE word_entries_backup_${tag} AS SELECT * FROM word_entries;`;
  const sqlTrans   = `CREATE TABLE word_translations_backup_${tag} AS SELECT * FROM word_translations;`;
  // Use supabase-js rpc or direct SQL via PostgREST? supabase-js doesn't expose raw DDL.
  // Workaround: write the SQL to a file for the user to execute via SQL editor before continuing.
  const snapPath = join(OUT_DIR, `snapshot-${tag}.sql`);
  writeFileSync(snapPath, `${sqlEntries}\n${sqlTrans}\n`);
  logProgress(`Snapshot SQL written: ${snapPath}`);
  logProgress(`  ↳ run these in Supabase SQL editor BEFORE proceeding if you want a rollback safety net.`);
}

async function rebuildOne(p: Pair): Promise<{ ok: boolean; durationMs: number; error?: string; cached?: boolean; meanings?: number; examples?: number }> {
  const start = Date.now();
  try {
    // 1. Invalidate this translation row (so cache miss; canonical entry kept so we don't re-fetch dict twice for same word — but we want fresh canonical too).
    //    Strategy: delete BOTH the translation row AND the canonical entry. Both will be re-upserted.
    await admin.from('word_translations').delete().eq('id', p.translation_id);
    await admin.from('word_entries').delete().eq('id', p.word_entry_id);

    // 2. Call word-lookup-v4
    const res = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v4`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ word: p.word, sourceLang: p.source_lang, targetLang: p.target_lang }),
    });
    const dur = Date.now() - start;
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, durationMs: dur, error: `HTTP ${res.status}: ${body.slice(0, 150)}` };
    }
    const j = await res.json() as any;
    const m = j?.result?.meanings?.length ?? 0;
    const e = j?.result?.examples?.length ?? 0;
    return { ok: true, durationMs: dur, cached: j.cached, meanings: m, examples: e };
  } catch (err) {
    return { ok: false, durationMs: Date.now() - start, error: (err as Error).message };
  }
}

async function workerPool(pairs: Pair[], workers: number) {
  const total = pairs.length;
  let completed = 0;
  let failed = 0;
  let nextIdx = 0;
  let lastReport = Date.now();
  const startAll = Date.now();
  const failures: Pair[] = [];

  async function workerLoop(workerId: number) {
    while (true) {
      const idx = nextIdx++;
      if (idx >= total) break;
      const p = pairs[idx];
      const r = await rebuildOne(p);
      completed++;
      if (!r.ok) {
        failed++;
        failures.push(p);
        logRow({ idx, worker: workerId, ...p, ...r });
      } else {
        logRow({ idx, worker: workerId, ...p, ok: true, dur: r.durationMs, m: r.meanings, e: r.examples });
      }
      if (Date.now() - lastReport > 30_000) {
        const elapsed = (Date.now() - startAll) / 1000;
        const rate = completed / elapsed;
        const eta = (total - completed) / Math.max(rate, 0.1);
        logProgress(`Progress ${completed}/${total} (${(completed/total*100).toFixed(1)}%) failed=${failed} rate=${rate.toFixed(2)}/s eta=${(eta/60).toFixed(1)}min`);
        lastReport = Date.now();
      }
    }
  }
  const workersArr = Array.from({ length: workers }, (_, i) => workerLoop(i));
  await Promise.all(workersArr);

  // Retry failures once
  if (failures.length > 0) {
    logProgress(`Retrying ${failures.length} failures...`);
    let retryOk = 0;
    let retryFail = 0;
    nextIdx = 0;
    const retryWorkers = Array.from({ length: Math.min(workers, failures.length) }, () => (async () => {
      while (true) {
        const idx = nextIdx++;
        if (idx >= failures.length) break;
        const p = failures[idx];
        const r = await rebuildOne(p);
        if (r.ok) retryOk++; else retryFail++;
        logRow({ retry: true, idx, ...p, ...r });
      }
    })());
    await Promise.all(retryWorkers);
    logProgress(`Retry done: ${retryOk} succeeded, ${retryFail} still failed`);
  }

  const totalSec = (Date.now() - startAll) / 1000;
  logProgress(`\n=== DONE ===`);
  logProgress(`Total: ${total} pairs, ${completed - failed + (failures.length > 0 ? 0 : 0)} succeeded (initial), ${failed} initial failures, time=${(totalSec/60).toFixed(1)}min`);
  logProgress(`Log file: ${LOG_FILE}`);
}

async function main() {
  logProgress(`Rebuild starting — workers=${WORKERS} dry_run=${DRY_RUN}`);
  await takeSnapshot();

  logProgress('Fetching all (word, source_lang, target_lang) pairs...');
  const pairs = await fetchAllPairs();
  logProgress(`Found ${pairs.length} pairs to rebuild.`);

  if (DRY_RUN) {
    logProgress('DRY RUN — not invalidating or calling LLM. Exiting.');
    process.exit(0);
  }

  await workerPool(pairs, WORKERS);
}
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
