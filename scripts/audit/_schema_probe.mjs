import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function probe(table) {
  const { data, error } = await c.from(table).select('*').limit(1);
  console.log(`\n=== ${table} ===`);
  if (error) { console.log(error.message); return; }
  if (!data || data.length === 0) { console.log('(empty)'); return; }
  for (const k of Object.keys(data[0])) {
    const v = data[0][k];
    const s = typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v).slice(0, 80);
    console.log(`  ${k.padEnd(24)} ${s}`);
  }
}

await probe('curated_words');
await probe('books');
await probe('user_words');
await probe('word_entries');
await probe('word_translations');
