// Manual override for 4 stubborn bare-noun headwords (LLM returns 0 examples).
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const POS_NOUN = {
  en: 'noun', ja: '名詞', 'zh-CN': '名词',
  es: 'sustantivo', fr: 'nom', de: 'Substantiv', it: 'sostantivo',
};
const POS_ADJ = {
  en: 'adjective', ja: '形容詞', 'zh-CN': '形容词',
  es: 'adjetivo', fr: 'adjectif', de: 'Adjektiv', it: 'aggettivo',
};

const WORDS = [
  {
    word: '문화', pos: POS_NOUN,
    defs: { en: 'culture', ja: '文化', 'zh-CN': '文化', es: 'cultura', fr: 'culture', de: 'Kultur', it: 'cultura' },
    ex: { src: '한국 **문화**를 좋아해요.', t: {
      en: 'I like Korean culture.',
      ja: '韓国の文化が好きです。',
      'zh-CN': '我喜欢韩国文化。',
      es: 'Me gusta la cultura coreana.',
      fr: "J'aime la culture coréenne.",
      de: 'Ich mag die koreanische Kultur.',
      it: 'Mi piace la cultura coreana.',
    } },
  },
  {
    word: '거리', pos: POS_NOUN,
    defs: { en: 'street', ja: '通り', 'zh-CN': '街道', es: 'calle', fr: 'rue', de: 'Straße', it: 'strada' },
    ex: { src: '**거리**에 사람이 많아요.', t: {
      en: 'There are many people on the street.',
      ja: '通りに人が多いです。',
      'zh-CN': '街道上人很多。',
      es: 'Hay mucha gente en la calle.',
      fr: 'Il y a beaucoup de monde dans la rue.',
      de: 'Es sind viele Leute auf der Straße.',
      it: "Ci sono molte persone per strada.",
    } },
  },
  {
    word: '필요', pos: POS_NOUN,
    defs: { en: 'need, necessity', ja: '必要', 'zh-CN': '需要', es: 'necesidad', fr: 'besoin', de: 'Notwendigkeit', it: 'necessità' },
    ex: { src: '도움이 **필요**해요.', t: {
      en: 'I need help.',
      ja: '助けが必要です。',
      'zh-CN': '我需要帮助。',
      es: 'Necesito ayuda.',
      fr: "J'ai besoin d'aide.",
      de: 'Ich brauche Hilfe.',
      it: 'Ho bisogno di aiuto.',
    } },
  },
  {
    word: '중요', pos: POS_ADJ,
    defs: { en: 'important', ja: '重要', 'zh-CN': '重要', es: 'importante', fr: 'important', de: 'wichtig', it: 'importante' },
    ex: { src: '이 일은 매우 **중요**해요.', t: {
      en: 'This task is very important.',
      ja: 'この仕事はとても重要です。',
      'zh-CN': '这件事非常重要。',
      es: 'Este trabajo es muy importante.',
      fr: 'Ce travail est très important.',
      de: 'Diese Aufgabe ist sehr wichtig.',
      it: 'Questo lavoro è molto importante.',
    } },
  },
];

const LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

(async () => {
  for (const w of WORDS) {
    const { data: lookup } = await admin.from('curated_words').select('curated_wordlist_id').eq('word', w.word).limit(1).maybeSingle();
    if (!lookup) { console.log(`! ${w.word} not in any list`); continue; }
    const { data: list } = await admin.from('curated_wordlists').select('id, slug').eq('id', lookup.curated_wordlist_id).single();
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', w.word).single();
    if (!row) { console.log(`! ${w.word} row missing`); continue; }
    const newResults = { ...(row.results_by_target_lang || {}) };
    for (const lang of LANGS) {
      newResults[lang] = {
        headword: w.word, originalInput: w.word, confidence: 95,
        meanings: [{ definition: w.defs[lang], partOfSpeech: w.pos[lang], relevanceScore: 95 }],
        examples: [{ sentence: w.ex.src, translation: w.ex.t[lang], meaningIndex: 0 }],
      };
    }
    await admin.from('curated_words').upsert({
      curated_wordlist_id: list.id, word: w.word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    console.log(`✓ ${w.word} (${list.slug})`);
  }
})();
