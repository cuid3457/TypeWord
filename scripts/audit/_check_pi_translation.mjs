import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await c.from('user_words').select('word, result_json').eq('book_id', '8ccfae26-2423-45f9-8922-ddb6261cd0b2').in('word', ['3.14', '42', '1984', 'ice cream', 'Seoul']);
for (const w of data) {
  console.log(`\n=== ${w.word} ===`);
  console.log(JSON.stringify(w.result_json.examples ?? [], null, 2));
}
