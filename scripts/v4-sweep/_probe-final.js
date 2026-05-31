require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function probe(word, sl, tl, label) {
  const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang: sl, targetLang: tl, forceFresh: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log(`\n=== ${label}: ${word} (${sl}→${tl}) ===`);
  console.log('reading:', j.result?.reading);
  const m = j.result?.meanings || [];
  m.forEach((x, i) => console.log(`  ${i+1}. ${x.definition || x.target_translation} [${x.partOfSpeech || '-'}]`));
}

(async () => {
  // Verify stripMetaPrefix quoted form
  await probe('das ist mir Wurst', 'de', 'en', 'idiom quoted form');
  // Verify sth abbreviation expanded
  await probe('画蛇添足', 'zh-CN', 'en', 'sth abbreviation');
  // Verify wrong-script script-mismatch caught for ja→fr 生
  await probe('生', 'ja', 'fr', 'ja 生 → fr no Hangul');
  // Verify 万 reading still correct
  await probe('万', 'zh-CN', 'en', '万 wàn');
  // Verify Korean attributive fix still working
  await probe('big', 'en', 'ko', 'attributive 큰→크다');
})();
