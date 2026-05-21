// Final 5 words fix.
// 표현: 7 lang manual override (이전 manual override script와 동일 패턴)
// 돌아가다/다녀오다/돌아오다/갔다오다: es만 forceFresh enrich
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Manual: 표현
const MANUAL = {
  word: '표현', slug: 'topik-2-part-3',
  targetDefs: {
    en: 'expression, representation', ja: '表現', 'zh-CN': '表达',
    es: 'expresión', fr: 'expression', de: 'Ausdruck', it: 'espressione',
  },
  pos: { en: 'noun', ja: '名詞', 'zh-CN': '名词', es: 'sustantivo', fr: 'nom', de: 'Nomen', it: 'nome' },
  example: {
    source: '그는 다양한 **표현**을 사용한다.', mi: 0,
    translations: {
      en: 'He uses various expressions.',
      ja: '彼は様々な表現を使う。',
      'zh-CN': '他使用各种表达。',
      es: 'Él usa diversas expresiones.',
      fr: 'Il utilise diverses expressions.',
      de: 'Er benutzt verschiedene Ausdrücke.',
      it: 'Lui usa varie espressioni.',
    },
  },
};

// Auto reprocess: 4 words, es only
const AUTO_REPROC = [
  { word: '돌아가다', slug: 'topik-2-part-2' },
  { word: '다녀오다', slug: 'topik-1-part-2' },
  { word: '돌아오다', slug: 'topik-1-part-2' },
  { word: '갔다오다', slug: 'topik-1-part-2' },
];

const LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

async function applyManual() {
  const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', MANUAL.slug).single();
  const { data: row } = await admin.from('curated_words')
    .select('reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id).eq('word', MANUAL.word).single();
  if (!row) { console.log(`  ! ${MANUAL.word} row not found`); return; }
  const newResults = { ...(row.results_by_target_lang || {}) };
  for (const lang of LANGS) {
    newResults[lang] = {
      headword: MANUAL.word, originalInput: MANUAL.word, confidence: 95,
      meanings: [{ definition: MANUAL.targetDefs[lang], partOfSpeech: MANUAL.pos[lang], relevanceScore: 95 }],
      examples: [{ sentence: MANUAL.example.source, translation: MANUAL.example.translations[lang], meaningIndex: 0 }],
    };
  }
  await admin.from('curated_words').upsert({
    curated_wordlist_id: list.id, word: MANUAL.word,
    reading_key: row.reading_key ?? '', display_order: row.display_order,
    results_by_target_lang: newResults,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });
  console.log(`  ✓ Manual 표현 saved (7 lang)`);
}

async function autoFix(word, slug) {
  const { data: list } = await admin.from('curated_wordlists')
    .select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
  if (!list) { console.log(`  ! list ${slug} not found`); return; }
  const proficiencyHint = deriveProficiencyHint(list);

  const { data, error } = await admin.functions.invoke('word-lookup-v2', {
    body: { word, sourceLang: 'ko', targetLang: 'es', mode: 'enrich', forceFresh: true, proficiencyHint },
  });
  if (error) { console.log(`  ! ${word} (es) ${error.message}`); return; }
  const result = data?.result;
  if (!result || result.note) { console.log(`  ! ${word} (es) no result or note=${result?.note}`); return; }

  const { data: row } = await admin.from('curated_words')
    .select('reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id).eq('word', word).single();
  if (!row) { console.log(`  ! ${word} row not found`); return; }
  const newResults = { ...(row.results_by_target_lang || {}), es: result };
  await admin.from('curated_words').upsert({
    curated_wordlist_id: list.id, word,
    reading_key: row.reading_key ?? '', display_order: row.display_order,
    results_by_target_lang: newResults,
  }, { onConflict: 'curated_wordlist_id,word,reading_key' });
  const m = (result.meanings || []).length, e = (result.examples || []).length;
  console.log(`  ✓ ${word} (es) m=${m} e=${e}`);
}

(async () => {
  console.log('═ Manual ═');
  await applyManual();
  console.log('\n═ Auto reprocess (es only) ═');
  for (const w of AUTO_REPROC) await autoFix(w.word, w.slug);
  console.log('\nDone.');
})();
