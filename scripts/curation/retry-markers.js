const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (s) => (s || '').replace(/['']/g, "'").toLowerCase().trim().normalize('NFC');

function check(word, lang, r, sourceLang) {
  const issues = [];
  if (!r) return ['NO_RESULT'];
  if (!Array.isArray(r.examples) || r.examples.length === 0) issues.push('NO_EXAMPLES');
  else r.examples.forEach((ex, i) => {
    if (!ex.sentence?.trim()) issues.push('EMPTY_SENT[' + i + ']');
    else if (!/\*\*[^*]+\*\*/.test(ex.sentence)) issues.push('NO_MARKER_SENT[' + i + ']');
    if (!ex.translation?.trim()) issues.push('EMPTY_TRANS[' + i + ']');
    else if (!/\*\*[^*]+\*\*/.test(ex.translation)) issues.push('NO_MARKER_TRANS[' + i + ']');
  });
  return issues;
}

async function lookup(word, sourceLang, targetLang) {
  // v2 single enrich call returns full result (meanings + examples + syn/ant).
  const r = await admin.functions.invoke('word-lookup-v2', {
    body: { word, sourceLang, targetLang, mode: 'enrich', forceFresh: true },
  });
  if (r.error) throw new Error('lookup: ' + r.error.message);
  const result = r.data?.result;
  if (!result || !Array.isArray(result.meanings) || result.meanings.length === 0) return null;
  return result;
}

async function main() {
  // 1. Find all flagged word/lang pairs across all active wordlists
  const { data: lists } = await admin.from('curated_wordlists').select('id, slug, source_lang').eq('is_active', true);
  const flagged = [];
  for (const list of lists) {
    const { data: rows } = await admin.from('curated_words').select('id, word, results_by_target_lang').eq('curated_wordlist_id', list.id);
    for (const row of rows) {
      for (const lang of Object.keys(row.results_by_target_lang)) {
        const issues = check(row.word, lang, row.results_by_target_lang[lang], list.source_lang);
        if (issues.length > 0 && !issues.every(i => i.startsWith('NO_IPA'))) {
          flagged.push({ slug: list.slug, sourceLang: list.source_lang, rowId: row.id, word: row.word, lang, issues });
        }
      }
    }
  }
  console.log(`Found ${flagged.length} flagged word/lang pairs across ${lists.length} wordlists`);

  // 2. Worker pool
  const CONCURRENCY = 6;
  let cursor = 0;
  let fixed = 0, stillIssues = 0, failed = 0;

  async function processOne(item) {
    try {
      const result = await lookup(item.word, item.sourceLang, item.lang);
      if (!result) { failed++; console.log(`✗ ${item.slug}/${item.word}(${item.lang}): no result`); return; }
      const remainingIssues = check(item.word, item.lang, result, item.sourceLang).filter(i => !i.startsWith('NO_IPA'));
      // Fetch current row to merge
      const { data: row } = await admin.from('curated_words').select('results_by_target_lang').eq('id', item.rowId).single();
      const merged = { ...row.results_by_target_lang, [item.lang]: result };
      await admin.from('curated_words').update({ results_by_target_lang: merged }).eq('id', item.rowId);
      if (remainingIssues.length === 0) {
        fixed++;
      } else {
        stillIssues++;
        console.log(`◐ ${item.slug}/${item.word}(${item.lang}) still: ${remainingIssues.join(', ')}`);
      }
    } catch (e) {
      failed++;
      console.log(`✗ ${item.slug}/${item.word}(${item.lang}): ${e.message}`);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= flagged.length) return;
      await processOne(flagged[i]);
      if ((i + 1) % 10 === 0) console.log(`  [${i + 1}/${flagged.length}] fixed=${fixed} still=${stillIssues} failed=${failed}`);
    }
  });
  await Promise.all(workers);

  console.log(`\nDone: ${fixed} fixed, ${stillIssues} still issues, ${failed} failed (of ${flagged.length} total)`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
