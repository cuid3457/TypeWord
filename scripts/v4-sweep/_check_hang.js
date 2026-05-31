require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const r = await admin.from('cedict_entries').select('id,traditional,simplified,pinyin,senses').or('simplified.eq.行,traditional.eq.行');
  r.data?.forEach(row => console.log(JSON.stringify(row)));
})();
