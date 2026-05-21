// Generate 900 NEW JLPT N4-target Japanese vocabulary, excluding N5 (600
// existing words) and any already-curated N4. Output split into 3 chunks
// of 300 for parts 1/2/3.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY missing');

const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (w) => String(w).trim();

async function fetchExisting() {
  const slugs = ['jlpt-n5','jlpt-n5-part-1','jlpt-n5-part-2','jlpt-n4','jlpt-n4-part-1','jlpt-n4-part-2','jlpt-n4-part-3'];
  const set = new Set();
  for (const slug of slugs) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).maybeSingle();
    if (!list) continue;
    const { data } = await admin.from('curated_words').select('word').eq('curated_wordlist_id', list.id);
    for (const r of (data || [])) set.add(norm(r.word));
  }
  return set;
}

const SYS = `You are a Japanese-language lexicographer specializing in JLPT N4 vocabulary curation.

Produce NEW Japanese vocabulary at JLPT N4 difficulty (post-N5, beginner-intermediate). EXCLUDED from the provided list.

STRICT RULES:
1. Canonical dictionary form ONLY:
   - Verbs (godan / ichidan / suru): dictionary form ending in う/く/す/つ/ぬ/ぶ/む/る (e.g. 飲む, 食べる, 始める, 説明する).
   - i-adjectives: end in い (e.g. 楽しい, 新しい).
   - na-adjectives: bare stem WITHOUT な (e.g. 静か, 親切, 大切).
   - Nouns: bare singular (e.g. 会議, 経験, 文化).
   - Adverbs: standard form (e.g. もうすぐ, ちょうど).
2. Write in NATURAL Japanese orthography:
   - Use kanji when the word is conventionally written with kanji (e.g. 説明する, NOT せつめいする).
   - Use kana-only for words that are conventionally kana (e.g. もうすぐ, あまり).
   - Katakana for loanwords (e.g. アルバイト, パソコン).
3. N4 difficulty target: roughly equivalent to Genki II, Minna no Nihongo Chapters 26-50, or 日本語総まとめ N4. Avoid N5 trivials (water/eat/book) and N3+ advanced (理論, 概念). Focus on everyday-life words a learner just past N5 needs.
4. Cover all categories with rough balance: verbs (~30%), nouns (~40%), adjectives (~15%), adverbs (~10%), other particles/expressions (~5%).
5. NO proper nouns, NO vulgarities, NO archaic forms, NO sub-N5 trivials.

Output JSON: {"words": [...]} — exactly N entries.`;

const DOMAINS = `N4 vocabulary domains to cover with rough balance:
- Daily life (cooking, cleaning, shopping, family)
- School / work (study, exams, meetings, presentations)
- Social interactions (invitations, plans, opinions, feelings)
- Travel / transportation (trains, directions, tickets, sightseeing)
- Health / body (illness, doctor, body parts, exercise)
- Time / scheduling (deadlines, before/after, frequency)
- Emotions / personality (kind, strict, shy, brave)
- Common verbs of motion / change / communication
- Connectives and adverbs (because, although, suddenly, gradually)
- Useful set phrases (お世話になります, 失礼いたします, etc. — only if conventional)`;

async function gen(exclude, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.5,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `${DOMAINS}\n\nEXCLUSION LIST (${exclude.length} words — never reuse, exact-match):\n${exclude.join(', ')}\n\nProduce ${n} new JLPT N4 vocabulary entries in canonical dictionary form, written in natural Japanese orthography.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content).words || [];
}

(async () => {
  const target = 900;
  const baseExclude = [...await fetchExisting()];
  console.log('Excluding:', baseExclude.length, 'existing words');

  const seen = new Set();
  const out = [];
  let attempts = 0;

  while (out.length < target && attempts < 12) {
    attempts++;
    const need = target - out.length;
    const reqN = Math.max(need * 2, 200);
    const exclude = [...baseExclude, ...Array.from(seen)];
    console.log(`attempt ${attempts}: ${out.length}/${target}, asking ${reqN}, exclude ${exclude.length}`);
    const batch = await gen(exclude, reqN);
    const exSet = new Set(exclude);
    let added = 0;
    for (const w of batch) {
      const k = norm(w);
      if (seen.has(k) || exSet.has(k)) continue;
      seen.add(k);
      out.push(k);
      added++;
      if (out.length >= target) break;
    }
    console.log(`  +${added} → ${out.length}`);
    if (added === 0) break;
  }

  fs.writeFileSync('/tmp/jlpt-n4-all.json', JSON.stringify({ words: out }, null, 2));
  console.log(`\nSaved ${out.length} to /tmp/jlpt-n4-all.json`);
  console.log('Sample first 20:', out.slice(0, 20).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
