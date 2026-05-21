// One-off: re-curate a single (slug, word) with proficiencyHint applied.
// Usage: node scripts/curation/_recurate_one.js hsk-2 正在
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  const slug = process.argv[2];
  const word = process.argv[3];
  if (!slug || !word) {
    console.error('Usage: node _recurate_one.js <slug> <word>');
    process.exit(1);
  }
  const { data: list } = await admin
    .from('curated_wordlists')
    .select('id, source_lang, exam_type, level')
    .eq('slug', slug)
    .single();
  const { data: row } = await admin
    .from('curated_words')
    .select('reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id)
    .eq('word', word)
    .maybeSingle();
  const proficiencyHint = deriveProficiencyHint(list);
  console.log(`hint: ${proficiencyHint}`);
  const targetLangs = Object.keys(row.results_by_target_lang || {});
  const newResults = { ...row.results_by_target_lang };
  for (let i = 0; i < targetLangs.length; i++) {
    const tl = targetLangs[i];
    // v2: single enrich call returns full result (meanings + examples + syn/ant + translations).
    // forceFresh ONLY on the first iteration — canonical gets regenerated
    // once, then subsequent target_langs reuse it (just retranslate). Without
    // this, each iteration overwrites the canonical with new examples,
    // breaking cross-target consistency.
    const r = await admin.functions.invoke('word-lookup-v2', {
      body: {
        word, sourceLang: list.source_lang, targetLang: tl, mode: 'enrich',
        // First iteration: regenerate canonical + translation.
        // Subsequent iterations: keep canonical (just-saved), refresh translation only.
        forceFresh: i === 0,
        forceFreshTranslation: i > 0,
        proficiencyHint,
      },
    });
    if (r.error) throw new Error(r.error.message);
    newResults[tl] = r.data?.result ?? newResults[tl];
    console.log(`\n[${tl}] meanings:`);
    (newResults[tl].meanings || []).forEach((m, i) => console.log(`  ${i}: ${m.definition} [${m.partOfSpeech}]`));
    console.log(`[${tl}] examples:`);
    (newResults[tl].examples || []).forEach((ex, i) => {
      console.log(`  e${i+1}: ${ex.sentence}`);
      console.log(`        → ${ex.translation}`);
    });
  }
  await admin.from('curated_words').upsert({
    curated_wordlist_id: list.id,
    word,
    reading_key: row.reading_key ?? '',
    display_order: row.display_order,
    results_by_target_lang: newResults,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });
  console.log('\n✓ saved');
})();
