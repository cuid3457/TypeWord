require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function probe(word, sourceLang, targetLang) {
  // translate=true means: user typed `word` in TARGET (their native) lang, wants SOURCE (study) lang candidates
  const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang, targetLang, translate: true }),
  });
  const j = await r.json();
  console.log(`\n=== reverse "${word}" study=${sourceLang} native=${targetLang} ===`);
  console.log(JSON.stringify(j, null, 2).slice(0, 600));
}

(async () => {
  // User searched "노래" in fr→ko wordlist (study=fr, native=ko)
  await probe('노래', 'fr', 'ko');
  await probe('사과', 'fr', 'ko');
  await probe('사랑', 'fr', 'ko');
})();
