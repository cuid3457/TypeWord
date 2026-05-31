require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function probe(word, sl, tl, label) {
  const url = `${SUPA}/functions/v1/word-lookup-v4`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'apikey': KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ word, sourceLang: sl, targetLang: tl, forceFreshTranslation: true, runEnrich: true }),
  });
  const j = await r.json();
  console.log(`\n=== ${label}: ${word} (${sl}→${tl}) ===`);
  if (!j.meanings) { console.log('NO MEANINGS', JSON.stringify(j).slice(0, 300)); return; }
  j.meanings.forEach((m, i) => {
    console.log(`  ${i+1}. ${m.target_translation || m.label} [${m.pos || '-'}]`);
  });
  if (j.examples) {
    console.log('  examples:');
    j.examples.slice(0, 2).forEach((e) => console.log(`    [m${e.meaning_index||0}+1] ${e.sentence} → ${e.translation}`));
  }
}

(async () => {
  // B: cedict bare "lit." prefix
  await probe('一举两得', 'zh-CN', 'en', 'cedict lit prefix');
  // Cedict leading paren
  await probe('时间', 'zh-CN', 'en', 'cedict leading paren');
  await probe('婀娜', 'zh-CN', 'en', 'cedict leading paren 2');
  // JMdict leading paren
  await probe('逢瀬', 'ja', 'en', 'jmdict leading paren');
  // Semicolon multi-gloss reduce
  await probe('말', 'ko', 'en', 'ko polyseme semicolon');
  await probe('차', 'ko', 'en', 'ko 차 semicolon');
})();
