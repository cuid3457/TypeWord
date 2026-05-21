import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data } = await c.from('user_words').select('word, result_json').eq('book_id', '8ccfae26-2423-45f9-8922-ddb6261cd0b2').order('word');

for (const w of data) {
  const r = w.result_json;
  console.log(`\n=== "${w.word}" ===`);
  const meanings = r?.meanings ?? [];
  for (let i = 0; i < meanings.length; i++) {
    console.log(`  [${i}] (${meanings[i].partOfSpeech}) ${meanings[i].definition}`);
  }
  const examples = r?.examples ?? [];
  for (const e of examples) {
    console.log(`  ex: ${e.sentence}`);
  }
}
