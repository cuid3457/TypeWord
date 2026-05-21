import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BOOK_ID = '8ccfae26-2423-45f9-8922-ddb6261cd0b2';

const targets = ['42', '100', '1984', '3.14', '@', 'kick the bucket'];
const { data } = await c.from('user_words').select('word, result_json').eq('book_id', BOOK_ID).in('word', targets);

for (const r of data ?? []) {
  console.log(`=== ${r.word} ===`);
  for (const [i, m] of (r.result_json?.meanings ?? []).entries()) {
    console.log(`  [${i}] (${m.partOfSpeech}) ${m.definition}`);
  }
  for (const [i, e] of (r.result_json?.examples ?? []).entries()) {
    console.log(`  ex[m=${e.meaningIndex ?? 0}] ${e.sentence} → ${e.translation}`);
  }
}
