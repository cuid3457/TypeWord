import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const w of ['학교', '학굣']) {
  const { data } = await c.from('word_entries').select('id,word,word_lang,headword,examples,updated_at').eq('word', w).eq('word_lang', 'ko');
  console.log(`\n=== word_entries for "${w}" ===`);
  for (const e of data ?? []) {
    console.log(`  id=${e.id}, headword=${e.headword}, updated_at=${e.updated_at}`);
    console.log(`  examples: ${JSON.stringify(e.examples)}`);
  }
}
