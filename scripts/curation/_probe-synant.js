const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const tests = [
    { word: 'happy', sourceLang: 'en', targetLang: 'ko' },
    { word: '행복하다', sourceLang: 'ko', targetLang: 'en' },
    { word: '楽しい', sourceLang: 'ja', targetLang: 'en' },
  ];
  for (const t of tests) {
    console.log(`\n=== ${t.word} (${t.sourceLang} → ${t.targetLang}) ===`);
    // Step 1: quick
    const { data: q } = await admin.functions.invoke('word-lookup-v2', {
      body: { ...t, mode: 'quick', forceFresh: true },
    });
    console.log('quick:', { meanings: (q?.result?.meanings||[]).length, examples: (q?.result?.examples||[]).length, syn: (q?.result?.synonyms||[]).length, ant: (q?.result?.antonyms||[]).length });
    // Step 2: enrich
    const { data: e } = await admin.functions.invoke('word-lookup-v2', {
      body: { ...t, mode: 'enrich' },
    });
    console.log('enrich:', { meanings: (e?.result?.meanings||[]).length, examples: (e?.result?.examples||[]).length, syn: (e?.result?.synonyms||[]).length, ant: (e?.result?.antonyms||[]).length });
    console.log('  syn:', e?.result?.synonyms);
    console.log('  ant:', e?.result?.antonyms);
  }
})();
