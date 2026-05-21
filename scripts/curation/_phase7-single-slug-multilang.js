// Single-slug × 7-lang reprocess (sample for prompt change validation).
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = process.argv[2] || 'topik-1-part-1';
const TARGET_LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

async function processOne(word, listMeta, targetLang, isFirst) {
  try {
    const body = { word, sourceLang: 'ko', targetLang, mode: 'enrich', proficiencyHint: deriveProficiencyHint(listMeta) };
    if (isFirst) body.forceFresh = true; else body.forceFreshTranslation = true;
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
      curated_wordlist_id: listMeta.id, word, reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    return { status: 'OK' };
  } catch (e) { return { status: 'ERROR', error: e.message }; }
}

async function processLang(list, words, targetLang, isFirst, concurrency = 12) {
  let idx = 0, ok = 0, nw = 0, er = 0;
  const total = words.length;
  async function worker() {
    while (true) {
      const my = idx++;
      if (my >= words.length) return;
      const r = await processOne(words[my], list, targetLang, isFirst);
      if (r.status === 'OK') { ok++; if (my % 50 === 0) console.log(`  [${targetLang} ${my+1}/${total}] ✓`); }
      else if (r.status === 'NON_WORD') nw++;
      else er++;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { ok, nw, er };
}

(async () => {
  const { data: list } = await admin.from('curated_wordlists')
    .select('id, slug, source_lang, exam_type, level').eq('slug', SLUG).single();
  if (!list) { console.log(`! list ${SLUG} not found`); return; }
  const { data: rows } = await admin.from('curated_words')
    .select('word').eq('curated_wordlist_id', list.id).order('display_order');
  const words = (rows || []).map(r => r.word);
  console.log(`══ ${SLUG} (${words.length} words × ${TARGET_LANGS.length} langs) ══\n`);
  for (let i = 0; i < TARGET_LANGS.length; i++) {
    const lang = TARGET_LANGS[i];
    console.log(`\n--- ${lang} (${i === 0 ? 'forceFresh' : 'forceFreshTranslation'}) ---`);
    const r = await processLang(list, words, lang, i === 0, 12);
    console.log(`  → ${r.ok} OK / ${r.nw} non_word / ${r.er} error`);
  }
})();
