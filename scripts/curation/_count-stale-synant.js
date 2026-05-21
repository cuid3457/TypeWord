const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  // word_entries: canonical cache — affected when has_enrich=true but syn+ant both empty.
  const { count: totalEnriched } = await admin.from('word_entries')
    .select('*', { count: 'exact', head: true })
    .eq('has_enrich', true);
  const { count: emptyBoth } = await admin.from('word_entries')
    .select('*', { count: 'exact', head: true })
    .eq('has_enrich', true)
    .eq('synonyms', '{}')
    .eq('antonyms', '{}');
  console.log(`word_entries:`);
  console.log(`  has_enrich=true total       : ${totalEnriched}`);
  console.log(`  has_enrich=true & syn=ant=[]: ${emptyBoth}`);

  // curated_words: sample a few to check the actual stored shape.
  const { data: sample } = await admin.from('curated_words')
    .select('word, results_by_target_lang')
    .limit(3);
  console.log(`\ncurated_words sample:`);
  for (const r of sample || []) {
    const en = r.results_by_target_lang?.en;
    console.log(`  ${r.word.padEnd(8)} en.syn=${(en?.synonyms||[]).length} en.ant=${(en?.antonyms||[]).length}`);
  }
})();
