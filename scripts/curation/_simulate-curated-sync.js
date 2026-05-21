// Simulates the client-side curatedSyncService logic against the server.
// Reads "what would happen" if a client had local content_version=0 and
// last_synced_at=0 (i.e., legacy state pre-fix). Outputs counts of words
// the client would patch.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  // Simulate: a "book" for each active curated wordlist with local content_version=0.
  const { data: lists } = await admin
    .from('curated_wordlists')
    .select('id, slug, content_version')
    .eq('is_active', true)
    .gt('word_count', 0)
    .order('display_order');

  let totalWouldPatch = 0;
  console.log('Slug                          | server_ver | rows to pull (since 1970)');
  console.log('-'.repeat(80));
  for (const list of (lists ?? [])) {
    const { count } = await admin
      .from('curated_words')
      .select('*', { count: 'exact', head: true })
      .eq('curated_wordlist_id', list.id)
      .gt('updated_at', new Date(0).toISOString());
    console.log(
      `${list.slug.padEnd(30)} | ${String(list.content_version).padStart(10)} | ${String(count).padStart(5)}`
    );
    totalWouldPatch += (count ?? 0);
  }
  console.log(`\nTotal rows that legacy client would pull on first sync: ${totalWouldPatch}`);

  // Now simulate: a client that synced 2026-05-15 already.
  const since = '2026-05-15T00:00:00Z';
  let totalSinceMidweek = 0;
  console.log(`\n\nSimulating client synced at ${since}: incremental diff size`);
  console.log('Slug                          | rows to pull');
  console.log('-'.repeat(60));
  for (const list of (lists ?? [])) {
    const { count } = await admin
      .from('curated_words')
      .select('*', { count: 'exact', head: true })
      .eq('curated_wordlist_id', list.id)
      .gt('updated_at', since);
    if ((count ?? 0) > 0) {
      console.log(`${list.slug.padEnd(30)} | ${String(count).padStart(5)}`);
      totalSinceMidweek += count;
    }
  }
  console.log(`\nTotal incremental rows since ${since}: ${totalSinceMidweek}`);
})().catch(e => { console.error(e); process.exit(1); });
