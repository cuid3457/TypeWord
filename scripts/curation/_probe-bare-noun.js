const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  for (const word of ['문화', '거리', '필요', '쓰기', '예약', '중요']) {
    const { data, error } = await admin.functions.invoke('word-lookup-v2', {
      body: { word, sourceLang: 'ko', targetLang: 'en', mode: 'enrich', proficiencyHint: 'beginner', forceFresh: true },
    });
    if (error) { console.log(`${word} ERROR: ${error.message}`); continue; }
    const r = data?.result;
    if (!r) { console.log(`${word} NULL`); continue; }
    console.log(`\n=== ${word} ===`);
    console.log('meanings:', (r.meanings || []).map(m => `${m.definition} (${m.partOfSpeech})`).join(' | '));
    console.log('examples:', JSON.stringify(r.examples || [], null, 2));
  }
})();
