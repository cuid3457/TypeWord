require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== CACHE TRUNCATE — destructive ===\n');

  // 1. word_translations (children of word_entries via FK)
  console.log('[1/3] DELETE word_translations…');
  const t1 = await admin.from('word_translations').delete().not('id', 'is', null);
  if (t1.error) { console.error('FAIL:', t1.error.message); process.exit(1); }
  console.log('     deleted');

  // 2. word_entries
  console.log('[2/3] DELETE word_entries…');
  const t2 = await admin.from('word_entries').delete().not('id', 'is', null);
  if (t2.error) { console.error('FAIL:', t2.error.message); process.exit(1); }
  console.log('     deleted');

  // 3. reverse_lookups (independent)
  console.log('[3/3] DELETE reverse_lookups…');
  const t3 = await admin.from('reverse_lookups').delete().not('id', 'is', null);
  if (t3.error) { console.error('FAIL:', t3.error.message); process.exit(1); }
  console.log('     deleted');

  // Verify
  console.log('\n=== POST-DELETE COUNTS ===');
  for (const t of ['word_entries', 'word_translations', 'reverse_lookups']) {
    const r = await admin.from(t).select('*', { count: 'exact', head: true });
    console.log(`${t}: ${r.count}`);
  }
})();
