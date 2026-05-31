require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== USER DATA TRUNCATE — destructive ===\n');

  // Order: child → parent. user_words.book_id → books.id
  console.log('[1/3] DELETE user_words…');
  const t1 = await admin.from('user_words').delete().not('id', 'is', null);
  if (t1.error) { console.error('FAIL:', t1.error.message); process.exit(1); }
  console.log('     deleted');

  console.log('[2/3] DELETE community_wordlists…');
  const t2 = await admin.from('community_wordlists').delete().not('id', 'is', null);
  if (t2.error) { console.error('FAIL:', t2.error.message); process.exit(1); }
  console.log('     deleted');

  console.log('[3/3] DELETE books…');
  const t3 = await admin.from('books').delete().not('id', 'is', null);
  if (t3.error) { console.error('FAIL:', t3.error.message); process.exit(1); }
  console.log('     deleted');

  console.log('\n=== POST-DELETE COUNTS ===');
  for (const t of ['user_words', 'community_wordlists', 'books']) {
    const r = await admin.from(t).select('*', { count: 'exact', head: true });
    console.log(`${t}: ${r.count}`);
  }

  console.log('\n=== Preserved (sanity check) ===');
  for (const t of ['profiles', 'curated_wordlists', 'curated_words', 'tts_cache']) {
    const r = await admin.from(t).select('*', { count: 'exact', head: true });
    console.log(`${t}: ${r.count}`);
  }
})();
