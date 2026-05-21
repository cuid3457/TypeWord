// Invalidate word_entries + word_translations cache for en/es/fr/de/it
// so the deployed v2 function regenerates with new case-routed prompts.
// KO/JA/ZH untouched (those languages didn't change).
//
// Strategy: set prompt_version='outdated-2026-05-19'. Lookup filters by
// current PROMPT_VERSION_V2 — outdated rows invisible → regenerated.

import { createClient } from '@supabase/supabase-js';

const c = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const LANGS = ['en', 'es', 'fr', 'de', 'it'];
const NEW_TAG = 'outdated-2026-05-19';
const PAGE = 1000;

console.log(`Step 1: invalidate word_entries (word_lang IN ${LANGS.join(',')}, neq prompt_version=${NEW_TAG})`);
const { count: entryCount, error: e0 } = await c
  .from('word_entries')
  .select('id', { count: 'exact', head: true })
  .in('word_lang', LANGS)
  .neq('prompt_version', NEW_TAG);
if (e0) { console.error(e0); process.exit(1); }
console.log(`  ${entryCount} rows to update`);

const { error: e1 } = await c
  .from('word_entries')
  .update({ prompt_version: NEW_TAG })
  .in('word_lang', LANGS)
  .neq('prompt_version', NEW_TAG);
if (e1) { console.error(e1); process.exit(1); }
console.log(`  ✓ word_entries updated`);

console.log(`\nStep 2: invalidate linked word_translations (paginate over entry ids)`);
let totalIds = 0;
let translationsUpdated = 0;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await c
    .from('word_entries')
    .select('id')
    .in('word_lang', LANGS)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) { console.error('SELECT error:', error); process.exit(1); }
  if (!data || data.length === 0) break;
  const ids = data.map((r) => r.id);
  totalIds += ids.length;

  // Sub-batch the IN clause to stay under the PostgREST URL length cap.
  const IN_BATCH = 100;
  let batchCnt = 0;
  for (let s = 0; s < ids.length; s += IN_BATCH) {
    const sub = ids.slice(s, s + IN_BATCH);
    const { count: cnt, error: eCount } = await c
      .from('word_translations')
      .select('id', { count: 'exact', head: true })
      .in('word_entry_id', sub)
      .neq('prompt_version', NEW_TAG);
    if (eCount) { console.error('COUNT error:', eCount); process.exit(1); }
    const { error: e2 } = await c
      .from('word_translations')
      .update({ prompt_version: NEW_TAG })
      .in('word_entry_id', sub)
      .neq('prompt_version', NEW_TAG);
    if (e2) { console.error('UPDATE error:', e2); process.exit(1); }
    batchCnt += cnt ?? 0;
  }
  translationsUpdated += batchCnt;
  process.stdout.write(`  batch ${(from/PAGE)+1}: ${ids.length} entries, +${batchCnt} translations\n`);
  if (data.length < PAGE) break;
}
console.log(`\n  ✓ scanned ${totalIds} entry ids, updated ${translationsUpdated} translation rows`);

console.log(`\nDone. Next lookups for ${LANGS.join('/')} regenerate with the new case-routed prompts.`);
