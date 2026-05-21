// Dump TOPIK TEST v3 across all 7 target_langs for cross-lang inspection.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const LANGS = ['en','ja','zh-CN','es','fr','de','it'];

(async () => {
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', 'topik-test-v3').single();
  for (const word of ['팔','부르다','역','도','김','안','어리다','아침','저녁','위로']) {
    const { data: row } = await admin.from('curated_words').select('results_by_target_lang').eq('curated_wordlist_id', list.id).eq('word', word).maybeSingle();
    if (!row) continue;
    console.log(`\n══════════════ ${word} ══════════════`);
    for (const lang of LANGS) {
      const r = row.results_by_target_lang?.[lang];
      if (!r) continue;
      console.log(`\n  ── [${lang}] ──`);
      console.log(`    meanings:`);
      for (let i = 0; i < (r.meanings||[]).length; i++) console.log(`      m[${i}] [${r.meanings[i].partOfSpeech}] ${r.meanings[i].definition}`);
      console.log(`    examples:`);
      for (const ex of (r.examples||[])) console.log(`      S: ${ex.sentence}\n      T: ${ex.translation}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
