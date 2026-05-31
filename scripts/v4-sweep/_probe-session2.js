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
  console.log(`\n=== ${label}: ${word} (${sl}→${tl}) ===`);
  console.log('reading:', j.result?.reading);
  (j.result?.meanings || []).forEach((x, i) => console.log(`  ${i+1}. ${x.definition || x.target_translation} [${x.partOfSpeech || '-'}]`));
}

(async () => {
  // 1. Proper noun bio truncation
  await probe('习近平', 'zh-CN', 'en', '1. Xi Jinping bio truncation (expect just "Xi Jinping")');
  await probe('钓鱼岛', 'zh-CN', 'ko', '2. Diaoyu Islands → ko (expect NOT 독도)');

  // 2. ㅂ-irregular Korean attributive
  await probe('heavy', 'en', 'ko', '3. heavy → ko (expect 무겁다, not 무거운)');
  await probe('cute', 'en', 'ko', '4. cute → ko (expect 귀엽다, not 귀여운)');

  // 3. Profanity meta-label
  await probe('씨발', 'ko', 'en', '5. 씨발 → en (expect actual word, not "profanity")');
  await probe('傻逼', 'zh-CN', 'en', '6. 傻逼 → en (expect actual word, not "vulgar insult")');

  // 4. (verbo) meta-paren strip
  await probe('è', 'it', 'es', '7. è → es (expect "es", not "es (verbo)")');

  // 5. zh-CN POS empty (classifier)
  await probe('行', 'zh-CN', 'en', '8. 行 → en (expect POS not "-")');
  await probe('行', 'zh-CN', 'fr', '9. 行 → fr (expect POS not "-")');

  // 6. Neologism def leak
  await probe('computer', 'ko', 'it', '10. computer → it (expect "computer", not English def)');
  await probe('日本語', 'zh-CN', 'ja', '11. 日本語 → ja (expect 日本語, not English def)');

  // Sanity (existing fixes shouldn't regress)
  await probe('big', 'en', 'ko', '12. big → ko (sanity: 크다)');
  await probe('万', 'zh-CN', 'en', '13. 万 reading sanity (wàn)');
  await probe('一举两得', 'zh-CN', 'en', '14. one stone two birds sanity');
})();
