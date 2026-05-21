// Generate 50 SINGLE-WORD TOEIC 800 fillers, excluding everything already
// in any TOEIC 600/800 wordlist. Single-word focus avoids the LLM rejection
// pattern we saw on multi-word phrases (~10% rejected as "sentence").
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY missing');

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (w) => String(w).trim().toLowerCase();

async function fetchExisting() {
  const slugs = ['toeic-600-part-1', 'toeic-600-part-2', 'toeic-600-part-3', 'toeic-800', 'toeic-800-1', 'toeic-800-2', 'toeic-800-3'];
  const set = new Set();
  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin.from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of (data || [])) set.add(norm(r.word));
  }
  return set;
}

const SYS = `English lexicographer for TOEIC 800 prep.

Produce NEW SINGLE-WORD English vocabulary at TOEIC 800 difficulty (CEFR B2~C1, upper-intermediate business English).

STRICT RULES:
1. SINGLE WORDS ONLY — no phrases, no compounds, no two-word entries.
2. Canonical form: verb infinitive (no "to"), noun singular, adjective base.
3. TOEIC 800-tier business context: corporate, legal, finance, strategy, HR, operations.
4. Real dictionary words. No proper nouns, no neologisms.
5. Excluded from provided list.

Output JSON: {"words": [...]} — exactly N entries.`;

async function gen(exclude, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.6,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `EXCLUSION LIST (${exclude.length} words):\n${exclude.join(', ')}\n\nProduce ${n} new SINGLE-WORD TOEIC 800 vocabulary entries.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).words || [];
}

(async () => {
  const baseExclude = [...await fetchExisting()];
  console.log('Excluding:', baseExclude.length);
  const out = [];
  const seen = new Set();
  let attempts = 0;
  while (out.length < 50 && attempts < 5) {
    attempts++;
    const exclude = [...baseExclude, ...Array.from(seen)];
    const batch = await gen(exclude, 80);
    for (const w of batch) {
      const k = norm(w);
      if (k.includes(' ') || k.includes('-')) continue; // single-word only
      if (seen.has(k) || baseExclude.includes(k)) continue;
      seen.add(k);
      out.push(String(w).trim());
      if (out.length >= 50) break;
    }
    console.log(`attempt ${attempts}: ${out.length}/50`);
  }
  fs.writeFileSync('/tmp/toeic800-fillers.json', JSON.stringify({ words: out }, null, 2));
  console.log('Saved:', out.slice(0, 20).join(', '), '...');
})().catch(e => { console.error(e); process.exit(1); });
