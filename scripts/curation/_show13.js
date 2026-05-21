const fs = require('fs');
const r = JSON.parse(fs.readFileSync('scripts/curation/lint-curated-report.json', 'utf8'));
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  for (const f of r.flags) {
    // Get list source_lang
    const { data: list } = await admin.from('curated_wordlists').select('id, source_lang').eq('slug', f.slug).single();
    const { data: row } = await admin.from('curated_words')
      .select('results_by_target_lang').eq('curated_wordlist_id', list.id).eq('word', f.word).maybeSingle();
    if (!row) continue;
    const r2 = row.results_by_target_lang[f.lang];
    console.log(`\n━━━ [${f.slug}] ${f.word} (${list.source_lang}→${f.lang}) ━━━`);
    f.issues.forEach(i => console.log(`  ⚠ ${i}`));
    console.log('  meanings:');
    (r2.meanings || []).forEach((m, i) => console.log(`    ${i}: ${m.definition} [${m.partOfSpeech || ''}]`));
    console.log('  examples:');
    (r2.examples || []).forEach((e, i) => {
      console.log(`    e${i+1}: ${e.sentence}`);
      console.log(`         ${e.translation}`);
    });
    console.log('  syn:', JSON.stringify(r2.synonyms || []));
    console.log('  ant:', JSON.stringify(r2.antonyms || []));
  }
})();
