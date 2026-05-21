// Retry refresh for 6 bare-noun stragglers; up to 3 attempts each lang.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const WORDS = ['문화', '거리', '필요', '쓰기', '예약', '중요'];
const LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

async function fetchListForWord(word) {
  const { data } = await admin.from('curated_words').select('curated_wordlist_id').eq('word', word).limit(1).maybeSingle();
  if (!data) return null;
  const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('id', data.curated_wordlist_id).single();
  return list;
}

async function attemptOne(word, list, targetLang, isFirst) {
  const body = { word, sourceLang: 'ko', targetLang, mode: 'enrich', proficiencyHint: deriveProficiencyHint(list) };
  if (isFirst) body.forceFresh = true; else body.forceFreshTranslation = true;
  const { data, error } = await admin.functions.invoke('word-lookup-v2', { body });
  if (error) throw new Error(error.message);
  const result = data?.result;
  if (!result || result.note) return null;
  return result;
}

async function reprocessLang(word, list, targetLang, isFirst, maxAttempts = 3) {
  let lastResult = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await attemptOne(word, list, targetLang, attempt === 0 ? isFirst : false);
      if (result && (result.examples || []).length > 0) {
        lastResult = result;
        break;
      }
      lastResult = result;
    } catch (e) { /* continue */ }
  }
  if (!lastResult) return { status: 'NULL' };

  const { data: row } = await admin.from('curated_words')
    .select('reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id).eq('word', word).single();
  if (!row) return { status: 'ROW_MISSING' };
  const newResults = { ...(row.results_by_target_lang || {}), [targetLang]: lastResult };
  await admin.from('curated_words').upsert({
    curated_wordlist_id: list.id, word, reading_key: row.reading_key ?? '', display_order: row.display_order,
    results_by_target_lang: newResults,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });
  return { status: 'OK', exCount: (lastResult.examples || []).length };
}

(async () => {
  for (const word of WORDS) {
    const list = await fetchListForWord(word);
    if (!list) { console.log(`! ${word} list not found`); continue; }
    const results = [];
    for (let i = 0; i < LANGS.length; i++) {
      const r = await reprocessLang(word, list, LANGS[i], i === 0);
      results.push(`${LANGS[i]}:${r.status === 'OK' ? r.exCount + 'ex' : r.status}`);
    }
    console.log(`${word.padEnd(10)} ${results.join(' ')}`);
  }
})();
