require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await admin.from('cedict_entries').select('id, traditional, simplified, pinyin, senses').or('simplified.eq.万,traditional.eq.万').limit(20);
  data.forEach(r => console.log(`#${r.id}: ${r.traditional}/${r.simplified} [${r.pinyin}] = ${JSON.stringify(r.senses).slice(0,200)}`));
})();
