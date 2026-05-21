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

(async () => {
  const out = [];
  for (const slug of SLUGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    if (!list) continue;
    const { data: rows } = await admin.from('curated_words')
      .select('word, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).order('display_order');
    for (const r of rows ?? []) {
      const en = r.results_by_target_lang?.en;
      const m = en?.meanings?.[0];
      out.push({
        slug: slug.replace('topik-', 'T'),
        idx: r.display_order,
        w: r.word,
        d: m?.definition ?? '?',
        p: m?.partOfSpeech ?? '?',
      });
    }
  }
  // Write compact CSV-like for review
  const lines = out.map(e => `${e.slug}|${e.idx}|${e.w}|${e.d}|${e.p}`);
  fs.writeFileSync('/tmp/wordlist-1800.txt', lines.join('\n'));
  console.log(`Total: ${out.length}`);
  console.log(`File: /tmp/wordlist-1800.txt (${(lines.join('\n').length / 1024).toFixed(1)} KB)`);
})();
