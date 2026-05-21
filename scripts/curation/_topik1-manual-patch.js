// Manual patch for 4 TOPIK 1 words whose register/duplicate issues survived
// re-curation. Only edits meaning.definition fields — examples, synonyms,
// translations untouched.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const PATCHES = [
  { slug: 'topik-1-part-1', word: '년',   lang: 'en',    idx: 1, def: 'bitch' },
  { slug: 'topik-1-part-1', word: '개',   lang: 'en',    idx: 1, def: 'damn, freaking' },
  { slug: 'topik-1-part-1', word: '개',   lang: 'de',    idx: 1, def: 'Schimpfwort' },
  { slug: 'topik-1-part-3', word: '고추', lang: 'en',    idx: 1, def: 'penis' },
  { slug: 'topik-1-part-1', word: '공부', lang: 'zh-CN', idx: 0, def: '学习, 学问' },
  { slug: 'topik-1-part-1', word: '공부', lang: 'zh-CN', idx: 1, def: '学习, 攻读' },
];

(async () => {
  const lists = {};
  // Group by (slug, word) so each row is upserted once
  const rowsToUpdate = {};
  for (const p of PATCHES) {
    if (!lists[p.slug]) {
      const { data } = await admin.from('curated_wordlists').select('id').eq('slug', p.slug).single();
      lists[p.slug] = data.id;
    }
    const key = `${p.slug}::${p.word}`;
    if (!rowsToUpdate[key]) {
      const { data } = await admin.from('curated_words')
        .select('reading_key, display_order, results_by_target_lang')
        .eq('curated_wordlist_id', lists[p.slug]).eq('word', p.word).single();
      rowsToUpdate[key] = { slug: p.slug, word: p.word, row: data, patches: [] };
    }
    rowsToUpdate[key].patches.push(p);
  }

  for (const key of Object.keys(rowsToUpdate)) {
    const { slug, word, row, patches } = rowsToUpdate[key];
    const newResults = { ...row.results_by_target_lang };
    for (const p of patches) {
      const langData = { ...newResults[p.lang] };
      const meanings = [...langData.meanings];
      const before = meanings[p.idx].definition;
      meanings[p.idx] = { ...meanings[p.idx], definition: p.def };
      langData.meanings = meanings;
      newResults[p.lang] = langData;
      console.log(`[${slug}] ${word} ${p.lang} m[${p.idx}]: "${before}" → "${p.def}"`);
    }
    await admin.from('curated_words').upsert({
      curated_wordlist_id: lists[slug],
      word,
      reading_key: row.reading_key ?? '',
      display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    console.log(`  ✓ ${slug}/${word} saved`);
  }
  console.log(`\n${PATCHES.length} patches applied across ${Object.keys(rowsToUpdate).length} rows.`);
})().catch(e => { console.error(e); process.exit(1); });
