import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

// Find sample books
const { data: books } = await c.from('books').select('id,title').eq('user_id', USER_ID).like('title', '샘플 검증%');

// Check updated_at distribution of user_words in those books
const now = Date.now();
let recentCount = 0, totalCount = 0;
const byBook = {};
for (const b of books) {
  const { data: ws } = await c.from('user_words').select('word,updated_at,result_json').eq('book_id', b.id);
  byBook[b.title] = { total: ws.length, recent: 0 };
  for (const w of ws) {
    totalCount++;
    const t = new Date(w.updated_at).getTime();
    const ageMin = (now - t) / 60000;
    if (ageMin < 10) {
      recentCount++;
      byBook[b.title].recent++;
    }
  }
}
console.log(`Total user_words: ${totalCount}`);
console.log(`Updated in last 10 min: ${recentCount}`);
console.log('\nPer book:');
for (const [t, c] of Object.entries(byBook)) console.log(`  ${t}: recent=${c.recent}/${c.total}`);

// Check 배 specifically (current state)
const { data: bae } = await c.from('user_words').select('result_json,updated_at').eq('word','배').eq('user_id', USER_ID).single();
if (bae) {
  const r = bae.result_json;
  console.log(`\n배 latest updated_at: ${bae.updated_at}`);
  console.log(`  meanings: ${r?.meanings?.length ?? 0}, examples: ${r?.examples?.length ?? 0}`);
  (r?.meanings ?? []).forEach((m, i) => console.log(`    m[${i}]: ${m.definition}`));
  (r?.examples ?? []).forEach((e) => console.log(`    ex(mi=${e.meaningIndex}): ${e.sentence}`));
}
