// Re-process all 8 sample books with concurrency. forceFresh + ENRICH.
// Words parallelized at concurrency=5 to amortize per-meaning latency without
// flooding OpenAI rate limits (each word internally fires ~3-4 OpenAI calls).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';
const CONCURRENCY = 5;

const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

const { data: books, error: bErr } = await c
  .from('books')
  .select('id,title,source_lang,target_lang')
  .eq('user_id', USER_ID)
  .like('title', '샘플 검증%')
  .order('created_at', { ascending: true });
if (bErr) { console.error(bErr); process.exit(1); }

// Flatten: list of {book, word} jobs across all books
const jobs = [];
for (const b of books) {
  const { data: ws } = await c.from('user_words').select('id,word').eq('book_id', b.id).order('created_at', { ascending: true });
  for (const w of ws) jobs.push({ book: b, word: w });
}
console.log(`${jobs.length} words to re-process, concurrency=${CONCURRENCY}\n`);

let done = 0, ok = 0, failed = 0;
const failures = [];
const t0 = Date.now();

async function processOne(job) {
  const { book, word } = job;
  const label = `[${book.source_lang}→${book.target_lang}] ${word.word}`;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: word.word,
        sourceLang: book.source_lang,
        targetLang: book.target_lang,
        mode: 'enrich',
        forceFresh: true,
      }),
    });
    if (!r.ok) { failed++; failures.push(`${label} HTTP${r.status}`); return; }
    const j = await r.json();
    const result = j.result;
    if (!result) { failed++; failures.push(`${label} no_result`); return; }
    const now = new Date().toISOString();
    const { error: uErr } = await c.from('user_words').update({ result_json: result, updated_at: now }).eq('id', word.id);
    if (uErr) { failed++; failures.push(`${label} update: ${uErr.message?.slice(0,60)}`); return; }
    ok++;
  } catch (e) {
    failed++;
    failures.push(`${label} threw: ${e.message?.slice(0, 60)}`);
  } finally {
    done++;
    if (done % 10 === 0 || done === jobs.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${done}/${jobs.length} (ok=${ok} failed=${failed}) elapsed=${elapsed}s`);
    }
  }
}

// Sliding-window concurrency
const queue = [...jobs];
const inflight = new Set();
async function spawn() {
  while (queue.length > 0 && inflight.size < CONCURRENCY) {
    const job = queue.shift();
    const p = processOne(job).finally(() => inflight.delete(p));
    inflight.add(p);
  }
}
spawn();
while (inflight.size > 0) {
  await Promise.race(inflight);
  spawn();
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n=== DONE in ${elapsed}s — total=${jobs.length} ok=${ok} failed=${failed} ===`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
  if (failures.length > 20) console.log(`  ... +${failures.length - 20} more`);
}
