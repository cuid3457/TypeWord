// Smoke test for v4 curation levers (readingHint/proficiencyHint/forceFresh).
// Single-shot — invokes word-lookup-v4 with each lever combination and prints
// the response shape so we can eyeball that nothing's broken before the real
// re-curation batch runs.

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function invoke(label, body) {
  const t0 = Date.now();
  const r = await admin.functions.invoke('word-lookup-v4', { body });
  const ms = Date.now() - t0;
  if (r.error) {
    console.log(`[${label}] ERROR (${ms}ms): ${r.error.message}`);
    return;
  }
  const res = r.data?.result;
  const meanings = Array.isArray(res?.meanings) ? res.meanings : [];
  const examples = Array.isArray(res?.examples) ? res.examples : [];
  console.log(`[${label}] OK ${ms}ms cached=${r.data?.cached} headword="${res?.headword}" reading="${res?.reading ?? ''}" meanings=${meanings.length} examples=${examples.length}`);
  if (meanings[0]) console.log(`  meaning[0]: ${meanings[0].partOfSpeech} — ${meanings[0].definition}`);
  if (examples[0]) console.log(`  example[0]: ${examples[0].sentence}\n              ${examples[0].translation}`);
}

(async () => {
  console.log('== v4 curation lever smoke ==\n');

  // 1. Baseline enrich (no levers) — verifies plain v4 still works under service-role auth.
  await invoke('baseline', { word: '안녕', sourceLang: 'ko', targetLang: 'en', mode: 'enrich' });

  // 2. forceFresh + proficiencyHint — TOPIK 1급 어머니 (mother).
  await invoke('forceFresh+proficiency', {
    word: '어머니', sourceLang: 'ko', targetLang: 'en', mode: 'enrich',
    forceFresh: true, proficiencyHint: 'TOPIK 1급 — beginner Korean (basic 800 words)',
  });

  // 3. forceFreshTranslation second target — should reuse canonical example from #2.
  await invoke('forceFreshTranslation→ja', {
    word: '어머니', sourceLang: 'ko', targetLang: 'ja', mode: 'enrich',
    forceFreshTranslation: true, proficiencyHint: 'TOPIK 1급 — beginner Korean (basic 800 words)',
  });

  // 4. readingHint polysemy — zh-CN 长 (cháng=long vs zhǎng=grow).
  await invoke('readingHint cháng', {
    word: '长', sourceLang: 'zh-CN', targetLang: 'en', mode: 'enrich',
    forceFresh: true, readingHint: 'cháng — long / length',
  });

  console.log('\n== done ==');
})().catch((err) => { console.error('Fatal:', err); process.exit(1); });
