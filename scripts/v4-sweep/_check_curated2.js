require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // curated_words schema
  const cw = await admin.from('curated_words').select('*').limit(2);
  console.log('curated_words sample columns:', Object.keys(cw.data?.[0] || {}));
  console.log('sample rows:', JSON.stringify(cw.data?.slice(0, 1), null, 2));

  // wiktionary_entries with different schema
  const wk = await admin.from('wiktionary_entries').select('*', { count: 'exact', head: true });
  console.log('wiktionary_entries count:', wk.count, wk.error?.message);

  // user_words result_json schema
  const uw = await admin.from('user_words').select('result_json').not('result_json', 'is', null).limit(1);
  if (uw.data?.[0]?.result_json) {
    console.log('user_words.result_json sample keys:', Object.keys(uw.data[0].result_json));
  }
})();
