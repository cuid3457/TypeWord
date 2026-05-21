// Generate 120 JLPT N4 filler words to replace failed entries.
// Strict: canonical single-word/verb-suru/i-adj/na-adj only, no compound nonsense.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (w) => String(w).trim();

async function fetchExisting() {
  const slugs = ['jlpt-n5-part-1','jlpt-n5-part-2','jlpt-n4-part-1','jlpt-n4-part-2','jlpt-n4-part-3'];
  const set = new Set();
  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin.from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of (data || [])) set.add(norm(r.word));
  }
  return set;
}

const SYS = `Japanese lexicographer for JLPT N4 vocabulary.

Produce GENUINE N4 vocabulary — strictly canonical dictionary entries that a Japanese monolingual dictionary would list as a single headword.

ABSOLUTE RULES:
1. Every entry must be a REAL dictionary headword from N4-level frequency.
2. NEVER fabricate compounds. NEVER chain unrelated kanji. NEVER produce sentence fragments.
3. Allowed shapes:
   - Single noun (kanji or kana): 経験, 計画, アルバイト, おかげ
   - Verb dictionary form (godan/ichidan/suru): 集める, 続ける, 努力する, 卒業する
   - i-adjective ending in い: 厳しい, 親切, 暖かい
   - na-adjective bare stem (no な): 簡単, 特別, 自由
   - Adverb: もうすぐ, ずっと, ちょうど, きっと
4. NO entries longer than 6 Japanese characters (kanji+okurigana combined). If a longer compound is genuinely N4-listed (e.g. お疲れ様, よろしくお願いします) it's OK, but compound chains are not.
5. NO topic-specific neologisms or domain jargon.

Output JSON: {"words": [...]} — exactly N entries.`;

async function gen(exclude, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.4,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `EXCLUSION (${exclude.length} words already listed):\n${exclude.join(', ')}\n\nProduce ${n} NEW genuine JLPT N4 dictionary headwords.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).words || [];
}

(async () => {
  const target = 120;
  const baseExclude = [...await fetchExisting()];
  console.log('Excluding:', baseExclude.length);
  const seen = new Set();
  const out = [];
  let attempts = 0;
  while (out.length < target && attempts < 6) {
    attempts++;
    const exclude = [...baseExclude, ...Array.from(seen)];
    const batch = await gen(exclude, 180);
    let added = 0;
    for (const w of batch) {
      const k = norm(w);
      // Length cap: max 10 Japanese chars to filter compound chains
      if ([...k].length > 10) continue;
      if (seen.has(k) || baseExclude.includes(k)) continue;
      seen.add(k);
      out.push(k);
      added++;
      if (out.length >= target) break;
    }
    console.log(`attempt ${attempts}: +${added} → ${out.length}/${target}`);
    if (added === 0) break;
  }
  fs.writeFileSync('/tmp/n4-fillers.json', JSON.stringify({ words: out }, null, 2));
  console.log('Saved:', out.slice(0, 20).join(', '), '...');
})().catch(e => { console.error(e); process.exit(1); });
