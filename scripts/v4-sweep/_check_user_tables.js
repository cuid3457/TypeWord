require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // User content tables
  const tables = [
    'user_words',
    'user_wordlists', 'user_wordbooks', 'wordbooks',
    'community_wordlists', 'shared_wordlists', 'library_wordlists',
    'wordlist_uploads', 'community_uploads',
    'favorites', 'likes', 'downloads', 'wordlist_likes', 'wordlist_downloads',
    'reports', 'process_reports', 'word_reports',
    'tts_audio', 'tts_cache',
    'profiles',
  ];
  for (const t of tables) {
    const r = await admin.from(t).select('*', { count: 'exact', head: true });
    if (r.count !== null) console.log(`${t}: ${r.count} rows`);
  }
})();
