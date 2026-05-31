require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const w of ['difficult', 'fun', 'easy', 'pretty', 'beautiful', 'heavy', 'cute']) {
    const r = await admin.from('wiktionary_entries').select('word,pos,senses').eq('word', w).eq('lang', 'en').limit(3);
    r.data?.forEach(row => console.log(`${row.word} pos=${row.pos}, senses[0].translations_ko=${row.senses?.[0]?.translations?.ko || 'n/a'}`));
  }
})();
