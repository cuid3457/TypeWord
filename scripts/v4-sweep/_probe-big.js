require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: 'big', sourceLang: 'en', targetLang: 'ko', forceFreshTranslation: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log('reading:', j.result?.reading);
  (j.result?.meanings || []).forEach((x, i) => console.log(`  ${i+1}. ${x.definition || x.target_translation} [${x.partOfSpeech || '-'}]`));
})();
