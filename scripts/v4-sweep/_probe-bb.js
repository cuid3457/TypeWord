require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  for (const w of ['difficult', 'fun', 'easy', 'pretty', 'beautiful']) {
    const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: w, sourceLang: 'en', targetLang: 'ko', forceFresh: true, runEnrich: true }),
    });
    const j = await r.json();
    console.log(`${w}:`, (j.result?.meanings || []).map(x => x.definition).join(' | '));
  }
})();
