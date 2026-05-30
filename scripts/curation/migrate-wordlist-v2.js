// migrate-wordlist-v2.js
// ────────────────────────────────────────────────────────────────────────────
// Re-curate every word in a curated_wordlist via the v2 endpoint, then
// upsert the per-target results into curated_words.results_by_target_lang.
//
// This:
//   • Refreshes content with the latest v2 prompt rules (always-simple
//     examples, deterministic POS, etc.)
//   • Populates v2's word_entries / word_translations caches as a side
//     effect (because v2 saves canonical + translation on every call)
//   • Lets a single wordlist expand its target_lang coverage in one pass
//     (e.g. TOEIC 600 currently has ko-only — add ja + fr in this run)
//
// Usage:
//   node scripts/curation/migrate-wordlist-v2.js --slug=toeic-600 --targets=ko,ja,fr [--workers=10]
// ────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

function arg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}

const SLUG = arg('slug');
const TARGETS = (arg('targets') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const WORKERS = parseInt(arg('workers', '10'), 10);

if (!SLUG || TARGETS.length === 0) {
  console.error('Usage: node migrate-wordlist-v2.js --slug=<slug> --targets=ko,ja,fr [--workers=10]');
  process.exit(1);
}

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function processOneWord(list, row, proficiencyHint) {
  const word = row.word;
  const existing = row.results_by_target_lang || {};
  const updated = { ...existing };

  for (let i = 0; i < TARGETS.length; i++) {
    const tl = TARGETS[i];
    // First iteration regenerates canonical + translation; later iterations
    // reuse the just-saved canonical and refresh translation only.
    const r = await admin.functions.invoke('word-lookup-v4', {
      body: {
        word,
        sourceLang: list.source_lang,
        targetLang: tl,
        mode: 'enrich',
        forceFresh: i === 0,
        forceFreshTranslation: i > 0,
        proficiencyHint,
      },
    });
    if (r.error) {
      console.error(`  ${word} → ${tl}: ${r.error.message}`);
      continue;
    }
    if (r.data?.result) updated[tl] = r.data.result;
  }

  await admin.from('curated_words').upsert({
    curated_wordlist_id: list.id,
    word,
    reading_key: row.reading_key ?? '',
    display_order: row.display_order,
    results_by_target_lang: updated,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });
}

(async () => {
  const { data: list, error: listErr } = await admin
    .from('curated_wordlists')
    .select('id, slug, source_lang, exam_type, level')
    .eq('slug', SLUG)
    .single();
  if (listErr || !list) {
    console.error(`Wordlist not found: ${SLUG}`);
    process.exit(1);
  }

  const proficiencyHint = deriveProficiencyHint(list);
  console.log(`List: ${list.slug} (${list.source_lang} → ${TARGETS.join(', ')})`);
  console.log(`Proficiency hint: ${proficiencyHint}`);

  const { data: words } = await admin
    .from('curated_words')
    .select('word, reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id)
    .order('display_order');
  console.log(`Total words: ${words.length}`);
  console.log(`Workers: ${WORKERS}`);
  console.log('');

  const queue = [...words];
  let done = 0;
  const started = Date.now();
  const reporter = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(elapsed, 1);
    const eta = (words.length - done) / Math.max(rate, 0.01);
    process.stdout.write(`\rprogress: ${done}/${words.length} | ${rate.toFixed(1)} words/s | ETA ${(eta / 60).toFixed(1)}min   `);
  }, 3000);

  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) break;
      try {
        await processOneWord(list, row, proficiencyHint);
      } catch (err) {
        console.error(`\nerror on "${row.word}": ${err.message}`);
      }
      done++;
    }
  });
  await Promise.all(workers);
  clearInterval(reporter);

  const elapsed = (Date.now() - started) / 1000;
  console.log(`\nDone. ${done} words in ${(elapsed / 60).toFixed(1)} min.`);
})();
