const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const SLUGS = ['topik-1-part-1', 'topik-1-part-2', 'topik-2-part-1'];
  const ROWS_PER_SLUG = 30;
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).order('display_order').limit(ROWS_PER_SLUG);
    console.log(`\n=== ${slug} ===`);
    for (const r of rows) {
      const en = r.results_by_target_lang?.en;
      if (!en) continue;
      const syn = (en.synonyms || []).join(', ') || '—';
      const ant = (en.antonyms || []).join(', ') || '—';
      const def = (en.meanings || []).map(m => m.definition).join(' / ');
      console.log(`${r.word.padEnd(12)} [${def}]`);
      console.log(`  syn: ${syn}`);
      console.log(`  ant: ${ant}`);
    }
  }
})();
