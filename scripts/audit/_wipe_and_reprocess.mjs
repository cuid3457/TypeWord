// Wipe all AI response caches + re-process all user_words EXCEPT the
// "샘플 검증" books (already on the latest prompt from earlier passes).
//
// Steps:
//   1. Identify user_words NOT in 샘플 검증 books
//   2. Group by (word, source_lang, target_lang) — one LLM call per unique tuple
//   3. Wipe ALL cache: word_entries + word_translations + reverse_lookups + curated_words.results_by_target_lang
//   4. forceFresh re-process each unique tuple (concurrency=5)
//   5. Patch every matching user_word's result_json

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONCURRENCY = 5;

const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

// ── Step 1+2: collect non-sample user_words and group ──
console.log('Step 1: collecting user_words (excluding 샘플 검증)…');
let all = [];
let from = 0;
while (true) {
  const { data, error } = await c
    .from('user_words')
    .select('id, word, book_id, books!inner(title, source_lang, target_lang)')
    .order('id', { ascending: true })
    .range(from, from + 999);
  if (error) { console.error('fetch error:', error); process.exit(1); }
  if (!data || data.length === 0) break;
  all = all.concat(data);
  if (data.length < 1000) break;
  from += 1000;
}
const nonSample = all.filter((w) => !w.books?.title?.startsWith('샘플 검증'));
console.log(`Total user_words: ${all.length}, excluding 샘플 검증: ${nonSample.length}`);

// Group by (word, source_lang, target_lang)
const groups = new Map(); // key → { word, src, tgt, userWordIds: [] }
for (const w of nonSample) {
  const src = w.books?.source_lang;
  const tgt = w.books?.target_lang;
  if (!src || !tgt) continue;
  const key = `${w.word}|${src}|${tgt}`;
  if (!groups.has(key)) groups.set(key, { word: w.word, src, tgt, ids: [] });
  groups.get(key).ids.push(w.id);
}
const jobs = [...groups.values()];
console.log(`Unique (word,src,tgt) groups: ${jobs.length}`);

// ── Step 3: wipe caches ──
console.log('\nStep 3: wiping caches…');

const { count: weBefore } = await c.from('word_entries').select('id', { count: 'exact', head: true });
const { count: wtBefore } = await c.from('word_translations').select('id', { count: 'exact', head: true });
const { count: rvBefore } = await c.from('reverse_lookups').select('id', { count: 'exact', head: true });
console.log(`Before: word_entries=${weBefore}, word_translations=${wtBefore}, reverse_lookups=${rvBefore}`);

// Cascade: word_translations FK to word_entries → delete entries first cascades.
// reverse_lookups is independent.
const { error: rvErr } = await c.from('reverse_lookups').delete().not('id', 'is', null);
if (rvErr) console.error('reverse_lookups wipe:', rvErr); else console.log('  reverse_lookups wiped');

const { error: wtErr } = await c.from('word_translations').delete().not('id', 'is', null);
if (wtErr) console.error('word_translations wipe:', wtErr); else console.log('  word_translations wiped');

const { error: weErr } = await c.from('word_entries').delete().not('id', 'is', null);
if (weErr) console.error('word_entries wipe:', weErr); else console.log('  word_entries wiped');

// curated_words.results_by_target_lang → set to {} (keep row + word membership)
const { error: cwErr } = await c.from('curated_words').update({ results_by_target_lang: {} }).not('id', 'is', null);
if (cwErr) console.error('curated_words.results_by_target_lang wipe:', cwErr); else console.log('  curated_words.results_by_target_lang cleared');

const { count: weAfter } = await c.from('word_entries').select('id', { count: 'exact', head: true });
const { count: wtAfter } = await c.from('word_translations').select('id', { count: 'exact', head: true });
const { count: rvAfter } = await c.from('reverse_lookups').select('id', { count: 'exact', head: true });
console.log(`After: word_entries=${weAfter}, word_translations=${wtAfter}, reverse_lookups=${rvAfter}`);

// ── Step 4+5: forceFresh + patch user_words.result_json ──
console.log(`\nStep 4+5: re-process ${jobs.length} groups (concurrency=${CONCURRENCY})…\n`);
const t0 = Date.now();
let done = 0, ok = 0, failed = 0;
const failures = [];

async function processOne(job) {
  const { word, src, tgt, ids } = job;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sourceLang: src, targetLang: tgt, mode: 'enrich', forceFresh: true }),
    });
    if (!r.ok) { failed++; failures.push(`${word} [${src}→${tgt}] HTTP${r.status}`); return; }
    const j = await r.json();
    const result = j.result;
    if (!result) { failed++; failures.push(`${word} [${src}→${tgt}] no_result`); return; }
    // Patch all user_words sharing this (word,src,tgt) tuple
    const now = new Date().toISOString();
    const { error } = await c.from('user_words').update({ result_json: result, updated_at: now }).in('id', ids);
    if (error) { failed++; failures.push(`${word} update: ${error.message?.slice(0,50)}`); return; }
    ok++;
  } catch (e) {
    failed++;
    failures.push(`${word} threw: ${e.message?.slice(0, 50)}`);
  } finally {
    done++;
    if (done % 25 === 0 || done === jobs.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${done}/${jobs.length} (ok=${ok} failed=${failed}) elapsed=${elapsed}s`);
    }
  }
}

const queue = [...jobs];
const inflight = new Set();
function spawn() {
  while (queue.length > 0 && inflight.size < CONCURRENCY) {
    const job = queue.shift();
    const p = processOne(job).finally(() => inflight.delete(p));
    inflight.add(p);
  }
}
spawn();
while (inflight.size > 0) { await Promise.race(inflight); spawn(); }

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n=== DONE in ${elapsed}s — groups=${jobs.length} ok=${ok} failed=${failed} ===`);
if (failures.length) {
  console.log('\nFailures (first 20):');
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
  if (failures.length > 20) console.log(`  ... +${failures.length - 20} more`);
}
