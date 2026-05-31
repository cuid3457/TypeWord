require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function probe(word, sl, tl, label) {
  const url = `${SUPA}/functions/v1/word-lookup-v4`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang: sl, targetLang: tl, forceFresh: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log(`\n=== ${label}: ${word} (${sl}→${tl}) ===`);
  console.log('reading:', j.result?.reading);
  const meanings = j.result?.meanings || j.meanings || [];
  meanings.forEach((m, i) => {
    console.log(`  ${i+1}. ${m.definition || m.target_translation || m.label} [${m.partOfSpeech || m.pos || '-'}]`);
  });
}

(async () => {
  await probe('的', 'zh-CN', 'en', '的');
  await probe('万', 'zh-CN', 'it', '万 → it');
  await probe('的', 'zh-CN', 'es', '的 → es');
  await probe('万', 'zh-CN', 'en', '万 reading');
})();
