require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function probe(word, sl, tl, label) {
  const url = `${SUPA}/functions/v1/word-lookup-v4`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang: sl, targetLang: tl, forceFreshTranslation: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log(`\n=== ${label}: ${word} (${sl}→${tl}) ===`);
  const meanings = j.result?.meanings || j.meanings || [];
  meanings.forEach((m, i) => {
    console.log(`  ${i+1}. ${m.definition || m.target_translation || m.label} [${m.partOfSpeech || m.pos || '-'}]`);
  });
}

(async () => {
  // Re-test cases the old sweep showed in attributive form
  await probe('mature', 'en', 'ko', 'EN mature → ko (expect 성숙하다)');
  await probe('big', 'en', 'ko', 'EN big → ko (expect 큰→크다)');
  await probe('bright', 'en', 'ko', 'EN bright → ko (expect 밝다)');
  await probe('go', 'en', 'ko', 'EN go → ko (expect 가다)');
  await probe('grande', 'es', 'ko', 'ES grande → ko (expect 크다)');
  await probe('sweet', 'en', 'ko', 'EN sweet → ko (expect 달다 or 감미롭다)');
  // Sino-Korean preserved
  await probe('research', 'en', 'ko', 'EN research → ko (expect 연구하다)');
  await probe('love', 'en', 'ko', 'EN love → ko (expect 사랑하다 if verb)');
})();
