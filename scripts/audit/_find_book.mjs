import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await c.from('books').select('id, user_id, title, source_lang, target_lang, study_lang, created_at').order('created_at', { ascending: false }).limit(50);
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${data.length} books:`);
for (const b of data) {
  console.log(`  ${b.id} | "${b.title}" | source=${b.source_lang} target=${b.target_lang} study=${b.study_lang} | ${b.created_at}`);
}
