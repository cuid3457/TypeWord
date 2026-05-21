// Final 4 entries — all Spanish-only issues. Manual override.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const FIXES = [
  {
    word: '돌아가다', slug: 'topik-2-part-2',
    es: {
      headword: '돌아가다', originalInput: '돌아가다', confidence: 95,
      meanings: [
        { definition: 'volver, regresar', partOfSpeech: 'verbo', relevanceScore: 95 },
        { definition: 'fallecer, morir (honorífico)', partOfSpeech: 'verbo', relevanceScore: 75 },
      ],
      examples: [
        { sentence: '나는 집으로 **돌아간다**.', translation: 'Vuelvo a casa.', meaningIndex: 0 },
        { sentence: '할아버지가 어제 **돌아가셨어요**.', translation: 'Mi abuelo falleció ayer.', meaningIndex: 1 },
      ],
    },
  },
  {
    word: '다녀오다', slug: 'topik-1-part-2',
    es: {
      headword: '다녀오다', originalInput: '다녀오다', confidence: 95,
      meanings: [{ definition: 'ir y volver, hacer una visita', partOfSpeech: 'verbo', relevanceScore: 95 }],
      examples: [{ sentence: '학교에 **다녀왔어요**.', translation: 'Fui a la escuela y volví.', meaningIndex: 0 }],
    },
  },
  {
    word: '돌아오다', slug: 'topik-1-part-2',
    es: {
      headword: '돌아오다', originalInput: '돌아오다', confidence: 95,
      meanings: [{ definition: 'volver, regresar', partOfSpeech: 'verbo', relevanceScore: 95 }],
      examples: [{ sentence: '그는 집에 **돌아왔다**.', translation: 'Él volvió a casa.', meaningIndex: 0 }],
    },
  },
  {
    word: '갔다오다', slug: 'topik-2-part-3',
    es: {
      headword: '갔다오다', originalInput: '갔다오다', confidence: 95,
      meanings: [{ definition: 'ir y volver (coloquial)', partOfSpeech: 'verbo', relevanceScore: 95 }],
      examples: [{ sentence: '친구가 화장실에 **갔다왔어요**.', translation: 'Mi amigo fue al baño y volvió.', meaningIndex: 0 }],
    },
  },
];

(async () => {
  for (const fix of FIXES) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', fix.slug).single();
    if (!list) { console.log(`! list ${fix.slug} not found`); continue; }
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', fix.word).single();
    if (!row) { console.log(`! ${fix.word} row not found in ${fix.slug}`); continue; }
    const newResults = { ...(row.results_by_target_lang || {}), es: fix.es };
    await admin.from('curated_words').upsert({
      curated_wordlist_id: list.id, word: fix.word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    console.log(`✓ ${fix.word} (es) — ${fix.es.meanings.length}m / ${fix.es.examples.length}e`);
  }
  console.log('\nDone.');
})();
