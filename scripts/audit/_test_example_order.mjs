// Test that examples come back sorted by meaning_index.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function look(word, src, tgt) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang: src, targetLang: tgt, mode: 'enrich', forceFresh: true }),
  });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  return await r.json();
}

const cases = [
  { word: '배', src: 'ko', tgt: 'en' },      // ship/pear/belly — same POS
  { word: 'bank', src: 'en', tgt: 'ko' },    // money / river — same POS
  { word: 'spring', src: 'en', tgt: 'ko' },  // season / coil / water — same POS
  { word: '눈', src: 'ko', tgt: 'en' },      // eye / snow — same POS
];

for (const c of cases) {
  const r = await look(c.word, c.src, c.tgt);
  console.log(`${c.src}→${c.tgt}: "${c.word}"`);
  if (r.error) { console.log(`  ERR: ${r.error}`); continue; }
  const result = r.result;
  const meanings = result?.meanings ?? [];
  const examples = result?.examples ?? [];
  meanings.forEach((m, i) => console.log(`  m[${i}]: (${m.partOfSpeech}) ${m.definition}`));
  examples.forEach((e) => {
    const inOrder = e.meaningIndex !== undefined ? `mi=${e.meaningIndex}` : '?';
    console.log(`  ex(${inOrder}): ${e.sentence}`);
  });
  // Verify sorted
  const indices = examples.map((e) => e.meaningIndex ?? 0);
  const sorted = [...indices].sort((a,b)=>a-b);
  const isSorted = indices.every((v,i)=>v===sorted[i]);
  console.log(`  examples sorted by mi? ${isSorted ? 'YES ✓' : 'NO ✗ ' + JSON.stringify(indices)}`);
  console.log();
}
