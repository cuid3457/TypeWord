const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = [
  ['topik-1-part-1', '년'],
  ['topik-1-part-1', '개'],
  ['topik-1-part-3', '고추'],
  ['topik-1-part-1', '공부'],
];

(async () => {
  const lists = {};
  for (const slug of [...new Set(TARGETS.map(t=>t[0]))]) {
    const { data } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    lists[slug] = data.id;
  }
  for (const [slug, word] of TARGETS) {
    const { data } = await admin.from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', lists[slug]).eq('word', word).single();
    console.log(`\n══════════ ${word} [${slug}] ══════════`);
    for (const lang of ['en','ja','zh-CN','es','fr','de','it']) {
      const r = data.results_by_target_lang?.[lang];
      if (!r) continue;
      console.log(`\n  [${lang}] meanings:`);
      for (let i = 0; i < (r.meanings || []).length; i++) {
        const m = r.meanings[i];
        console.log(`    m[${i}] [${m.partOfSpeech}] ${m.definition}`);
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
