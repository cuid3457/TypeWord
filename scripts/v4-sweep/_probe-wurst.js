require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: 'das ist mir Wurst', sourceLang: 'de', targetLang: 'en', forceFreshTranslation: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log(JSON.stringify(j.result?.meanings, null, 2));
})();
