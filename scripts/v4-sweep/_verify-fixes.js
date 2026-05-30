// Targeted re-test of categories affected by the 3 fixes.
//   Issue 1 (idiom empty examples): all idiom × all targets
//   Issue 2 (sentence rejection): all long_sentence × all targets
//   Issue 3 (de→zh-CN slowness): full de × zh-CN single-source test
//
// Reports pass/fail per category with expected vs actual.

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const { CORPUS, SOURCE_LANGS } = require('./corpus');

const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function lookup(word, sourceLang, targetLang, mode) {
  const t = Date.now();
  const r = await admin.functions.invoke('word-lookup-v4', {
    body: { word, sourceLang, targetLang, mode, forceFresh: true },
  });
  return { ms: Date.now() - t, error: r.error?.message, result: r.data?.result };
}

async function pool(items, fn, n) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await fn(items[idx]); } catch (e) { console.warn('worker err:', e.message); }
    }
  }));
}

(async () => {
  // ── Issue 1: idioms × all 7 targets per source ──
  console.log('\n══ Issue 1: idiom enrich examples ══');
  const idiomTasks = [];
  for (const sl of SOURCE_LANGS) {
    for (const w of (CORPUS[sl] || []).filter((x) => x.category === 'idiom')) {
      for (const tl of SOURCE_LANGS) {
        if (tl === sl) continue;
        idiomTasks.push({ word: w.word, sl, tl });
      }
    }
  }
  console.log(`Tasks: ${idiomTasks.length}`);
  const idiomResults = [];
  await pool(idiomTasks, async (t) => {
    const r = await lookup(t.word, t.sl, t.tl, 'enrich');
    idiomResults.push({ ...t, ...r });
  }, 12);
  const idiomFail = idiomResults.filter((r) => !r.error && r.result?.meanings?.length > 0 && (r.result?.examples?.length ?? 0) === 0);
  console.log(`Empty examples (meanings>0, examples=0): ${idiomFail.length}/${idiomResults.length}`);
  if (idiomFail.length > 0) {
    console.log('First 10:');
    for (const r of idiomFail.slice(0, 10)) console.log(`  ${r.sl}→${r.tl} | ${r.word}`);
  }

  // ── Issue 2: long sentences × all 7 targets per source ──
  console.log('\n══ Issue 2: long-sentence rejection ══');
  const sentTasks = [];
  for (const sl of SOURCE_LANGS) {
    for (const w of (CORPUS[sl] || []).filter((x) => x.category === 'long_sentence')) {
      for (const tl of SOURCE_LANGS) {
        if (tl === sl) continue;
        sentTasks.push({ word: w.word, sl, tl });
      }
    }
  }
  console.log(`Tasks: ${sentTasks.length}`);
  const sentResults = [];
  await pool(sentTasks, async (t) => {
    const r = await lookup(t.word, t.sl, t.tl, 'quick');
    sentResults.push({ ...t, ...r });
  }, 12);
  const sentFail = sentResults.filter((r) => !r.error && r.result?.note !== 'sentence');
  console.log(`Not rejected as sentence: ${sentFail.length}/${sentResults.length}`);
  if (sentFail.length > 0) {
    console.log('First 10 misclassifications:');
    for (const r of sentFail.slice(0, 10)) {
      console.log(`  ${r.sl}→${r.tl} | note=${r.result?.note || '-'} m=${r.result?.meanings?.length || 0} | ${r.word.slice(0, 40)}`);
    }
  }

  // ── Issue 3: de→zh-CN full corpus stress ──
  console.log('\n══ Issue 3: de→zh-CN performance ══');
  const deTasks = (CORPUS.de || []).filter((w) => !['edge', 'formula', 'long_sentence', 'wrong_lang'].includes(w.category))
    .map((w) => ({ word: w.word, sl: 'de', tl: 'zh-CN' }));
  console.log(`Tasks: ${deTasks.length}`);
  const enrichTimes = [];
  await pool(deTasks, async (t) => {
    await lookup(t.word, t.sl, t.tl, 'quick');
    const r = await lookup(t.word, t.sl, t.tl, 'enrich');
    if (!r.error) enrichTimes.push(r.ms);
  }, 15);
  enrichTimes.sort((a, b) => a - b);
  const p = (k) => enrichTimes[Math.min(enrichTimes.length - 1, Math.floor(k * enrichTimes.length))];
  console.log(`enrich p50/p90/p95/max: ${p(.5)} / ${p(.9)} / ${p(.95)} / ${enrichTimes[enrichTimes.length - 1]} ms`);

  console.log('\n══ Summary ══');
  console.log(`Issue 1 (idioms): ${idiomFail.length === 0 ? '✓ PASS' : '✗ FAIL'} — ${idiomFail.length}/${idiomResults.length} empty`);
  console.log(`Issue 2 (sentences): ${sentFail.length === 0 ? '✓ PASS' : '✗ FAIL'} — ${sentFail.length}/${sentResults.length} not rejected`);
  console.log(`Issue 3 (de→zh-CN): ${p(.95) < 10000 ? '✓ PASS' : '✗ FAIL'} — p95 ${p(.95)}ms (target <10s)`);
})().catch((e) => { console.error('Fatal:', e); process.exit(1); });
