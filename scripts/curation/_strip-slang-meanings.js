// Strips the secondary (slang/vulgar/derogatory) meaning from specified
// curated_words entries across ALL their target_langs. Leaves the primary
// meaning + first example intact.
//
// Operates by trimming r.meanings to [m[0]] and r.examples to those whose
// marker_index === 0 (or first example only).
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = [
  { slug: 'topik-1-part-1', word: '년' },
  { slug: 'topik-1-part-1', word: '개' },
  { slug: 'topik-1-part-3', word: '고추' },
];

(async () => {
  const lists = {};
  for (const slug of [...new Set(TARGETS.map(t => t.slug))]) {
    const { data } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    lists[slug] = data.id;
  }
  for (const t of TARGETS) {
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', lists[t.slug]).eq('word', t.word).single();
    const newResults = {};
    for (const [lang, r] of Object.entries(row.results_by_target_lang || {})) {
      const beforeM = (r.meanings || []).length;
      const beforeE = (r.examples || []).length;
      // Keep only primary meaning
      const keptMeaning = (r.meanings || []).slice(0, 1);
      // Keep only the example for meaning_index = 0 (or first example if no index)
      const keptExamples = (r.examples || []).filter((ex, i) => {
        if (typeof ex.meaning_index === 'number') return ex.meaning_index === 0;
        return i === 0;
      });
      newResults[lang] = {
        ...r,
        meanings: keptMeaning,
        examples: keptExamples.length > 0 ? [keptExamples[0]] : (r.examples || []).slice(0, 1),
      };
      console.log(`  ${t.word} ${lang}: m ${beforeM}→${keptMeaning.length}, e ${beforeE}→${(newResults[lang].examples || []).length}`);
    }
    await admin.from('curated_words').upsert({
      curated_wordlist_id: lists[t.slug],
      word: t.word,
      reading_key: row.reading_key ?? '',
      display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    console.log(`✓ ${t.slug}/${t.word} saved`);
  }
})().catch(e => { console.error(e); process.exit(1); });
