// Spot-verify loanword native form + proper noun diversity across all sources.
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
  // Loanword native form
  { word: '사이다', src: 'ko', tgt: 'en', focus: 'def → soft drink/lemon-lime soda?' },
  { word: 'コーヒー', src: 'ja', tgt: 'ko', focus: 'def → 커피' },
  { word: '咖啡', src: 'zh-CN', tgt: 'ko', focus: 'def → 커피' },
  { word: 'café', src: 'es', tgt: 'ko', focus: 'def → 커피' },
  // Proper noun diversity
  { word: '서울', src: 'ko', tgt: 'en', focus: 'example shape (travel/activity/use/event)' },
  { word: '東京', src: 'ja', tgt: 'ko', focus: 'natural shape' },
  { word: '北京', src: 'zh-CN', tgt: 'ko', focus: 'natural shape' },
  { word: 'Madrid', src: 'es', tgt: 'ko', focus: 'natural shape' },
  { word: 'Paris', src: 'fr', tgt: 'ko', focus: 'natural shape' },
];

for (const c of cases) {
  const r = await look(c.word, c.src, c.tgt);
  console.log(`${c.src}→${c.tgt}: "${c.word}" — ${c.focus}`);
  if (r.error) { console.log(`  ERR: ${r.error}`); continue; }
  const result = r.result;
  for (const m of (result?.meanings ?? [])) console.log(`  def: (${m.partOfSpeech}) ${m.definition}`);
  for (const e of (result?.examples ?? [])) console.log(`  ex: ${e.sentence}`);
  console.log();
}
