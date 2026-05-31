require('dotenv').config({ path: '.env.local' });
const SUPA = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  for (const [w, sl, tl] of [['the','en','ko'],['the','en','ja'],['the','en','zh-CN'],['the','en','es'],['the','en','fr'],['the','en','de'],['the','en','it']]) {
    const r = await fetch(`${SUPA}/functions/v1/word-lookup-v4`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: w, sourceLang: sl, targetLang: tl, forceFreshTranslation: true, runEnrich: true }),
    });
    const j = await r.json();
    const m = (j.result?.meanings || []).map(x => `${x.definition} [${x.partOfSpeech || '-'}]`).join(' | ');
    const ex = (j.result?.examples || []).slice(0,1).map(e => `${e.sentence} → ${e.translation}`).join(' | ');
    console.log(`the (en→${tl}):\n  meanings: ${m}\n  example: ${ex}\n`);
  }
})();
