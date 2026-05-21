// Force-fresh re-process affected TOEIC 600 part-2/3 words.
// Detects hallucinations (note=non_word/sentence) and removes them.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = ['ko','ja','zh-CN','es','fr','de','it'];

const AFFECTED = {
  'toeic-600-part-2': ['panel','presentation','division','furnish','edit','offline','trial','admission','communication','complaint','demonstration','finance department','note','paper','previous'],
  'toeic-600-part-3': ['zoom meeting','seminar room','outsource partner','equipment list','quotation form','scanner device','send out'],
};

async function regenerate(list, row, hint) {
  const updated = { ...(row.results_by_target_lang || {}) };
  let isHallucination = false;
  for (let i = 0; i < TARGETS.length; i++) {
    const tl = TARGETS[i];
    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await admin.functions.invoke('word-lookup-v2', {
        body: {
          word: row.word, sourceLang: 'en', targetLang: tl,
          mode: 'enrich', forceFresh: i === 0, forceFreshTranslation: i > 0,
          proficiencyHint: hint,
        },
      });
      if (!r.error && r.data?.result) {
        const res = r.data.result;
        if (res.note === 'non_word' || res.note === 'sentence' || !res.meanings?.length) {
          if (i === 0) { isHallucination = true; }
          break;
        }
        result = res;
        break;
      }
      if (attempt < 3) await new Promise(rs => setTimeout(rs, 2000));
    }
    if (isHallucination) return { hallucinated: true };
    if (result) updated[tl] = result;
  }
  await admin.from('curated_words').update({ results_by_target_lang: updated }).eq('id', row.id);
  return { ok: true };
}

(async () => {
  const tasks = [];
  for (const slug of Object.keys(AFFECTED)) {
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    const hint = deriveProficiencyHint(list);
    for (const w of AFFECTED[slug]) tasks.push({ slug, list, hint, word: w });
  }
  console.log('Tasks:', tasks.length);

  const WORKERS = 5;
  const queue = [...tasks];
  const hallucinations = [];
  let done = 0;

  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) break;
      const { data: rows } = await admin.from('curated_words').select('id, word, reading_key, display_order, results_by_target_lang').eq('curated_wordlist_id', t.list.id).eq('word', t.word);
      if (!rows || !rows[0]) { done++; continue; }
      try {
        const res = await regenerate(t.list, rows[0], t.hint);
        if (res.hallucinated) {
          hallucinations.push({ slug: t.slug, word: t.word, id: rows[0].id });
          console.log('HALLUCINATION:', t.slug, t.word);
        } else if (res.ok) console.log('OK:', t.slug, t.word);
      } catch (err) {
        console.log('ERR:', t.slug, t.word, err.message);
      }
      done++;
    }
  });
  await Promise.all(workers);

  for (const h of hallucinations) {
    await admin.from('curated_words').delete().eq('id', h.id);
    console.log('DELETED:', h.slug, h.word);
  }
  console.log('Done. Hallucinations:', hallucinations.length);
})();
