/**
 * TOPIK 1 fix pass:
 *  Step A — Strip headword from synonyms (and parenthesized variants)
 *  Step B — Delete rows that need re-curation (will be re-fetched by curate-wordlist)
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Step A — synonym cleanup. Remove entries that equal the headword (case-
// insensitive trim) or that wrap the headword in parens.
const SYN_FIXES = [
  { slug: 'topik-1-part-1', word: '바지' },
  { slug: 'topik-1-part-1', word: '다리' },
  { slug: 'topik-1-part-1', word: '앉다' },
  { slug: 'topik-1-part-2', word: '옷가게' },
  { slug: 'topik-1-part-2', word: '이야기' },
  { slug: 'topik-1-part-3', word: '기자' },
  { slug: 'topik-1-part-3', word: '옷장' },
];

// Step B — re-curation targets (delete row, then run curate-wordlist.js to
// re-fetch fresh).
const RECURATE = [
  { slug: 'topik-1-part-1', word: '지금' },
  { slug: 'topik-1-part-1', word: '십' },
  { slug: 'topik-1-part-1', word: '한국' },
  { slug: 'topik-1-part-1', word: '거기' },
  { slug: 'topik-1-part-1', word: '천천히' },
  { slug: 'topik-1-part-2', word: '결혼' },
  { slug: 'topik-1-part-2', word: '조카' },
  { slug: 'topik-1-part-3', word: '파랗다' },
];

async function getListId(slug) {
  const { data } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
  return data?.id;
}

async function fixSyn({ slug, word }) {
  const id = await getListId(slug);
  const { data: row } = await admin.from('curated_words')
    .select('results_by_target_lang').eq('curated_wordlist_id', id).eq('word', word).maybeSingle();
  if (!row) return console.log(`  ✗ [${slug}] ${word}: row missing`);
  const updated = { ...row.results_by_target_lang };
  let changed = false;
  for (const lang of Object.keys(updated)) {
    const r = updated[lang];
    if (!Array.isArray(r.synonyms)) continue;
    const before = r.synonyms.length;
    r.synonyms = r.synonyms.filter((s) => {
      if (typeof s !== 'string') return false;
      const t = s.trim();
      if (t === word) return false;                       // exact dupe
      if (t.toLowerCase() === word.toLowerCase()) return false;
      // Parenthesized variant whose lead matches headword
      const lead = t.split(/[\s\(（]/)[0].trim();
      if (lead === word) return false;
      return true;
    });
    if (r.synonyms.length !== before) changed = true;
  }
  if (!changed) return console.log(`  · [${slug}] ${word}: no syn changes`);
  const { error } = await admin.from('curated_words')
    .update({ results_by_target_lang: updated })
    .eq('curated_wordlist_id', id).eq('word', word);
  if (error) return console.log(`  ✗ [${slug}] ${word}: ${error.message}`);
  console.log(`  ✓ [${slug}] ${word}: synonyms cleaned`);
}

async function deleteRow({ slug, word }) {
  const id = await getListId(slug);
  const { error, count } = await admin.from('curated_words')
    .delete({ count: 'exact' })
    .eq('curated_wordlist_id', id).eq('word', word);
  if (error) return console.log(`  ✗ [${slug}] ${word}: ${error.message}`);
  console.log(`  ✓ [${slug}] ${word}: deleted (${count} rows)`);
}

async function main() {
  console.log('=== Step A: synonym cleanup ===');
  for (const f of SYN_FIXES) await fixSyn(f);

  console.log('\n=== Step B: delete rows for re-curation ===');
  for (const r of RECURATE) await deleteRow(r);

  console.log('\nNext: run curate-wordlist.js for parts 1, 2, 3 to re-fetch missing words');
  console.log('  node scripts/curation/curate-wordlist.js scripts/curation/data/topik-1-part-1.json --concurrency=4');
  console.log('  node scripts/curation/curate-wordlist.js scripts/curation/data/topik-1-part-2.json --concurrency=4');
  console.log('  node scripts/curation/curate-wordlist.js scripts/curation/data/topik-1-part-3.json --concurrency=4');
  console.log('Note: 노릇하다 row will be auto-removed by reconcileExtraneous; 샛노랗다 will be added.');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
