require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  console.log('=== 习近平 cedict ===');
  const r1 = await admin.from('cedict_entries').select('id,traditional,simplified,pinyin,senses').or('simplified.eq.习近平,traditional.eq.習近平');
  r1.data?.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== 钓鱼岛 cedict ===');
  const r2 = await admin.from('cedict_entries').select('id,traditional,simplified,pinyin,senses').or('simplified.eq.钓鱼岛,traditional.eq.釣魚島');
  r2.data?.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== the wiktionary ===');
  const r3 = await admin.from('wiktionary_entries').select('id,headword,senses,lang').eq('headword', 'the').eq('lang', 'en').limit(1);
  r3.data?.forEach(r => console.log(JSON.stringify(r).slice(0, 800)));
})();
