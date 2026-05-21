// List all public-schema tables + row count + whether referenced in code
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Known tables (from migrations history). Group by purpose.
const TABLES = [
  // Auth / user
  { name: 'profiles', purpose: 'User profile (display_name, plan, points, streak, friend_code, etc.)' },
  // Wordlists / books
  { name: 'books', purpose: 'User wordlists (each user has N books)' },
  { name: 'user_words', purpose: 'Words within a book (with result_json snapshot)' },
  { name: 'study_dates', purpose: 'Streak qualifying study dates per user' },
  // AI cache
  { name: 'word_entries', purpose: 'Canonical word lookup cache (source-lang)' },
  { name: 'word_translations', purpose: 'Per-target-lang translation cache' },
  { name: 'reverse_lookups', purpose: 'Reverse direction (target→source) cache' },
  // Curated wordlists
  { name: 'curated_wordlists', purpose: 'Curated list metadata (HSK 1, TOPIK 1, etc.)' },
  { name: 'curated_words', purpose: 'Word membership + AI response per curated wordlist' },
  // Lexicon / dynamic
  { name: 'dynamic_lexicon', purpose: 'Aggregated lookup popularity (lexicon weight signals)' },
  // Friends / social
  { name: 'friend_requests', purpose: 'Pending friend requests' },
  { name: 'friendships', purpose: 'Established friendships (bidirectional rows)' },
  { name: 'friend_blocks', purpose: 'User blocks' },
  { name: 'friend_reports', purpose: 'User-on-user reports' },
  { name: 'pokes', purpose: 'Friend poke notifications' },
  // Community
  { name: 'community_wordlists', purpose: 'Public-shared user wordlists' },
  { name: 'community_wordlist_reports', purpose: 'Reports on community wordlists' },
  // Reports / moderation
  { name: 'content_reports', purpose: 'User reports on AI word entries' },
  { name: 'report_fixes', purpose: 'Phase 8 AI-judge fix queue' },
  // Points / inventory
  { name: 'points_ledger', purpose: 'Points transaction log' },
  { name: 'inventory', purpose: 'User inventory of consumable items' },
  // Operational
  { name: 'api_calls', purpose: 'Edge function call log (cost / usage / latency)' },
  { name: 'pending_deletes', purpose: 'Soft-delete queue (local SQLite mirror only?)' },
  { name: 'inquiries', purpose: 'User inquiry submissions (support contact)' },
  { name: 'app_config', purpose: '?' },
];

for (const t of TABLES) {
  const { count, error } = await c.from(t.name).select('id', { count: 'exact', head: true });
  const status = error ? `ERROR: ${error.message?.slice(0, 40)}` : `${count ?? 0} rows`;
  console.log(`${t.name.padEnd(28)} ${status.padEnd(20)} ${t.purpose}`);
}

// Find any tables we missed
console.log('\n=== Listing ALL public tables for completeness ===');
const { data: allTables, error: tErr } = await c.rpc('pg_table_list').catch(() => ({ data: null, error: null }));
if (!allTables) {
  console.log('(no pg_table_list RPC — skipping reflection)');
}
