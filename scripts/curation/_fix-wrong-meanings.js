// Fix wrong meanings in TOPIK curated words.
// 자주 (often, adverb) — was returning Austria. Fix to adverb only.
// 배우 (actor, noun) — was mixing 배우(actor noun) + 배우다(verb). Fix to noun only.
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
    word: '자주',
    slug: 'topik-1-part-1',
    canonical: { definition: '자주, 종종', partOfSpeech: '부사' },
    targetDefs: {
      en: { d: 'often, frequently', p: 'adverb' },
      ja: { d: 'よく、頻繁に', p: '副詞' },
      'zh-CN': { d: '经常,频繁', p: '副词' },
      es: { d: 'a menudo, frecuentemente', p: 'adverbio' },
      fr: { d: 'souvent, fréquemment', p: 'adverbe' },
      de: { d: 'oft, häufig', p: 'Adverb' },
      it: { d: 'spesso, frequentemente', p: 'avverbio' },
    },
    example: {
      source: '나는 **자주** 친구를 만난다.',
      translations: {
        en: 'I often meet my friends.',
        ja: '私はよく友達に会います。',
        'zh-CN': '我经常和朋友见面。',
        es: 'A menudo me encuentro con mis amigos.',
        fr: 'Je rencontre souvent mes amis.',
        de: 'Ich treffe oft meine Freunde.',
        it: 'Incontro spesso i miei amici.',
      },
    },
  },
  {
    word: '배우',
    slug: 'topik-1-part-2',
    canonical: { definition: '배우, 연기자', partOfSpeech: '명사' },
    targetDefs: {
      en: { d: 'actor, actress', p: 'noun' },
      ja: { d: '俳優、女優', p: '名詞' },
      'zh-CN': { d: '演员', p: '名词' },
      es: { d: 'actor, actriz', p: 'sustantivo' },
      fr: { d: 'acteur, actrice', p: 'nom' },
      de: { d: 'Schauspieler, Schauspielerin', p: 'Nomen' },
      it: { d: 'attore, attrice', p: 'nome' },
    },
    example: {
      source: '그 **배우**는 매우 유명하다.',
      translations: {
        en: 'That actor is very famous.',
        ja: 'その俳優はとても有名だ。',
        'zh-CN': '那位演员非常有名。',
        es: 'Ese actor es muy famoso.',
        fr: 'Cet acteur est très célèbre.',
        de: 'Dieser Schauspieler ist sehr berühmt.',
        it: 'Quell\'attore è molto famoso.',
      },
    },
  },
];

const LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

(async () => {
  for (const fix of FIXES) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', fix.slug).single();
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', fix.word).single();
    if (!row) { console.log(`! ${fix.word} not found`); continue; }
    const newResults = { ...(row.results_by_target_lang || {}) };
    for (const lang of LANGS) {
      newResults[lang] = {
        headword: fix.word, originalInput: fix.word, confidence: 95,
        meanings: [{
          definition: fix.targetDefs[lang].d,
          partOfSpeech: fix.targetDefs[lang].p,
          relevanceScore: 95,
        }],
        examples: [{
          sentence: fix.example.source,
          translation: fix.example.translations[lang],
          meaningIndex: 0,
        }],
      };
    }
    await admin.from('curated_words').upsert({
      curated_wordlist_id: list.id, word: fix.word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    console.log(`✓ ${fix.word} fixed across 7 langs`);
  }
})();
