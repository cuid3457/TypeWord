const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const SLUGS = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3', 'topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3'];
  const LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];
  let total = 0, emptyBoth = 0, hasSyn = 0, hasAnt = 0;
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { data: rows } = await admin.from('curated_words').select('word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of rows) {
      for (const lang of LANGS) {
        const x = r.results_by_target_lang?.[lang];
        if (!x) continue;
        total++;
        const s = (x.synonyms || []).length;
        const a = (x.antonyms || []).length;
        if (s === 0 && a === 0) emptyBoth++;
        if (s > 0) hasSyn++;
        if (a > 0) hasAnt++;
      }
    }
  }
  console.log(`Total target_lang entries:    ${total}`);
  console.log(`  with synonyms (≥1):         ${hasSyn}  (${(hasSyn/total*100).toFixed(1)}%)`);
  console.log(`  with antonyms (≥1):         ${hasAnt}  (${(hasAnt/total*100).toFixed(1)}%)`);
  console.log(`  empty both (legit no-pair): ${emptyBoth}  (${(emptyBoth/total*100).toFixed(1)}%)`);
})();
