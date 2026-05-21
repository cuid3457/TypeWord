// Propagate audit-fixed en entry to other 6 target langs.
//
// For each (word, lang) in {ja, zh-CN, es, fr, de, it}:
//   - Take en target's canonical Korean source examples
//   - Translate meanings (EN→target) and example sentences (KO→target)
//   - Save as results_by_target_lang[lang]
//
// Source sentences are CANONICAL (shared across all targets). Only meanings
// and example translations vary per target. Marker placement in source is
// preserved (same string).
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const LANG_NAMES = {
  ja: 'Japanese', 'zh-CN': 'Chinese (Simplified)', es: 'Spanish',
  fr: 'French', de: 'German', it: 'Italian',
};
const POS_BY_LANG = {
  ja: 'noun=名詞, verb=動詞, adjective=形容詞, adverb=副詞, preposition=前置詞, conjunction=接続詞, interjection=感動詞, pronoun=代名詞, proper noun=固有名詞, expression=表現',
  'zh-CN': 'noun=名词, verb=动词, adjective=形容词, adverb=副词, preposition=介词, conjunction=连词, interjection=感叹词, pronoun=代词, proper noun=专有名词, expression=表达',
  es: 'noun=sustantivo, verb=verbo, adjective=adjetivo, adverb=adverbio, preposition=preposición, conjunction=conjunción, interjection=interjección, pronoun=pronombre, proper noun=nombre propio, expression=expresión',
  fr: 'noun=nom, verb=verbe, adjective=adjectif, adverb=adverbe, preposition=préposition, conjunction=conjonction, interjection=interjection, pronoun=pronom, proper noun=nom propre, expression=expression',
  de: 'noun=Nomen, verb=Verb, adjective=Adjektiv, adverb=Adverb, preposition=Präposition, conjunction=Konjunktion, interjection=Interjektion, pronoun=Pronomen, proper noun=Eigenname, expression=Ausdruck',
  it: 'noun=nome, verb=verbo, adjective=aggettivo, adverb=avverbio, preposition=preposizione, conjunction=congiunzione, interjection=interiezione, pronoun=pronome, proper noun=nome proprio, expression=espressione',
};

function buildPrompt(sourceLang, targetLang) {
  const tName = LANG_NAMES[targetLang];
  return `You translate a vocabulary entry FROM ${sourceLang === 'ko' ? 'Korean' : sourceLang} TO ${tName}.

Input: a canonical vocabulary entry with:
- headword (in the source language ${sourceLang === 'ko' ? 'Korean' : sourceLang})
- meanings (definition + partOfSpeech, currently written in English — for reference)
- examples (sentence in source language with ** marker on headword, plus an English translation for reference)

Output the SAME ENTRY but with meanings and example translations rendered in ${tName}.

Output JSON:
{
  "meanings": [ { "definition": "<in ${tName}>", "partOfSpeech": "<in ${tName}>" } ],
  "examples": [ { "sentence": "<same as input — DO NOT modify>", "meaning_index": <same as input>, "translation": "<sentence translated to ${tName}>" } ]
}

RULES:
1. KEEP each example's "sentence" field BYTE-IDENTICAL to the input (canonical Korean source is shared across all targets, never modified per language).
2. KEEP each example's "meaning_index" unchanged.
3. TRANSLATE "translation" field from Korean to ${tName}. The ${tName} translation must be natural, idiomatic, and accurately convey the source sentence's meaning. NO ** markers in translations (translations are plain prose).
4. TRANSLATE "definition" field from English to ${tName}. Concise dictionary style — single word or comma-separated near-synonyms.
5. TRANSLATE "partOfSpeech" field. Use these ${tName} forms: ${POS_BY_LANG[targetLang]}.
6. For Korean target words with state-adjective senses, the ${tName} translation should naturally express the state (e.g. "to be full of stomach" → "お腹いっぱい" or "saciado" etc.).
7. Cross-script purity: ${tName} translations contain ONLY ${tName} script (plus standard punctuation). No Korean characters leaking through.
8. Korean target sentences (when target is ko) follow Korean verb-final SOV order — but here target is ${tName} which follows its own grammar.

Output strict JSON only.`;
}

async function translateOne(headword, sourceLang, targetLang, enEntry) {
  const userMsg = JSON.stringify({
    headword,
    meanings: enEntry.meanings,
    examples: enEntry.examples.map(ex => ({
      sentence: ex.sentence,
      meaning_index: ex.meaning_index,
      translation: ex.translation,
    })),
  }, null, 2);

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildPrompt(sourceLang, targetLang) },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content);
}

(async () => {
  const slug = process.argv[2] || 'topik-test-v3';
  const targetLangs = ['ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

  const { data: list } = await admin.from('curated_wordlists')
    .select('id, source_lang').eq('slug', slug).single();
  const { data: rows } = await admin.from('curated_words')
    .select('word, reading_key, display_order, results_by_target_lang')
    .eq('curated_wordlist_id', list.id)
    .order('display_order');

  for (const row of rows || []) {
    const en = row.results_by_target_lang?.en;
    if (!en) continue;
    console.log(`\n  ▸ ${row.word}`);
    const newResults = { ...(row.results_by_target_lang || {}) };
    for (const lang of targetLangs) {
      try {
        const translated = await translateOne(row.word, list.source_lang, lang, en);
        newResults[lang] = {
          ...en,
          meanings: translated.meanings,
          examples: en.examples.map((ex, i) => ({
            ...ex,
            translation: translated.examples[i]?.translation ?? ex.translation,
          })),
        };
        console.log(`    ${lang}: m=${translated.meanings.length} e=${translated.examples.length} OK`);
      } catch (e) {
        console.log(`    ${lang}: FAIL — ${e.message.slice(0, 60)}`);
      }
    }
    await admin.from('curated_words').upsert({
      curated_wordlist_id: list.id,
      word: row.word,
      reading_key: row.reading_key ?? '',
      display_order: row.display_order,
      results_by_target_lang: newResults,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
  }
  console.log('\n✓ Propagation complete');
})().catch(e => { console.error(e); process.exit(1); });
