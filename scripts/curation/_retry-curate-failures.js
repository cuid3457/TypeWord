// Retry the (slug, word, lang) tuples that failed during v3 curate.
// Reads /tmp/topik-curate-failures.txt. Each line: "slug word (lang)".
// For each, calls word-lookup-v2 enrich (no forceFresh — canonical likely
// saved by other langs' successes). 3 retries with exponential backoff.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { deriveProficiencyHint } = require('./_proficiency');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function retryOne(slug, word, lang, listCache, maxRetries = 3) {
  if (!listCache[slug]) {
    const { data: list } = await admin.from('curated_wordlists')
      .select('id, source_lang, exam_type, level').eq('slug', slug).single();
    listCache[slug] = list;
  }
  const list = listCache[slug];
  const proficiencyHint = deriveProficiencyHint(list);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const r = await admin.functions.invoke('word-lookup-v2', {
        body: { word, sourceLang: list.source_lang, targetLang: lang, mode: 'enrich', proficiencyHint },
      });
      if (r.error) throw new Error(r.error.message);
      const result = r.data?.result;
      if (!result?.meanings?.length) throw new Error('empty');

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
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      else return { status: 'FAIL', error: e.message };
    }
  }
}

(async () => {
  const lines = fs.readFileSync('/tmp/topik-curate-failures.txt', 'utf8').split('\n').filter(Boolean);
  const listCache = {};
  let ok = 0, fail = 0;
  const remaining = [];
  for (const line of lines) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\(([^)]+)\)/);
    if (!m) continue;
    const [_, slug, word, lang] = m;
    process.stdout.write(`${slug}/${word} (${lang}) ... `);
    const r = await retryOne(slug, word, lang, listCache);
    if (r.status === 'OK') { ok++; console.log(`OK (attempt ${r.attempt})`); }
    else { fail++; remaining.push({ slug, word, lang, error: r.error }); console.log(`FAIL — ${r.error.slice(0, 60)}`); }
  }
  console.log(`\n══ ${ok} OK / ${fail} still failing ══`);
  if (remaining.length) {
    fs.writeFileSync('/tmp/topik-curate-still-failing.json', JSON.stringify(remaining, null, 2));
    console.log('Remaining → /tmp/topik-curate-still-failing.json');
  }
})().catch(e => { console.error(e); process.exit(1); });
