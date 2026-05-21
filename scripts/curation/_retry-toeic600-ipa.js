// Force-fresh re-process TOEIC 600 words missing IPA. The v6 prompt
// marks IPA as MANDATORY for English single-word non-expression
// headwords — failures are LLM dropping the field, not a real schema
// issue. Retry with forceFresh and the prompt's final verification
// usually surfaces the IPA on the second try.
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
  'toeic-600-part-1': ['overseas','annual','training'],
  'toeic-600-part-2': ['hiring','incoming','filing','seating','quotation','budgeting','identification','onboarding','part-time'],
  'toeic-600-part-3': ['security','consolidation','itemization','expiration','offering','departmental','double-check','entry-level','forwarding','follow-up','monitoring','multifunction','self-employed'],
};

async function regenerate(list, row, hint) {
  const updated = { ...(row.results_by_target_lang || {}) };
  for (let i = 0; i < TARGETS.length; i++) {
    const tl = TARGETS[i];
    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await admin.functions.invoke('word-lookup-v2', {
        body: { word: row.word, sourceLang: 'en', targetLang: tl, mode: 'enrich', forceFresh: i === 0, forceFreshTranslation: i > 0, proficiencyHint: hint },
      });
      if (!r.error && r.data?.result) {
        const res = r.data.result;
        // IPA is the goal — accept even if other fields look fine
        if (i === 0 && (!res.ipa || !res.ipa.trim())) {
          if (attempt < 3) { await new Promise(rs => setTimeout(rs, 1500)); continue; }
        }
        result = res;
        break;
      }
      if (attempt < 3) await new Promise(rs => setTimeout(rs, 1500));
    }
    if (result) updated[tl] = result;
  }
  await admin.from('curated_words').update({ results_by_target_lang: updated }).eq('id', row.id);
  return updated;
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
  let done = 0;

  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) break;
      const { data: rows } = await admin.from('curated_words').select('id, word, reading_key, display_order, results_by_target_lang').eq('curated_wordlist_id', t.list.id).eq('word', t.word);
      if (rows && rows[0]) {
        try {
          const updated = await regenerate(t.list, rows[0], t.hint);
          const ipa = updated.ko?.ipa;
          console.log(t.slug, t.word, 'ipa:', ipa || 'STILL MISSING');
        } catch (err) { console.log('ERR:', t.slug, t.word, err.message); }
      }
      done++;
    }
  });
  await Promise.all(workers);
})();
