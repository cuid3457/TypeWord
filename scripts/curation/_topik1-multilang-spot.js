const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = [
  {slug: 'topik-1-part-1', word: '아침'},
  {slug: 'topik-1-part-1', word: '역'},
  {slug: 'topik-1-part-3', word: '도'},
  {slug: 'topik-1-part-2', word: '어리다'},
];

async function main() {
  const lists = {};
  for (const slug of [...new Set(TARGETS.map(t=>t.slug))]) {
    const { data } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    lists[slug] = data.id;
  }
  for (const t of TARGETS) {
    const { data } = await admin.from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', lists[t.slug])
      .eq('word', t.word)
      .single();
    console.log(`\n══════════ ${t.word} ══════════`);
    for (const lang of ['ja','zh-CN','es','fr','de','it']) {
      const r = data.results_by_target_lang?.[lang];
      if (!r) continue;
      console.log(`\n  [${lang}]`);
      console.log('    meanings:');
      for (const m of r.meanings || []) {
        console.log(`      - [${m.partOfSpeech}] ${m.definition}`);
      }
    }
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
