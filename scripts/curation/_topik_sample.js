const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const samples = ['안녕하세요','눈','차','먹다','예쁘다','분','한국'];
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug','topik-1-part-1').single();
  for (const w of samples) {
    const { data: row } = await admin.from('curated_words').select('results_by_target_lang').eq('curated_wordlist_id', list.id).eq('word', w).maybeSingle();
    if (!row) { console.log(`${w}: NOT FOUND`); continue; }
    const r = row.results_by_target_lang.en;
    console.log(`\n━━━ ${w} ━━━`);
    console.log('  IPA:', r.ipa || '(none)');
    console.log('  meanings:');
    (r.meanings||[]).forEach((m,i) => console.log(`    ${i}: ${m.definition} [${m.partOfSpeech||''}]`));
    console.log('  examples:');
    (r.examples||[]).forEach((e,i) => {
      console.log(`    e${i+1}: ${e.sentence}`);
      console.log(`         ${e.translation}`);
    });
    console.log('  syn:', JSON.stringify(r.synonyms||[]));
    console.log('  ant:', JSON.stringify(r.antonyms||[]));
  }
})();
