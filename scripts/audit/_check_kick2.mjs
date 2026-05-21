import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: e } = await c.from('word_entries').select('id, headword, note, meanings, examples, synonyms, antonyms, has_enrich, prompt_version').eq('word', 'kick the bucket').eq('word_lang', 'en').limit(1);
console.log('word_entries:', JSON.stringify(e?.[0], null, 2));

const id = e?.[0]?.id;
if (id) {
  const { data: t } = await c.from('word_translations').select('*').eq('word_entry_id', id).limit(2);
  console.log('word_translations:', JSON.stringify(t, null, 2));
}
