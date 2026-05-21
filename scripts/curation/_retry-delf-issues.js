// Force-fresh affected DELF words. Detect and remove hallucinations.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const AFFECTED = {
  'delf-a1-part-1': ['la','vendredi','mais','elles','samedi'],
  'delf-a1-part-2': ['lettre'],
  'delf-a1-part-3': ['bonjourner','quelque part'],
  'delf-a2-part-1': ['pire'],
  'delf-a2-part-3': ['pendant que','plutôt que'],
  'delf-b1-part-1': ['harcèlement','développement'],
  'delf-b1-part-4': ['aveu'],
  'delf-b1-part-5': ['à ce propos','en ce qui concerne','du coup','pour autant','de ce fait','en dépit de','pour résumer','à cet égard','réflexionner'],
};

async function processOne(list, row, hint) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await admin.functions.invoke('word-lookup-v2', {
      body: {
        word: row.word, sourceLang: 'fr', targetLang: 'ko',
        mode: 'enrich', forceFresh: true, proficiencyHint: hint,
      },
    });
    if (r.error) {
      if (attempt < 3) await new Promise(rs => setTimeout(rs, 2000));
      continue;
    }
    const result = r.data?.result;
    if (!result) continue;
    // Detect hallucination (note=non_word or empty meanings)
    if (result.note === 'non_word' || !Array.isArray(result.meanings) || result.meanings.length === 0) {
      return { ok: false, hallucinated: true };
    }
    // Save
    const updated = { ...(row.results_by_target_lang || {}) };
    updated.ko = result;
    await admin.from('curated_words').update({ results_by_target_lang: updated }).eq('id', row.id);
    return { ok: true };
  }
  return { ok: false, hallucinated: false };
}

(async () => {
  const tasks = [];
  for (const slug of Object.keys(AFFECTED)) {
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    const hint = deriveProficiencyHint(list);
    for (const w of AFFECTED[slug]) tasks.push({ slug, list, hint, word: w });
  }
  console.log('Total:', tasks.length);

  const WORKERS = 5;
  const queue = [...tasks];
  const hallucinations = [];
  let done = 0;

  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) break;
      const { data: rows } = await admin.from('curated_words').select('id, word, reading_key, display_order, results_by_target_lang').eq('curated_wordlist_id', t.list.id).eq('word', t.word);
      if (!rows || !rows[0]) { console.log('NOT FOUND', t.slug, t.word); done++; continue; }
      const res = await processOne(t.list, rows[0], t.hint);
      if (res.hallucinated) {
        hallucinations.push({ slug: t.slug, word: t.word, id: rows[0].id });
        console.log('HALLUCINATION:', t.slug, t.word);
      } else if (res.ok) {
        console.log('OK:', t.slug, t.word);
      } else {
        console.log('FAIL:', t.slug, t.word);
      }
      done++;
    }
  });
  await Promise.all(workers);

  // Remove hallucinations from curated_words
  for (const h of hallucinations) {
    await admin.from('curated_words').delete().eq('id', h.id);
    console.log('DELETED:', h.slug, h.word);
  }

  console.log('\nDone. Hallucinations deleted:', hallucinations.length);
})();
