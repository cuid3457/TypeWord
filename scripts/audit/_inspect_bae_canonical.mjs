// Inspect the canonical word_entry for 배 to see what definitions look like
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: entry } = await c.from('word_entries').select('*').eq('word','배').eq('word_lang','ko').single();
if (entry) {
  console.log('=== word_entries for 배 ===');
  console.log('headword:', entry.headword);
  console.log('meanings:', JSON.stringify(entry.meanings, null, 2));
  console.log('examples:', JSON.stringify(entry.examples, null, 2));
}

const { data: trans } = await c.from('word_translations').select('*').eq('word_entry_id', entry.id).eq('target_lang','en').single();
if (trans) {
  console.log('\n=== word_translations (ko→en) ===');
  console.log('meanings_translated:', JSON.stringify(trans.meanings_translated, null, 2));
  console.log('examples_translated:', JSON.stringify(trans.examples_translated, null, 2));
}
