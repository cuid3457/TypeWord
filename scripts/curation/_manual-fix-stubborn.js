// Manual example override for 3 stubborn words that LLM cannot generate
// natural examples for: 건강하다, 구입, 다치다.
//
// Existing manually-fixed words 중요/풍부하다 are kept from earlier pass.
//
// Strategy: write canonical KO example + per-lang natural translation,
// inject directly into curated_words.results_by_target_lang.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const OVERRIDES = [
  {
    word: '건강하다', slug: 'topik-2-part-1',
    meanings: { ko: '건강하다', pos: { ko: '형용사', en: 'adjective', ja: '形容動詞', 'zh-CN': '形容词', es: 'adjetivo', fr: 'adjectif', de: 'Adjektiv', it: 'aggettivo' } },
    targetDefs: {
      en: 'to be healthy',
      ja: '健康だ',
      'zh-CN': '健康',
      es: 'estar sano',
      fr: 'être en bonne santé',
      de: 'gesund sein',
      it: 'essere in salute',
    },
    examples: [{
      source: '그는 항상 **건강하다**.', mi: 0,
      translations: {
        en: 'He is always healthy.',
        ja: '彼はいつも健康だ。',
        'zh-CN': '他总是很健康。',
        es: 'Él siempre está sano.',
        fr: 'Il est toujours en bonne santé.',
        de: 'Er ist immer gesund.',
        it: 'Lui è sempre in salute.',
      },
    }],
  },
  {
    word: '구입', slug: 'topik-2-part-3',
    meanings: { ko: '구입, 사들임', pos: { ko: '명사', en: 'noun', ja: '名詞', 'zh-CN': '名词', es: 'sustantivo', fr: 'nom', de: 'Nomen', it: 'nome' } },
    targetDefs: {
      en: 'purchase, buying',
      ja: '購入',
      'zh-CN': '购买',
      es: 'compra',
      fr: 'achat',
      de: 'Kauf',
      it: 'acquisto',
    },
    examples: [{
      source: '가게에서 **구입**을 완료했다.', mi: 0,
      translations: {
        en: 'I completed the purchase at the store.',
        ja: '店で購入を完了した。',
        'zh-CN': '我在商店完成了购买。',
        es: 'Completé la compra en la tienda.',
        fr: 'J\'ai terminé l\'achat au magasin.',
        de: 'Ich habe den Kauf im Geschäft abgeschlossen.',
        it: 'Ho completato l\'acquisto nel negozio.',
      },
    }],
  },
  {
    word: '다치다', slug: 'topik-2-part-1',
    meanings: { ko: '다치다, 부상을 입다', pos: { ko: '동사', en: 'verb', ja: '動詞', 'zh-CN': '动词', es: 'verbo', fr: 'verbe', de: 'Verb', it: 'verbo' } },
    targetDefs: {
      en: 'to get hurt, to be injured',
      ja: 'けがをする',
      'zh-CN': '受伤',
      es: 'lastimarse, herirse',
      fr: 'se blesser',
      de: 'sich verletzen',
      it: 'farsi male',
    },
    examples: [{
      source: '아이가 넘어져서 무릎을 **다쳤다**.', mi: 0,
      translations: {
        en: 'The child fell and hurt their knee.',
        ja: '子どもが転んでひざをけがした。',
        'zh-CN': '孩子摔倒后膝盖受伤了。',
        es: 'El niño se cayó y se hizo daño en la rodilla.',
        fr: 'L\'enfant est tombé et s\'est blessé au genou.',
        de: 'Das Kind ist gefallen und hat sich das Knie verletzt.',
        it: 'Il bambino è caduto e si è fatto male al ginocchio.',
      },
    }],
  },
];

const LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

(async () => {
  for (const ov of OVERRIDES) {
    console.log(`\n══ ${ov.word} (${ov.slug}) ══`);
    const { data: list } = await admin.from('curated_wordlists')
      .select('id').eq('slug', ov.slug).single();
    if (!list) { console.log(`  ! list not found: ${ov.slug}`); continue; }
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', ov.word).single();
    if (!row) { console.log(`  ! row not found`); continue; }

    const newResults = { ...(row.results_by_target_lang || {}) };
    for (const lang of LANGS) {
      newResults[lang] = {
        headword: ov.word,
        originalInput: ov.word,
        confidence: 95,
        meanings: [{
          definition: ov.targetDefs[lang],
          partOfSpeech: ov.meanings.pos[lang],
          relevanceScore: 95,
        }],
        examples: ov.examples.map((ex) => ({
          sentence: ex.source,
          translation: ex.translations[lang],
          meaningIndex: ex.mi,
        })),
      };
      console.log(`  ${lang.padEnd(6)} ${ov.targetDefs[lang]} | ${ov.examples[0].translations[lang]}`);
    }
    await admin.from('curated_words').upsert({
      curated_wordlist_id: list.id, word: ov.word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    console.log(`  ✓ Saved`);
  }
  console.log('\nDone.');
})();
