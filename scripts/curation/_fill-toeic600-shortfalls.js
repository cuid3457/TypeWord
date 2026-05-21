// Fill toeic-600-part-2 (need +1) and toeic-600-part-3 (need +5) back to
// exactly 300 each by generating + validating + inserting candidates.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGETS = ['ko','ja','zh-CN','es','fr','de','it'];
const TARGET_COUNT = 300;
const norm = (w) => String(w).trim().toLowerCase();

async function fetchAllToeicWords() {
  const exclude = new Set();
  for (const slug of ['toeic-600-part-1','toeic-600-part-2','toeic-600-part-3','toeic-800','toeic-800-1','toeic-800-2']) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin.from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of data) exclude.add(norm(r.word));
  }
  return exclude;
}

async function gen(exclude, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.7,
      messages: [
        { role: 'system', content: `Produce ${n} TOEIC 600-target business English words (canonical form: single words preferred). Real dictionary words only — no compound coinages, no fake collocations. JSON: {"words": [...]}.` },
        { role: 'user', content: `EXCLUSION (${exclude.length}):\n${exclude.join(', ')}\n\nProduce ${n} NEW TOEIC 600-target business English words.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status);
  return JSON.parse((await resp.json()).choices[0].message.content).words || [];
}

async function validateAndLookup(word, hint) {
  // Validate canonical via en→ko, then generate other langs
  const results = {};
  for (let i = 0; i < TARGETS.length; i++) {
    const tl = TARGETS[i];
    let res = null;
    for (let att = 1; att <= 2; att++) {
      const r = await admin.functions.invoke('word-lookup-v2', {
        body: { word, sourceLang: 'en', targetLang: tl, mode: 'enrich', forceFresh: i === 0, forceFreshTranslation: i > 0, proficiencyHint: hint },
      });
      if (!r.error && r.data?.result) {
        const result = r.data.result;
        if (result.note === 'non_word' || result.note === 'sentence' || !result.meanings?.length || !result.examples?.length) {
          if (i === 0) return null;  // hallucination — bail early
          break;
        }
        res = result;
        break;
      }
      if (att < 2) await new Promise(rs => setTimeout(rs, 1500));
    }
    if (!res) return null;
    results[tl] = res;
  }
  return results;
}

(async () => {
  const SHORT = [
    { slug: 'toeic-600-part-2', need: 1 },
    { slug: 'toeic-600-part-3', need: 5 },
  ];

  const exclude = await fetchAllToeicWords();
  console.log('Excluding:', exclude.size, 'TOEIC words');

  for (const s of SHORT) {
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('slug', s.slug).single();
    const hint = deriveProficiencyHint(list);
    const { count: cur } = await admin.from('curated_words').select('*', { count: 'exact', head: true }).eq('curated_wordlist_id', list.id);
    let dispOrder = cur + 1;
    let added = 0;

    console.log(`\n=== ${s.slug} (have ${cur}, need +${s.need}) ===`);

    for (let attempt = 1; attempt <= 5 && added < s.need; attempt++) {
      const candidates = await gen([...exclude], (s.need - added) * 10);
      console.log(`  attempt ${attempt}: ${candidates.length} candidates`);
      for (const w of candidates) {
        if (added >= s.need) break;
        const k = norm(w);
        if (exclude.has(k)) continue;
        const results = await validateAndLookup(w, hint);
        if (!results) {
          console.log('  skip:', w);
          exclude.add(k);
          continue;
        }
        const { error } = await admin.from('curated_words').insert({
          curated_wordlist_id: list.id,
          word: w,
          reading_key: '',
          display_order: dispOrder++,
          results_by_target_lang: results,
        });
        if (error) { console.log('  insert error:', error.message); continue; }
        exclude.add(k);
        added++;
        console.log('  ADDED:', w);
      }
    }

    await admin.from('curated_wordlists').update({ word_count: cur + added }).eq('id', list.id);
  }

  console.log('\n=== Final ===');
  for (const slug of ['toeic-600-part-1','toeic-600-part-2','toeic-600-part-3']) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { count } = await admin.from('curated_words').select('*', { count: 'exact', head: true }).eq('curated_wordlist_id', list.id);
    console.log(slug, '→', count);
  }
})();
