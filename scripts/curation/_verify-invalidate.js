const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { count } = await admin.from('word_entries').select('*', { count: 'exact', head: true })
    .eq('has_enrich', true).eq('synonyms', '{}').eq('antonyms', '{}');
  console.log('remaining stale:', count);
  const { count: total } = await admin.from('word_entries').select('*', { count: 'exact', head: true }).eq('has_enrich', true);
  console.log('has_enrich=true total:', total);
})();
