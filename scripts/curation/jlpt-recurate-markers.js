/**
 * JLPT N5 fix pass — phase 4: delete + recurate entries with marker issues.
 * After deletion, run curate-wordlist.js for both parts to re-fetch with the
 * strengthened prompt (reading required, marker boundary rule, modifier rule).
 *
 * Picks entries flagged with S2 (translation marker missing) or S3 (marker
 * doesn't contain headword stem) in jlpt-full-audit-report.json.
 *
 * Also includes the 4 entries whose phase-1 reading lookup failed:
 * 一緒に, 有名, 大切, 失礼します.
 */
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const report = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'jlpt-full-audit-report.json'), 'utf8'));

async function main() {
  const targets = new Set();
  for (const f of report.flags) {
    const issues = f.issues.join('|');
    if (/\bS2:|\bS3:/.test(issues)) {
      targets.add(`${f.slug}|${f.word}`);
    }
  }
  // Include reading-failed words
  for (const w of ['一緒に', '有名', '大切', '失礼します']) {
    const slug = w === '一緒に' ? 'jlpt-n5-part-1' : 'jlpt-n5-part-2';
    targets.add(`${slug}|${w}`);
  }

  console.log(`Targets to delete + re-curate: ${targets.size}`);

  const slugMap = {};
  for (const slug of ['jlpt-n5-part-1', 'jlpt-n5-part-2']) {
    const { data } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    slugMap[slug] = data.id;
  }

  let deleted = 0;
  for (const key of targets) {
    const [slug, word] = key.split('|');
    // Delete curated_words row
    const { error: e1, count } = await admin.from('curated_words')
      .delete({ count: 'exact' })
      .eq('curated_wordlist_id', slugMap[slug]).eq('word', word);
    if (e1) { console.log(`  ✗ ${slug}/${word}: ${e1.message}`); continue; }
    // Clear global_word_cache rows for this word in ja-en + ja-ko
    await admin.from('global_word_cache').delete().like('cache_key', `${word}|ja-en%`);
    await admin.from('global_word_cache').delete().like('cache_key', `${word}|ja-ko%`);
    deleted += count || 0;
  }
  console.log(`Deleted ${deleted} curated_words rows + cleared their cache.`);
  console.log('\nNow run:');
  console.log('  node scripts/curation/curate-wordlist.js scripts/curation/data/jlpt-n5-part-1.json --concurrency=4');
  console.log('  node scripts/curation/curate-wordlist.js scripts/curation/data/jlpt-n5-part-2.json --concurrency=4');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
