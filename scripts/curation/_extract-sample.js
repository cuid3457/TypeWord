const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUGS = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3', 'topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3'];
const SAMPLE_SIZE = parseInt(process.argv[2] || '100', 10);

(async () => {
  const allEntries = [];
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    if (!list) continue;
    const { data: rows } = await admin.from('curated_words')
      .select('word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of (rows || [])) {
      const en = r.results_by_target_lang?.en;
      if (!en) continue;
      allEntries.push({
        slug, word: r.word,
        note: en.note || null,
        meanings: (en.meanings || []).map(m => ({ d: m.definition, p: m.partOfSpeech })),
        examples: (en.examples || []).map(ex => ({ s: ex.sentence, t: ex.translation, mi: ex.meaningIndex })),
      });
    }
  }
  for (let i = allEntries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allEntries[i], allEntries[j]] = [allEntries[j], allEntries[i]];
  }
  const sample = allEntries.slice(0, SAMPLE_SIZE);
  fs.writeFileSync('/tmp/sample.json', JSON.stringify(sample, null, 2));
  console.log(`Total: ${allEntries.length}, sampled: ${sample.length}`);
})();
