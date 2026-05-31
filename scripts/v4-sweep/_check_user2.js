require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Find more user tables and structure
  const tables = ['books', 'user_books', 'wordbooks', 'wordlists', 'community_wordlist_words', 'community_words', 'community_wordlist_items'];
  for (const t of tables) {
    const r = await admin.from(t).select('*', { count: 'exact', head: true });
    if (r.count !== null) console.log(`${t}: ${r.count} rows`);
  }

  // community_wordlists structure
  console.log('\n--- community_wordlists ---');
  const cw = await admin.from('community_wordlists').select('*').limit(2);
  console.log('cols:', Object.keys(cw.data?.[0] || {}));
  cw.data?.forEach(r => console.log(`  ${r.id}: ${r.name || r.slug} (${r.source_lang||'?'} word_count=${r.word_count})`));

  // user_words by book_id distribution
  console.log('\n--- user_words by book_id ---');
  const uw = await admin.from('user_words').select('book_id').limit(5000);
  const byBook = {};
  uw.data?.forEach(r => byBook[r.book_id] = (byBook[r.book_id]||0) + 1);
  Object.entries(byBook).slice(0,10).forEach(([b,c]) => console.log(`  ${b}: ${c}`));

  // profiles sample
  console.log('\n--- profiles ---');
  const p = await admin.from('profiles').select('id, display_name, created_at').limit(10);
  p.data?.forEach(r => console.log(`  ${r.display_name || '(anon)'} created=${r.created_at?.slice(0,10)}`));
})();
