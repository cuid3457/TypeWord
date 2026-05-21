// Invalidate KO + JA cache after late-evening fixes:
// - KO_NUMBER_SYMBOL surface invariant + 수사 POS
// - JA register tag native to target

import { createClient } from '@supabase/supabase-js';

const c = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const LANGS = ['ko', 'ja'];
const NEW_TAG = 'outdated-2026-05-19-late';
const PAGE = 1000;

const { count: entryCount } = await c
  .from('word_entries')
  .select('id', { count: 'exact', head: true })
  .in('word_lang', LANGS)
  .neq('prompt_version', NEW_TAG);
console.log(`word_entries to invalidate: ${entryCount}`);

await c.from('word_entries')
  .update({ prompt_version: NEW_TAG })
  .in('word_lang', LANGS)
  .neq('prompt_version', NEW_TAG);

let totalIds = 0, translations = 0;
for (let from = 0; ; from += PAGE) {
  const { data } = await c.from('word_entries')
    .select('id').in('word_lang', LANGS)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1);
  if (!data || data.length === 0) break;
  const ids = data.map((r) => r.id);
  totalIds += ids.length;
  for (let s = 0; s < ids.length; s += 100) {
    const sub = ids.slice(s, s + 100);
    const { count: cnt } = await c.from('word_translations')
      .select('id', { count: 'exact', head: true })
      .in('word_entry_id', sub)
      .neq('prompt_version', NEW_TAG);
    await c.from('word_translations')
      .update({ prompt_version: NEW_TAG })
      .in('word_entry_id', sub)
      .neq('prompt_version', NEW_TAG);
    translations += cnt ?? 0;
  }
  if (data.length < PAGE) break;
}
console.log(`Done. ${totalIds} entries, ${translations} translations.`);
