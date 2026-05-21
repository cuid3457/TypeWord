// Inspect polysemy samples post-reprocess
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const targets = [
  { word: '배', src: 'ko' },
  { word: '다리', src: 'ko' },
  { word: '눈', src: 'ko' },
  { word: 'bank', src: 'en' },
  { word: 'bat', src: 'en' },
  { word: 'spring', src: 'en' },
  { word: 'livre', src: 'fr' },
  { word: 'Bank', src: 'de' },
  { word: 'Schloss', src: 'de' },
  { word: 'Mutter', src: 'de' },
];

for (const t of targets) {
  const { data: book } = await c.from('books').select('id').eq('user_id', USER_ID).eq('source_lang', t.src).like('title', '샘플 검증%').single();
  if (!book) continue;
  const { data: w } = await c.from('user_words').select('result_json').eq('book_id', book.id).eq('word', t.word).maybeSingle();
  if (!w) { console.log(`${t.src}: ${t.word} — not found`); continue; }
  const r = w.result_json;
  console.log(`\n${t.src}: ${t.word}`);
  (r?.meanings ?? []).forEach((m, i) => console.log(`  m[${i}]: (${m.partOfSpeech}) ${m.definition}`));
  (r?.examples ?? []).forEach((e) => console.log(`  ex(mi=${e.meaningIndex}): ${e.sentence}  →  ${e.translation ?? ''}`));
  const indices = (r?.examples ?? []).map((e) => e.meaningIndex ?? 0);
  const sorted = [...indices].sort((a,b)=>a-b);
  const isSorted = indices.every((v,i)=>v===sorted[i]);
  console.log(`  examples sorted? ${isSorted ? 'YES' : 'NO ' + JSON.stringify(indices)}`);
}
