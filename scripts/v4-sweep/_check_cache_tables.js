require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Count rows in each cache table
  const tables = ['word_entries', 'word_translations', 'reverse_lookups', 'user_words', 'wordlist_words', 'wordlists', 'curated_wordlists', 'curated_wordlist_words', 'words'];
  for (const t of tables) {
    try {
      const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`${t}: ERROR ${error.message}`);
      } else {
        console.log(`${t}: ${count} rows`);
      }
    } catch (e) {
      console.log(`${t}: EXCEPTION ${e.message}`);
    }
  }
})();
