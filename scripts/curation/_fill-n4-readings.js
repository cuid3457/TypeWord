// Fix the G3 (no_reading) issue in JLPT N4 lists by bulk-generating
// hiragana readings via a single OpenAI call, then bulk-UPDATE-ing
// curated_words.results_by_target_lang[ko].reading.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function fetchMissingReadings() {
  const { data: lists } = await admin
    .from('curated_wordlists').select('id, slug')
    .in('slug', ['jlpt-n4-part-1','jlpt-n4-part-2','jlpt-n4-part-3']);
  const out = [];
  for (const list of lists) {
    const { data } = await admin.from('curated_words')
      .select('id, word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const r of data) {
      const reading = r.results_by_target_lang?.ko?.reading;
      if (!reading) out.push({ id: r.id, word: r.word, slug: list.slug });
    }
  }
  return out;
}

async function generateReadings(words) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.0,
      messages: [
        { role: 'system', content: 'You are a Japanese-language lexicographer. For each given Japanese word (which may contain kanji + okurigana / katakana / hiragana), produce the standard hiragana reading.\n\nRULES:\n- Output JSON: { "readings": { "word": "reading", ... } } — one entry per input word, exact match on the input string.\n- Reading is hiragana ONLY. No spaces, no romaji, no punctuation.\n- For 〜する verbs, the reading includes the trailing する (e.g. 勉強する → べんきょうする).\n- For i-adjectives, include the trailing い (e.g. 大きい → おおきい).\n- For pure katakana words, return the hiragana equivalent (e.g. アルバイト → あるばいと).\n- For words already entirely in hiragana, return as-is.' },
        { role: 'user', content: 'Words:\n' + words.join('\n') + '\n\nProduce { "readings": { ... } } with all words.' },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).readings || {};
}

(async () => {
  const missing = await fetchMissingReadings();
  console.log(`Missing readings: ${missing.length}`);
  if (missing.length === 0) return;

  // Batch in chunks of 60 to keep prompt reasonable
  const CHUNK = 60;
  const allReadings = {};
  for (let i = 0; i < missing.length; i += CHUNK) {
    const slice = missing.slice(i, i + CHUNK);
    const words = slice.map(m => m.word);
    console.log(`chunk ${Math.floor(i/CHUNK)+1}: requesting ${words.length} readings`);
    const r = await generateReadings(words);
    Object.assign(allReadings, r);
    console.log(`  got ${Object.keys(r).length}`);
  }

  // Patch each row
  let patched = 0, skipped = 0;
  for (const m of missing) {
    const reading = allReadings[m.word];
    if (!reading) { skipped++; continue; }
    const { data: row } = await admin.from('curated_words')
      .select('results_by_target_lang').eq('id', m.id).single();
    const r = row.results_by_target_lang;
    if (!r?.ko) { skipped++; continue; }
    r.ko.reading = reading;
    const { error } = await admin.from('curated_words')
      .update({ results_by_target_lang: r }).eq('id', m.id);
    if (error) { console.warn(`patch ${m.word}: ${error.message}`); skipped++; continue; }
    patched++;
  }
  console.log(`\nPatched: ${patched}, skipped: ${skipped}`);
})().catch(e => { console.error(e); process.exit(1); });
