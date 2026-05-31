require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // 1. Check for any other lookup-related cache tables we might miss
  for (const t of ['word_entry_examples', 'sense_examples', 'example_cache', 'canonical_examples', 'judge_cache', 'judged_senses']) {
    const r = await admin.from(t).select('*', { count: 'exact', head: true });
    if (!r.error) console.log(`FOUND: ${t}: ${r.count} rows`);
  }

  // 2. FK from word_translations to word_entries?
  const wt = await admin.from('word_translations').select('*').limit(1);
  console.log('word_translations columns:', Object.keys(wt.data?.[0] || {}));

  // 3. Final cache counts pre-delete
  console.log('\n=== PRE-DELETE COUNTS ===');
  for (const t of ['word_entries', 'word_translations', 'reverse_lookups']) {
    const r = await admin.from(t).select('*', { count: 'exact', head: true });
    console.log(`${t}: ${r.count}`);
  }
})();
