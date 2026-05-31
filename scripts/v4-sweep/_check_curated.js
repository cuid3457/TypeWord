require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Find all tables in the DB
  const tables = [
    'curated_wordlist_words', 'curated_words', 'wordlist_items',
    'word_meanings', 'cached_lookups', 'lookup_cache',
    'wiktionary_entries', 'jmdict_entries', 'cedict_entries', 'krdict_entries',
    'reading_cache', 'ipa_cache', 'tts_audio_cache',
  ];
  for (const t of tables) {
    try {
      const r = await admin.from(t).select('*', { count: 'exact', head: true });
      if (r.error) console.log(`${t}: ERROR ${r.error.message}`);
      else console.log(`${t}: ${r.count} rows`);
    } catch (e) {
      console.log(`${t}: EXCEPTION`);
    }
  }
})();
