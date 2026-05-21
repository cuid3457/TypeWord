import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ALL = [
  // Active in code:
  'profiles', 'books', 'user_words', 'study_dates',
  'word_entries', 'word_translations', 'reverse_lookups',
  'curated_wordlists', 'curated_words',
  'dynamic_lexicon', 'word_lexicon', 'phrase_lexicon', 'slang_lexicon',
  'friend_requests', 'friendships', 'friend_blocks', 'friend_reports', 'pokes',
  'community_wordlists', 'community_wordlist_reports',
  'community_wordlist_downloads', 'community_wordlist_likes',
  'content_reports', 'report_fixes',
  'user_inventory',
  'api_calls', 'inquiries',
  'tts_cache', 'warm_state',
  // Possibly legacy / unused:
  'global_word_cache', 'ipa_cache',
  'referrals', 'review_logs',
  // Local-only(?) / odd:
  'pending_deletes', 'points_ledger', 'inventory', 'app_config',
];

const results = [];
for (const t of ALL) {
  const { count, error } = await c.from(t).select('*', { count: 'exact', head: true });
  results.push({ t, count, error: error?.message?.slice(0, 50) });
}

console.log('=== Tables present on server ===');
for (const r of results.filter((r) => !r.error)) {
  console.log(`${r.t.padEnd(28)} ${String(r.count).padStart(8)} rows`);
}

console.log('\n=== Tables NOT on server (errors) ===');
for (const r of results.filter((r) => r.error)) {
  console.log(`${r.t.padEnd(28)} ${r.error}`);
}
