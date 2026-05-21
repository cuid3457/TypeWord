// Dump 아침/저녁 across v2 (topik-1-part-1), v1 (topik-test), v3 (topik-test-v3)
// for side-by-side terminal comparison.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const WORDS = ['아침', '저녁', '역', '위로'];

(async () => {
  const slugs = ['topik-1-part-1', 'topik-test', 'topik-test-v3'];
  const lists = {};
  for (const s of slugs) {
    const { data } = await admin.from('curated_wordlists').select('id').eq('slug', s).single();
    if (data) lists[s] = data.id;
  }

  for (const word of WORDS) {
    console.log(`\n══════════ ${word} ══════════`);
    for (const slug of slugs) {
      if (!lists[slug]) continue;
      const { data: row } = await admin.from('curated_words')
        .select('results_by_target_lang')
        .eq('curated_wordlist_id', lists[slug])
        .eq('word', word)
        .maybeSingle();
      if (!row) continue;
      const r = row.results_by_target_lang?.en;
      if (!r) continue;
      const label = slug === 'topik-1-part-1' ? 'v2 (current)' : slug === 'topik-test' ? 'v1 (archived)' : 'v3 (new)';
      console.log(`\n  ── ${label} ──`);
      console.log(`    meanings:`);
      for (let i = 0; i < (r.meanings || []).length; i++) {
        console.log(`      [${i}] [${r.meanings[i].partOfSpeech}] ${r.meanings[i].definition}`);
      }
      console.log(`    examples:`);
      for (const ex of (r.examples || [])) {
        const mi = ex.meaning_index !== undefined ? `mi=${ex.meaning_index}` : 'mi=?';
        console.log(`      ${mi}  S: ${ex.sentence}`);
        console.log(`             T: ${ex.translation}`);
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
