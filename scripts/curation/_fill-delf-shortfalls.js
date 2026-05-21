// Fill DELF wordlists back to exactly 300 each by generating + validating candidates.
// Each candidate is LIVE-checked via word-lookup-v2; we only insert words that
// the LLM accepts as real (not note=non_word/sentence) so no new hallucinations.
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

const TARGETS = {
  'delf-a1-part-3': { level: 'A1', need: 2 },
  'delf-a2-part-3': { level: 'A2', need: 1 },
  'delf-b1-part-5': { level: 'B1', need: 3 },
};

const GUIDANCE = {
  A1: 'CEFR A1 — quotidien concret, mots de base, forme canonique (verbe inf., nom sing. sans article, adj. masc. sing.)',
  A2: 'CEFR A2 — situations sociales élémentaires, opinions simples, forme canonique',
  B1: 'CEFR B1 — argumenter, abstrait modéré, registre courant, forme canonique',
};

const norm = (w) => String(w).trim().toLowerCase();

async function genCandidates(level, exclude, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0.7,
      messages: [
        { role: 'system', content: `Tu es lexicographe FLE. Produis ${n} mots français ${level} (forme canonique unique : verbe à l'infinitif, nom singulier sans article, adjectif masculin singulier). Mots SIMPLES préférés — pas de locutions de plus de 2 mots, pas de mots rares. JSON: {"words": [...]}.` },
        { role: 'user', content: `Niveau ${level}: ${GUIDANCE[level]}\n\nEXCLUSION (${exclude.length} mots):\n${exclude.join(', ')}\n\nProduis ${n} mots français simples ${level}, jamais présents dans la liste d'exclusion.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const j = await resp.json();
  if (!resp.ok) throw new Error('OpenAI ' + resp.status);
  return JSON.parse(j.choices[0].message.content).words || [];
}

async function validateAndLookup(word, hint) {
  const r = await admin.functions.invoke('word-lookup-v2', {
    body: { word, sourceLang: 'fr', targetLang: 'ko', mode: 'enrich', forceFresh: true, proficiencyHint: hint },
  });
  if (r.error) return null;
  const result = r.data?.result;
  if (!result) return null;
  if (result.note === 'non_word' || result.note === 'sentence' || result.note === 'wrong_language') return null;
  if (!Array.isArray(result.meanings) || !result.meanings.length) return null;
  if (!Array.isArray(result.examples) || !result.examples.length) return null;
  return result;
}

(async () => {
  // Collect all existing DELF words across every list (for exclusion)
  const { data: allLists } = await admin.from('curated_wordlists').select('id').like('slug', 'delf-%');
  const ids = allLists.map(l => l.id);
  const { data: allRows } = await admin.from('curated_words').select('word').in('curated_wordlist_id', ids);
  const fullExclude = new Set(allRows.map(r => norm(r.word)));
  console.log('Total existing DELF words to exclude:', fullExclude.size);

  for (const slug of Object.keys(TARGETS)) {
    const { level, need } = TARGETS[slug];
    const { data: list } = await admin.from('curated_wordlists').select('id, slug, source_lang, exam_type, level').eq('slug', slug).single();
    const hint = deriveProficiencyHint(list);
    const { count: curCount } = await admin.from('curated_words').select('*', { count: 'exact', head: true }).eq('curated_wordlist_id', list.id);
    let displayOrder = curCount + 1;

    console.log(`\n=== ${slug} (${level}, current ${curCount}, need +${need}) ===`);
    let added = 0;
    let attempts = 0;
    while (added < need && attempts < 5) {
      attempts++;
      const exArr = [...fullExclude];
      const batch = await genCandidates(level, exArr, (need - added) * 10);
      console.log('  candidates:', batch.length);
      for (const w of batch) {
        if (added >= need) break;
        const k = norm(w);
        if (fullExclude.has(k)) continue;
        const result = await validateAndLookup(w, hint);
        if (!result) {
          console.log('  skip (invalid):', w);
          fullExclude.add(k);  // don't try again
          continue;
        }
        // Insert
        const { error } = await admin.from('curated_words').insert({
          curated_wordlist_id: list.id,
          word: w,
          reading_key: '',
          display_order: displayOrder++,
          results_by_target_lang: { ko: result },
        });
        if (error) { console.log('  insert error:', error.message); continue; }
        fullExclude.add(k);
        added++;
        console.log('  ADDED:', w);
      }
    }
    console.log(`  done: +${added}/${need}`);
    await admin.from('curated_wordlists').update({ word_count: curCount + added }).eq('id', list.id);
  }

  // Final verify
  console.log('\n=== Final ===');
  for (const slug of Object.keys(TARGETS)) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    const { count } = await admin.from('curated_words').select('*', { count: 'exact', head: true }).eq('curated_wordlist_id', list.id);
    console.log(slug, '→', count);
  }
})();
