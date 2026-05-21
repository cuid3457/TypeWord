// Retry the 10 failed (word, lang) combos from TOPIK 2 curation.
// Canonical is already saved (other langs succeeded), so just enrich the
// missing translation for each specific lang.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const FAILURES = [
  { slug: 'topik-2-part-3', word: '누르다',   langs: ['en', 'zh-CN', 'de'] },
  { slug: 'topik-2-part-3', word: '당기다',   langs: ['ja', 'fr', 'de'] },
  { slug: 'topik-2-part-3', word: '베다',     langs: ['en'] },
  { slug: 'topik-2-part-3', word: '송이',     langs: ['de'] },
  { slug: 'topik-2-part-3', word: '일으키다', langs: ['ja'] },
  { slug: 'topik-2-part-2', word: '내리다',   langs: ['es'] },
];

async function retryOne(slug, word, lang, listCache, maxRetries = 3) {
  if (!listCache[slug]) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, source_lang, exam_type, level').eq('slug', slug).single();
    listCache[slug] = list;
  }
  const list = listCache[slug];
  const proficiencyHint = deriveProficiencyHint(list);

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const r = await admin.functions.invoke('word-lookup-v2', {
        body: { word, sourceLang: list.source_lang, targetLang: lang, mode: 'enrich', proficiencyHint },
      });
      if (r.error) throw new Error(r.error.message);
      const result = r.data?.result;
      if (!result || !result.meanings?.length) throw new Error('empty result');

      const { data: row } = await admin.from('curated_words')
        .select('reading_key, display_order, results_by_target_lang')
        .eq('curated_wordlist_id', list.id).eq('word', word).single();
      const newResults = { ...(row.results_by_target_lang || {}), [lang]: result };
      await admin.from('curated_words').upsert({
        curated_wordlist_id: list.id, word,
        reading_key: row.reading_key ?? '', display_order: row.display_order,
        results_by_target_lang: newResults,
      }, { onConflict: 'curated_wordlist_id,word,reading_key' });
      return { status: 'OK', attempt };
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        const backoff = 500 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  return { status: 'FAIL', error: lastErr.message };
}

(async () => {
  const listCache = {};
  let okCount = 0, failCount = 0;
  const failures = [];
  for (const f of FAILURES) {
    for (const lang of f.langs) {
      process.stdout.write(`[${f.slug}] ${f.word} (${lang}) ... `);
      const r = await retryOne(f.slug, f.word, lang, listCache);
      if (r.status === 'OK') {
        console.log(`OK (attempt ${r.attempt})`);
        okCount++;
      } else {
        console.log(`FAIL — ${r.error}`);
        failCount++;
        failures.push({ ...f, lang, error: r.error });
      }
    }
  }
  console.log(`\n══ Summary ══`);
  console.log(`  Recovered: ${okCount}`);
  console.log(`  Still failing: ${failCount}`);
  if (failures.length) console.log('\nRemaining failures:', JSON.stringify(failures, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
