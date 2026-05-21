const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const { data, error, count } = await admin.from('word_entries')
    .update({ has_enrich: false })
    .eq('has_enrich', true)
    .eq('synonyms', '{}')
    .eq('antonyms', '{}')
    .select('id', { count: 'exact', head: true });
  if (error) { console.error(error); process.exit(1); }
  console.log(`Invalidated has_enrich on ${count ?? 'N/A'} word_entries rows.`);
})();
