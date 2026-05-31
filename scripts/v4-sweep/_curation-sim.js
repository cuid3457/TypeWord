// End-to-end curation simulation — run curate-wordlist semantics on 10
// HSK 1 words across [ko, en] targets, then dump the result for inspection.
// Mimics what curate-wordlist.js does but only for 10 words.

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WORDS = ['爱', '八', '爸爸', '杯子', '北京', '吃', '电脑', '大', '点', '认识'];
const TARGETS = ['ko', 'en'];
const PROFICIENCY_HINT = 'HSK 1 — first 150 most basic Chinese words';

async function lookup(word, targetLang, isFirstTarget) {
  const body = {
    word, sourceLang: 'zh-CN', targetLang,
    mode: 'enrich',
    proficiencyHint: PROFICIENCY_HINT,
    ...(isFirstTarget ? { forceFresh: true } : { forceFreshTranslation: true }),
  };
  const t0 = Date.now();
  const r = await admin.functions.invoke('word-lookup-v4', { body });
  const ms = Date.now() - t0;
  return { ms, error: r.error?.message, result: r.data?.result };
}

(async () => {
  // Wipe canonical for the 10 words for truly fresh test
  for (const w of WORDS) {
    await admin.from('word_entries').delete().eq('word', w).eq('word_lang', 'zh-CN');
  }
  await new Promise(r => setTimeout(r, 1000));

  console.log('=== Curation simulation: HSK 1 sample (10 words) → [ko, en] ===\n');

  const results = {};
  let totalMs = 0;

  for (const w of WORDS) {
    results[w] = {};
    let firstTarget = true;
    for (const tl of TARGETS) {
      const r = await lookup(w, tl, firstTarget);
      totalMs += r.ms;
      results[w][tl] = r;
      firstTarget = false;
    }
  }

  // Print structured per-word output
  for (const w of WORDS) {
    console.log(`\n━━━ ${w} ━━━`);
    for (const tl of TARGETS) {
      const r = results[w][tl];
      if (r.error) { console.log(`  ${tl}: ERROR ${r.error}`); continue; }
      const res = r.result || {};
      console.log(`  ${tl} (${r.ms}ms):`);
      for (let i = 0; i < (res.meanings || []).length; i++) {
        const m = res.meanings[i];
        console.log(`    [${i}] [${m.partOfSpeech || '-'}] ${m.definition}`);
      }
      for (const ex of (res.examples || [])) {
        console.log(`    ex[m${ex.meaningIndex}]: ${ex.sentence}`);
        console.log(`                  → ${ex.translation}`);
      }
    }
  }

  // Verify cross-target canonical preservation (source sentences MUST match)
  console.log('\n\n=== Cross-target consistency check ===');
  let mismatch = 0;
  for (const w of WORDS) {
    const koSents = (results[w].ko?.result?.examples || []).map(e => e.sentence).sort();
    const enSents = (results[w].en?.result?.examples || []).map(e => e.sentence).sort();
    const sameSents = JSON.stringify(koSents) === JSON.stringify(enSents);
    const koMeaningCount = (results[w].ko?.result?.meanings || []).length;
    const enMeaningCount = (results[w].en?.result?.meanings || []).length;
    const sameMeaningCount = koMeaningCount === enMeaningCount;
    if (!sameSents || !sameMeaningCount) {
      console.log(`  ✗ ${w}: source sentences match=${sameSents}, meaning count ${enMeaningCount}(en)/${koMeaningCount}(ko)`);
      mismatch++;
    } else {
      console.log(`  ✓ ${w}: ${enMeaningCount} meanings, source sentences identical across ko+en`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total words: ${WORDS.length}`);
  console.log(`Total lookups: ${WORDS.length * TARGETS.length}`);
  console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Avg latency: ${(totalMs / (WORDS.length * TARGETS.length)).toFixed(0)}ms`);
  console.log(`Cross-target mismatches: ${mismatch} ${mismatch === 0 ? '✓' : '✗'}`);
})();
