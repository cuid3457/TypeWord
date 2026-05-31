require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Check reverse_lookups cache for 노래
  const r = await admin.from('reverse_lookups').select('*').eq('input_word', '노래');
  console.log('reverse_lookups for 노래:');
  r.data?.forEach(row => console.log(JSON.stringify(row, null, 2)));
})();
