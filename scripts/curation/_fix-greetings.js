// Manual override for 11 formal greeting/acknowledgement expressions.
// set_expression case doesn't reliably produce examples; provide curated ones.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const POS = {
  en: 'expression', ja: '表現', 'zh-CN': '表达',
  es: 'expresión', fr: 'expression', de: 'Ausdruck', it: 'espressione',
};

const GREETINGS = [
  {
    word: '반갑습니다', slug: 'topik-1-part-1',
    defs: { en: 'Nice to meet you', ja: 'お会いできて嬉しいです', 'zh-CN': '很高兴见到您',
            es: 'Encantado de conocerle', fr: 'Enchanté de vous rencontrer', de: 'Schön Sie kennenzulernen', it: 'Piacere di conoscerla' },
    ex: { src: '처음 뵙겠습니다, **반갑습니다**.', t: {
      en: 'Pleased to meet you for the first time.',
      ja: 'はじめまして、お会いできて嬉しいです。',
      'zh-CN': '初次见面,很高兴见到您。',
      es: 'Es un placer conocerle por primera vez.',
      fr: 'Enchanté de vous rencontrer pour la première fois.',
      de: 'Freut mich, Sie kennenzulernen.',
      it: 'Piacere di conoscerla per la prima volta.',
    } },
  },
  {
    word: '알겠습니다', slug: 'topik-1-part-1',
    defs: { en: 'I understand / Okay', ja: 'わかりました', 'zh-CN': '知道了',
            es: 'Entendido', fr: 'Compris', de: 'Verstanden', it: 'Ho capito' },
    ex: { src: '**알겠습니다**, 곧 시작할게요.', t: {
      en: 'Understood, I will start soon.',
      ja: 'わかりました、すぐに始めます。',
      'zh-CN': '知道了,我马上开始。',
      es: 'Entendido, empezaré pronto.',
      fr: 'Compris, je commence bientôt.',
      de: 'Verstanden, ich fange bald an.',
      it: 'Capito, comincio presto.',
    } },
  },
  {
    word: '감사합니다', slug: 'topik-1-part-1',
    defs: { en: 'Thank you (formal)', ja: 'ありがとうございます', 'zh-CN': '谢谢',
            es: 'Gracias', fr: 'Merci', de: 'Danke', it: 'Grazie' },
    ex: { src: '도와주셔서 **감사합니다**.', t: {
      en: 'Thank you for your help.',
      ja: '助けてくださってありがとうございます。',
      'zh-CN': '谢谢您的帮助。',
      es: 'Gracias por su ayuda.',
      fr: 'Merci pour votre aide.',
      de: 'Vielen Dank für Ihre Hilfe.',
      it: 'Grazie per il suo aiuto.',
    } },
  },
  {
    word: '고맙다', slug: 'topik-1-part-1',
    defs: { en: 'Thanks (informal)', ja: 'ありがとう', 'zh-CN': '谢谢',
            es: 'Gracias', fr: 'Merci', de: 'Danke', it: 'Grazie' },
    ex: { src: '도와줘서 **고맙다**.', t: {
      en: 'Thanks for helping.',
      ja: '助けてくれてありがとう。',
      'zh-CN': '谢谢你的帮助。',
      es: 'Gracias por ayudar.',
      fr: 'Merci de m\'aider.',
      de: 'Danke fürs Helfen.',
      it: 'Grazie per l\'aiuto.',
    } },
  },
  {
    word: '죄송합니다', slug: 'topik-1-part-1',
    defs: { en: "I'm sorry (formal)", ja: '申し訳ありません', 'zh-CN': '对不起',
            es: 'Lo siento', fr: 'Je suis désolé', de: 'Es tut mir leid', it: 'Mi dispiace' },
    ex: { src: '늦어서 **죄송합니다**.', t: {
      en: "I'm sorry I'm late.",
      ja: '遅れて申し訳ありません。',
      'zh-CN': '对不起,我迟到了。',
      es: 'Lo siento por llegar tarde.',
      fr: "Je suis désolé d'être en retard.",
      de: 'Entschuldigung für die Verspätung.',
      it: 'Mi dispiace di essere in ritardo.',
    } },
  },
  {
    word: '미안하다', slug: 'topik-1-part-1',
    defs: { en: "I'm sorry (informal)", ja: 'ごめん', 'zh-CN': '对不起',
            es: 'Lo siento', fr: 'Je suis désolé', de: 'Tut mir leid', it: 'Scusa' },
    ex: { src: '정말 **미안하다**.', t: {
      en: "I'm really sorry.",
      ja: '本当にごめん。',
      'zh-CN': '真的对不起。',
      es: 'Lo siento mucho.',
      fr: 'Je suis vraiment désolé.',
      de: 'Es tut mir wirklich leid.',
      it: 'Mi dispiace davvero.',
    } },
  },
  {
    word: '고맙습니다', slug: 'topik-1-part-3',
    defs: { en: 'Thank you (formal)', ja: 'ありがとうございます', 'zh-CN': '谢谢',
            es: 'Gracias', fr: 'Merci', de: 'Danke', it: 'Grazie' },
    ex: { src: '정말 **고맙습니다**.', t: {
      en: 'Thank you very much.',
      ja: '本当にありがとうございます。',
      'zh-CN': '非常感谢。',
      es: 'Muchas gracias.',
      fr: 'Merci beaucoup.',
      de: 'Vielen Dank.',
      it: 'Grazie mille.',
    } },
  },
  {
    word: '괜찮습니다', slug: 'topik-1-part-3',
    defs: { en: "It's okay (formal)", ja: '大丈夫です', 'zh-CN': '没关系',
            es: 'Está bien', fr: 'Ce n\'est rien', de: 'Schon gut', it: 'Va bene' },
    ex: { src: '**괜찮습니다**, 신경 쓰지 마세요.', t: {
      en: "It's okay, don't worry.",
      ja: '大丈夫です、お気になさらないでください。',
      'zh-CN': '没关系,不用担心。',
      es: 'Está bien, no se preocupe.',
      fr: "Ce n'est rien, ne vous inquiétez pas.",
      de: 'Schon gut, machen Sie sich keine Sorgen.',
      it: 'Va bene, non si preoccupi.',
    } },
  },
  {
    word: '맞습니다', slug: 'topik-1-part-3',
    defs: { en: "That's right (formal)", ja: 'そうです', 'zh-CN': '对的',
            es: 'Así es', fr: "C'est exact", de: 'Das stimmt', it: 'Esatto' },
    ex: { src: '네, **맞습니다**.', t: {
      en: "Yes, that's right.",
      ja: 'はい、そうです。',
      'zh-CN': '是的,对的。',
      es: 'Sí, así es.',
      fr: "Oui, c'est exact.",
      de: 'Ja, das stimmt.',
      it: 'Sì, esatto.',
    } },
  },
  {
    word: '미안합니다', slug: 'topik-1-part-3',
    defs: { en: "I'm sorry (formal)", ja: 'すみません', 'zh-CN': '对不起',
            es: 'Lo siento', fr: 'Je suis désolé', de: 'Entschuldigung', it: 'Mi dispiace' },
    ex: { src: '기다리게 해서 **미안합니다**.', t: {
      en: "I'm sorry to keep you waiting.",
      ja: 'お待たせしてすみません。',
      'zh-CN': '让您久等了,对不起。',
      es: 'Lo siento por hacerle esperar.',
      fr: "Je suis désolé de vous avoir fait attendre.",
      de: 'Entschuldigung, dass ich Sie warten ließ.',
      it: 'Mi dispiace per averla fatta aspettare.',
    } },
  },
  {
    word: '감사드립니다', slug: 'topik-2-part-3',
    defs: { en: 'Thank you (most formal honorific)', ja: '感謝申し上げます', 'zh-CN': '深表感谢',
            es: 'Le agradezco', fr: 'Je vous remercie', de: 'Ich danke Ihnen', it: 'La ringrazio' },
    ex: { src: '도와주셔서 진심으로 **감사드립니다**.', t: {
      en: 'I sincerely thank you for your help.',
      ja: '助けてくださって心より感謝申し上げます。',
      'zh-CN': '衷心感谢您的帮助。',
      es: 'Le agradezco sinceramente su ayuda.',
      fr: 'Je vous remercie sincèrement de votre aide.',
      de: 'Ich danke Ihnen herzlich für Ihre Hilfe.',
      it: 'La ringrazio sinceramente per il suo aiuto.',
    } },
  },
];

const LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

(async () => {
  for (const g of GREETINGS) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', g.slug).single();
    if (!list) { console.log(`! list ${g.slug} not found for ${g.word}`); continue; }
    const { data: row } = await admin.from('curated_words')
      .select('reading_key, display_order, results_by_target_lang')
      .eq('curated_wordlist_id', list.id).eq('word', g.word).single();
    if (!row) { console.log(`! ${g.word} row not found in ${g.slug}`); continue; }
    const newResults = { ...(row.results_by_target_lang || {}) };
    for (const lang of LANGS) {
      newResults[lang] = {
        headword: g.word, originalInput: g.word, confidence: 95,
        meanings: [{ definition: g.defs[lang], partOfSpeech: POS[lang], relevanceScore: 95 }],
        examples: [{ sentence: g.ex.src, translation: g.ex.t[lang], meaningIndex: 0 }],
      };
    }
    await admin.from('curated_words').upsert({
      curated_wordlist_id: list.id, word: g.word,
      reading_key: row.reading_key ?? '', display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
    console.log(`✓ ${g.word} (${g.slug})`);
  }
})();
