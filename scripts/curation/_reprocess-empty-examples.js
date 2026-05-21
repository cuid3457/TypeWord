// Reprocess empty-examples words across all 7 langs.
// Uses fallback regen logic in word-lookup-v2 (now deployed).
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGET_LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

async function reprocessOne(slug, word, listMeta, targetLang, isFirstLang) {
  const proficiencyHint = deriveProficiencyHint(listMeta);
  try {
    const body = {
      word, sourceLang: 'ko', targetLang, mode: 'enrich',
      proficiencyHint,
    };
    if (isFirstLang) body.forceFresh = true;
    else body.forceFreshTranslation = true;
    const { data, error } = await admin.functions.invoke('word-lookup-v2', { body });
    if (error) throw new Error(error.message);
    const result = data?.result;
    if (!result || result.note) return { status: 'NON_WORD' };

    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', listMeta.id).eq('word', word).single();
    if (!row) return { status: 'ROW_MISSING' };
    const newResults = { ...(row.results_by_target_lang || {}), [targetLang]: result };
    await admin.from('curated_words').upsert({
      curated_wordlist_id: listMeta.id, word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    const exCount = (result.examples || []).length;
    return { status: 'OK', exCount };
  } catch (e) { return { status: 'ERROR', error: e.message }; }
}

(async () => {
  // Read suspects.json
  const suspects = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'suspects.json'), 'utf8'));
  const wordsBySlug = {};
  for (const s of suspects.emptyExamples) {
    if (!wordsBySlug[s.slug]) wordsBySlug[s.slug] = new Set();
    wordsBySlug[s.slug].add(s.word);
  }
  const uniqueWordCount = new Set(suspects.emptyExamples.map(s => s.word)).size;
  console.log(`Reprocessing ${uniqueWordCount} unique words across ${TARGET_LANGS.length} langs...\n`);

  const allFails = [];
  for (const [slug, wordSet] of Object.entries(wordsBySlug)) {
    const words = Array.from(wordSet);
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    if (!list) continue;
    console.log(`\n══ ${slug} (${words.length} words) ══`);
    for (const word of words) {
      const langResults = [];
      for (let i = 0; i < TARGET_LANGS.length; i++) {
        const lang = TARGET_LANGS[i];
        const r = await reprocessOne(slug, word, list, lang, i === 0);
        langResults.push(`${lang}:${r.status === 'OK' ? r.exCount + 'ex' : r.status}`);
        if (r.status !== 'OK' || r.exCount === 0) {
          allFails.push({ word, slug, lang, status: r.status, exCount: r.exCount });
        }
      }
      console.log(`  ${word.padEnd(15)} ${langResults.join(' ')}`);
    }
  }
  console.log(`\n\n══ Fails (still empty/error): ${allFails.length} ══`);
  for (const f of allFails.slice(0, 30)) {
    console.log(`  ${f.word} (${f.lang}): ${f.status} ${f.exCount ?? ''}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
