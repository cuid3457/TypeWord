// Broad v3 audit: 100 random samples from TOPIK 1+2 (vs hardcoded 30
// worst-case sample). Removes sample bias to get realistic flag%.
// Each sample: forceFresh enrich (v3 prompts + KO branched) → audit.
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const AUDIT_SYSTEM = `You are a strict quality auditor for a language-learning vocabulary entry. Your job is to evaluate ONE entry and decide PASS or FLAG.

Evaluate as a NATIVE SPEAKER of WORD_LANG and TARGET_LANG. Be honest, not lenient.

You will receive: headword, meanings (in WORD_LANG), examples (in WORD_LANG with **marker**), and an English translation of each example. The entry may also carry a "note" field — see special case below.

SPECIAL CASE — INTENTIONAL REFUSAL (always PASS):
- If the entry has note set to "non_word" / "sentence" / "wrong_language" AND meanings is empty AND examples is empty, the system has intentionally refused to define this input. This is the CORRECT behavior. Return PASS with empty issues.

EVALUATION CRITERIA (any one failure = FLAG, otherwise PASS):

A. MEANINGS — each listed sense MUST be a genuine STANDALONE sense of the bare headword. FLAG if compound-only, archaic, or near-duplicate of another listed sense.
B. EXAMPLES — each example MUST be NATURAL, have the marker on the EXACT headword (not adjacent verb), demonstrate the SENSE at its meaning_index, use bare headword (not constituent of a compound). Korean: numeral-counter pairing correct, state-adjectives have state-bearer subject. Verbs: typical object/argument.
C. TRANSLATION — accurate, natural English, matches sense.

Output strict JSON: { "verdict": "PASS" | "FLAG", "issues": [ { "category": "meaning"|"example"|"translation", "index": 0, "problem": "<short reason>" } ] }`;

async function generate(word) {
  const { data, error } = await admin.functions.invoke('word-lookup-v2', {
    body: { word, sourceLang: 'ko', targetLang: 'en', mode: 'enrich', forceFresh: true },
  });
  if (error) throw new Error(error.message);
  return data.result;
}

async function audit(headword, result) {
  const userMsg = JSON.stringify({
    word_lang: 'ko',
    headword,
    note: result.note || null,
    meanings: result.meanings || [],
    examples: (result.examples || []).map(ex => ({
      sentence: ex.sentence,
      meaning_index: ex.meaningIndex ?? ex.meaning_index ?? 0,
      en_translation: ex.translation || '',
    })),
  }, null, 2);
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0,
      messages: [
        { role: 'system', content: AUDIT_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('audit ' + resp.status);
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content);
}

(async () => {
  // Pull 100 random words from TOPIK 1+2 (6 parts).
  const slugs = ['topik-1-part-1', 'topik-1-part-2', 'topik-1-part-3', 'topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3'];
  const allWords = [];
  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    if (!list) continue;
    const { data: rows } = await admin.from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of (rows || [])) allWords.push(r.word);
  }
  // Shuffle + take 100
  const SAMPLE_SIZE = 100;
  for (let i = allWords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allWords[i], allWords[j]] = [allWords[j], allWords[i]];
  }
  const sample = allWords.slice(0, SAMPLE_SIZE);
  console.log(`Sample size: ${sample.length} / ${allWords.length} total TOPIK 1+2 words\n`);

  let pass = 0, flag = 0, err = 0;
  const results = [];
  for (let i = 0; i < sample.length; i++) {
    const word = sample[i];
    process.stdout.write(`[${String(i + 1).padStart(3)}/${sample.length}] ${word.padEnd(15)} ... `);
    try {
      const r = await generate(word);
      const aud = await audit(word, r);
      if (aud.verdict === 'PASS') { pass++; console.log('✓'); }
      else {
        flag++;
        const reasons = (aud.issues || []).map(i => `[${i.category}] ${i.problem.slice(0, 80)}`).join('; ');
        console.log(`✗ ${reasons.slice(0, 150)}`);
      }
      results.push({ word, verdict: aud.verdict, issues: aud.issues || [] });
    } catch (e) {
      err++;
      console.log(`! ERR ${e.message.slice(0, 60)}`);
      results.push({ word, error: e.message });
    }
  }
  console.log(`\n══ BROAD AUDIT RESULTS ══`);
  console.log(`PASS: ${pass}/${sample.length} (${(100 * pass / sample.length).toFixed(1)}%)`);
  console.log(`FLAG: ${flag}/${sample.length} (${(100 * flag / sample.length).toFixed(1)}%)`);
  if (err) console.log(`ERR:  ${err}`);
  console.log(`\nWorst-case sample (30): 17% flag → expected broad: lower`);

  fs.writeFileSync(path.resolve(__dirname, 'v3-broad-audit-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n→ scripts/curation/v3-broad-audit-results.json`);
})().catch(e => { console.error(e); process.exit(1); });
