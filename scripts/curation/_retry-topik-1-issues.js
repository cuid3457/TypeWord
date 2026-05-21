// One-off: force-fresh re-process the 47 unique TOPIK-1 affected words
// (canonical regen + all 10 target translations) to fix structural issues
// (missing examples, meaning-without-example, missing translations).
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = ['de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'zh-CN', 'zh-TW'];

const AFFECTED = {
  'topik-1-part-3': ['그러나'],
};

async function processOne(list, row, hint) {
  const updated = { ...(row.results_by_target_lang || {}) };
  for (let i = 0; i < TARGETS.length; i++) {
    const tl = TARGETS[i];
    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await admin.functions.invoke('word-lookup-v2', {
        body: {
          word: row.word,
          sourceLang: list.source_lang,
          targetLang: tl,
          mode: 'enrich',
          forceFresh: i === 0,
          forceFreshTranslation: i > 0,
          proficiencyHint: hint,
        },
      });
      if (!r.error && r.data?.result) { result = r.data.result; break; }
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
    if (result) updated[tl] = result;
    else console.error(`  ${row.word} → ${tl}: failed after 3 retries`);
  }
  await admin.from('curated_words').upsert({
    curated_wordlist_id: list.id,
    word: row.word,
    reading_key: row.reading_key ?? '',
    display_order: row.display_order,
    results_by_target_lang: updated,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });
}

const WORKERS = 10;

(async () => {
  const tasks = [];
  for (const slug of Object.keys(AFFECTED)) {
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    const hint = deriveProficiencyHint(list);
    for (const w of AFFECTED[slug]) {
      tasks.push({ list, hint, word: w });
    }
  }
  console.log(`Total tasks: ${tasks.length}, workers: ${WORKERS}`);
  let done = 0;
  const started = Date.now();
  const reporter = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(elapsed, 1);
    const eta = (tasks.length - done) / Math.max(rate, 0.01);
    process.stdout.write(`\rprogress: ${done}/${tasks.length} | ${rate.toFixed(2)} words/s | ETA ${(eta/60).toFixed(1)}min   `);
  }, 2000);

  const queue = [...tasks];
  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) break;
      const { data: rows } = await admin
        .from('curated_words')
        .select('word, reading_key, display_order, results_by_target_lang')
        .eq('curated_wordlist_id', t.list.id)
        .eq('word', t.word);
      if (rows && rows[0]) {
        try { await processOne(t.list, rows[0], t.hint); }
        catch (err) { console.error(`\n${t.word}: ${err.message}`); }
      } else {
        console.error(`\n${t.word}: not found in ${t.list.slug}`);
      }
      done++;
    }
  });
  await Promise.all(workers);
  clearInterval(reporter);
  console.log(`\nDone. ${done} words in ${((Date.now()-started)/60000).toFixed(1)} min.`);
})();
