require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function probe(word, sl, tl, label) {
  const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang: sl, targetLang: tl, forceFreshTranslation: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log(`\n${label}: ${word} (${sl}→${tl})`);
  console.log('reading:', j.result?.reading);
  (j.result?.meanings || []).forEach((x, i) => console.log(`  ${i+1}. ${x.definition || x.target_translation} [${x.partOfSpeech || '-'}]`));
}
(async () => {
  // 行 (háng) POS empty test
  await probe('行', 'zh-CN', 'en', 'háng en');
  await probe('行', 'zh-CN', 'fr', 'háng fr');
  await probe('行', 'zh-CN', 'ja', 'háng ja');
})();
