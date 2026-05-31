require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const r = await admin.from('wiktionary_entries').select('id,word,pos,etymology_number,senses').eq('word', 'the').eq('lang', 'en');
  r.data?.forEach(row => {
    console.log(`\n=== id=${row.id} pos=${row.pos} etym=${row.etymology_number} ===`);
    (row.senses || []).slice(0, 5).forEach((s, i) => {
      console.log(`  [${i}] gloss="${s.gloss?.slice(0,120)}"`);
      const t = s.translations;
      if (t) {
        for (const lang of ['ko','ja','zh-CN','es','fr','de','it']) {
          if (t[lang]) console.log(`      ${lang}: ${t[lang]}`);
        }
      }
    });
  });
})();
