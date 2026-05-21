// V1 prompt pilot: re-curate 10 TOPIK words using the archived v1 ENRICH
// prompt (1153-line version) for direct comparison with current v2 output.
// Inserts results as a new "TOPIK TEST" wordlist in 시험 / 한국어 category.
//
// Architecture mirrors v1's two-call flow:
//   1. QUICK_PROMPT: canonical analysis in DEFINITION LANGUAGE = target_lang
//      → meanings (in target_lang), ipa(none for ko), reading(none for ko)
//   2. ENRICH_PROMPT: per (source, target) pair
//      → examples + syn/ant + translations with meaning_index
//
// Output: curated_words.results_by_target_lang[lang] = combined WordLookupResult
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Read v1 archived prompts.ts and extract the two STATIC string blocks
const V1_PROMPTS = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/functions/_archive/v1-2026-05-13/_shared/prompts.ts'),
  'utf8',
);

function extractStatic(name) {
  const re = new RegExp(`const ${name}_STATIC = \`([\\s\\S]+?)\`;`, 'm');
  const m = V1_PROMPTS.match(re);
  if (!m) throw new Error(`Could not extract ${name}_STATIC`);
  return m[1];
}

const QUICK_STATIC = extractStatic('QUICK_PROMPT');
const ENRICH_STATIC = extractStatic('ENRICH_PROMPT');

// Korean-source dynamic tail (verb-final rule was already in static; just add Korean particle exclusion for markers)
const KO_PARTICLE_RULE = `\n\nKorean: exclude particles (을/를/이/가/은/는/에/의/로/와/과 etc.) from ** markers.`;

const LANG_NAMES = {
  en: 'English', ko: 'Korean', ja: 'Japanese', 'zh-CN': 'Chinese (Simplified)',
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
};

function buildQuickSystem() { return QUICK_STATIC + KO_PARTICLE_RULE; }
function buildEnrichSystem() { return ENRICH_STATIC + KO_PARTICLE_RULE; }

function buildQuickUser(word, sourceLang, targetLang) {
  return [
    `Input (${LANG_NAMES[sourceLang]}): "${word}"`,
    `Word language: ${LANG_NAMES[sourceLang]}`,
    `Definition language: ${LANG_NAMES[targetLang]}`,
    '',
    'Set originalInput to the input string above verbatim.',
    'Apply the scope policy and recognition policy strictly. Provide the structured vocabulary entry.',
  ].join('\n');
}

function buildEnrichUser(word, sourceLang, targetLang, meanings) {
  const lines = [
    `Word (${LANG_NAMES[sourceLang]}): "${word}"`,
    `Word language: ${LANG_NAMES[sourceLang]}`,
    `Definition language: ${LANG_NAMES[targetLang]}`,
    '',
    'Meanings (for reference — match each example to a meaning via meaning_index):',
  ];
  for (let i = 0; i < meanings.length; i++) {
    lines.push(`[${i}] ${meanings[i].definition} (${meanings[i].partOfSpeech})`);
  }
  lines.push('', 'Generate examples, synonyms, and antonyms per the schedule. Every example MUST include meaning_index.');
  return lines.join('\n');
}

async function callOpenAI(systemPrompt, userPrompt, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4.1',
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`OpenAI ${resp.status}: ${txt.slice(0, 200)}`);
      }
      const j = await resp.json();
      return JSON.parse(j.choices[0].message.content);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

const WORDS = ['아침', '저녁', '안', '역', '팔', '김', '도', '위로', '부르다', '어리다'];
const TARGET_LANGS = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

async function curateOne(word, targetLang) {
  // QUICK: canonical analysis with definitions in target_lang
  const quickSys = buildQuickSystem();
  const quickUser = buildQuickUser(word, 'ko', targetLang);
  const quick = await callOpenAI(quickSys, quickUser);

  const meanings = (quick.meanings || []).map(m => ({
    definition: m.definition,
    partOfSpeech: m.partOfSpeech,
  }));
  if (meanings.length === 0) return null;

  // ENRICH: examples + syn/ant
  const enrichSys = buildEnrichSystem();
  const enrichUser = buildEnrichUser(word, 'ko', targetLang, meanings);
  const enrich = await callOpenAI(enrichSys, enrichUser);

  return {
    headword: quick.headword || word,
    ipa: quick.ipa,
    reading: quick.reading,
    confidence: quick.confidence,
    meanings,
    examples: (enrich.examples || []).map(ex => ({
      sentence: ex.sentence,
      translation: ex.translation,
      meaning_index: ex.meaning_index,
    })),
    synonyms: enrich.synonyms || [],
    antonyms: enrich.antonyms || [],
  };
}

async function main() {
  console.log(`v1 pilot curation: ${WORDS.length} words × ${TARGET_LANGS.length} langs = ${WORDS.length * TARGET_LANGS.length * 2} OpenAI calls\n`);

  // Upsert wordlist
  const slug = 'topik-test';
  const meta = {
    slug,
    name_i18n: {
      ko: 'TOPIK TEST (v1 프롬프트 비교용)',
      en: 'TOPIK TEST (v1 prompt comparison)',
      'zh-CN': 'TOPIK TEST', ja: 'TOPIK TEST',
      es: 'TOPIK TEST', fr: 'TOPIK TEST', de: 'TOPIK TEST', it: 'TOPIK TEST',
    },
    description_i18n: {
      ko: 'v1 archived 프롬프트로 재처리한 TOPIK 10단어. v2와 직접 비교용.',
      en: '10 TOPIK words re-curated with archived v1 prompt for v2 comparison.',
    },
    source_lang: 'ko',
    exam_type: 'TOPIK',
    level: 'TEST',
    category: 'exam',
    display_order: 5,
    is_active: true,
  };
  const { data: listRow, error: metaErr } = await admin
    .from('curated_wordlists')
    .upsert(meta, { onConflict: 'slug' })
    .select('id')
    .single();
  if (metaErr) throw metaErr;
  console.log(`✓ wordlist ${slug} → ${listRow.id}`);

  // Curate
  const allResults = {};
  for (let i = 0; i < WORDS.length; i++) {
    const word = WORDS[i];
    allResults[word] = {};
    for (const lang of TARGET_LANGS) {
      process.stdout.write(`[${i+1}/${WORDS.length}] ${word} (${lang}) ... `);
      try {
        const r = await curateOne(word, lang);
        if (r) {
          allResults[word][lang] = r;
          console.log(`OK (${r.meanings.length} m, ${r.examples.length} e)`);
        } else {
          console.log('SKIP (empty)');
        }
      } catch (e) {
        console.log(`FAIL — ${e.message.slice(0, 80)}`);
      }
    }
  }

  // Save curated_words
  for (let i = 0; i < WORDS.length; i++) {
    const word = WORDS[i];
    const results = allResults[word];
    if (!results || Object.keys(results).length === 0) continue;
    await admin.from('curated_words').upsert({
      curated_wordlist_id: listRow.id,
      word,
      reading_key: '',
      display_order: i,
      results_by_target_lang: results,
    }, { onConflict: 'curated_wordlist_id,word,reading_key' });
  }
  console.log(`\n✓ Saved ${WORDS.length} words to curated_words for ${slug}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
