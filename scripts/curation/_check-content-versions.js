// Sanity check: are content_version values being bumped correctly?
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  const { data: lists } = await admin
    .from('curated_wordlists')
    .select('slug, content_version, word_count, updated_at')
    .eq('is_active', true)
    .order('display_order');

  console.log('Slug                          | wc   | content_version | wordlist updated_at');
  console.log('-'.repeat(95));
  for (const r of (lists ?? [])) {
    console.log(
      `${r.slug.padEnd(30)} | ${String(r.word_count).padStart(4)} | ${String(r.content_version).padStart(15)} | ${r.updated_at}`,
    );
  }
})().catch(e => { console.error(e); process.exit(1); });
