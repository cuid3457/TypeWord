require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fwd(word, sl, tl, label) {
  const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang: sl, targetLang: tl, forceFreshTranslation: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log(`\n[FWD] ${label}: ${word} (${sl}→${tl})`);
  console.log('  reading:', j.result?.reading);
  (j.result?.meanings || []).forEach((x, i) => console.log(`  ${i+1}. ${x.definition} [${x.partOfSpeech || '-'}]`));
}

async function reverse(query, sl, tl, label) {
  const r = await fetch(`${SUPA}/functions/v1/reverse-lookup`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, sourceLang: sl, targetLang: tl }),
  });
  const j = await r.json();
  console.log(`\n[REV] ${label}: ${query} (${sl}←${tl})`);
  console.log(JSON.stringify(j, null, 2).slice(0, 800));
}

(async () => {
  await fwd('chanson', 'fr', 'ko', 'fwd chanson');
  await fwd('chantson', 'fr', 'ko', 'fwd chantson (wrong spelling)');
  await reverse('노래', 'fr', 'ko', 'reverse 노래 ko→fr');
})();
