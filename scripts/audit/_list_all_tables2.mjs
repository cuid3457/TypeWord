// Use COUNT(*) via head not id-specific
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TABLES = [
  'profiles', 'books', 'user_words', 'study_dates',
  'word_entries', 'word_translations', 'reverse_lookups',
  'curated_wordlists', 'curated_words',
  'dynamic_lexicon',
  'friend_requests', 'friendships', 'friend_blocks', 'friend_reports', 'pokes',
  'community_wordlists', 'community_wordlist_reports',
  'content_reports', 'report_fixes',
  'points_ledger', 'inventory',
  'api_calls', 'pending_deletes', 'inquiries', 'app_config',
];

// Use POSTGREST count via header pattern
for (const t of TABLES) {
  const { count, error } = await c.from(t).select('*', { count: 'exact', head: true });
  console.log(`${t.padEnd(28)} ${error ? `ERROR: ${error.message?.slice(0, 50)}` : `${count ?? 0} rows`}`);
}
