// Batch re-curate the 25 unique TOPIK 1 words flagged by generic-full-audit.
// Reuses _recurate_one.js logic in-process to avoid spawning Node 25×.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = [
  // G4 register
  ['topik-1-part-1', '년'],
  ['topik-1-part-1', '개'],
  ['topik-1-part-3', '면접'],
  ['topik-1-part-3', '고추'],
  // G8 marker_off
  ['topik-1-part-1', '아침'],
  ['topik-1-part-1', '저녁'],
  ['topik-1-part-1', '안'],
  ['topik-1-part-1', '역'],
  ['topik-1-part-1', '팔'],
  ['topik-1-part-3', '김'],
  ['topik-1-part-3', '터미널'],
  ['topik-1-part-3', '도'],
  // G10 borderline (고추 already above)
  ['topik-1-part-2', '코트'],
  // G12 wrong-script syn
  ['topik-1-part-2', '만약'],
  ['topik-1-part-2', '텔레비전'],
  ['topik-1-part-3', '부르다'],
  ['topik-1-part-3', '달러'],
  ['topik-1-part-3', '미터'],
  ['topik-1-part-3', '킬로미터'],
  // G14 duplicate meanings
  ['topik-1-part-1', '공부'],
  ['topik-1-part-2', '답'],
  ['topik-1-part-2', '어리다'],
  ['topik-1-part-3', '걱정'],
  ['topik-1-part-3', '출발'],
  ['topik-1-part-3', '방송'],
];

async function recurateOne(slug, word, listCache) {
  if (!listCache[slug]) {
    const { data: list } = await admin
      .from('curated_wordlists')
      .select('id, source_lang, exam_type, level')
      .eq('slug', slug)
      .single();
    listCache[slug] = list;
  }
  const list = listCache[slug];
  const { data: row } = await admin
    .from('curated_words')
    .select('reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id)
    .eq('word', word)
    .maybeSingle();
  if (!row) return { slug, word, status: 'NOT_FOUND' };

  const proficiencyHint = deriveProficiencyHint(list);
  const targetLangs = Object.keys(row.results_by_target_lang || {});
  const newResults = { ...row.results_by_target_lang };

  for (let i = 0; i < targetLangs.length; i++) {
    const tl = targetLangs[i];
    const r = await admin.functions.invoke('word-lookup-v2', {
      body: {
        word, sourceLang: list.source_lang, targetLang: tl, mode: 'enrich',
        forceFresh: i === 0,
        forceFreshTranslation: i > 0,
        proficiencyHint,
      },
    });
    if (r.error) {
      return { slug, word, status: 'ERROR', lang: tl, error: r.error.message };
    }
    newResults[tl] = r.data?.result ?? newResults[tl];
  }

  await admin.from('curated_words').upsert({
    curated_wordlist_id: list.id,
    word,
    reading_key: row.reading_key ?? '',
    display_order: row.display_order,
    results_by_target_lang: newResults,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });

  return { slug, word, status: 'OK', langs: targetLangs.length };
}

(async () => {
  const listCache = {};
  const results = [];
  console.log(`Re-curating ${TARGETS.length} TOPIK 1 words ×7 langs each...\n`);
  for (let i = 0; i < TARGETS.length; i++) {
    const [slug, word] = TARGETS[i];
    process.stdout.write(`[${i+1}/${TARGETS.length}] ${slug} / ${word} ... `);
    try {
      const r = await recurateOne(slug, word, listCache);
      results.push(r);
      console.log(r.status === 'OK' ? `OK (${r.langs} langs)` : `${r.status}${r.error ? ' — ' + r.error : ''}`);
    } catch (e) {
      results.push({ slug, word, status: 'EXCEPTION', error: e.message });
      console.log(`EXCEPTION — ${e.message}`);
    }
  }
  console.log('\n══ Summary ══');
  const ok = results.filter(r => r.status === 'OK').length;
  const fail = results.filter(r => r.status !== 'OK');
  console.log(`  OK: ${ok}/${results.length}`);
  if (fail.length) {
    console.log(`  Failures:`);
    for (const f of fail) console.log(`    - ${f.slug}/${f.word}: ${f.status}${f.error ? ' — ' + f.error : ''}`);
  }
})();
