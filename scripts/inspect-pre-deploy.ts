import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const a = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Today's deploy: roughly 12:45 UTC (when first `supabase functions deploy` ran)
const DEPLOY_TIME = '2026-05-25T12:45:00.000Z';

async function summarize(label: string, since: string | null, until: string | null) {
  let q = a.from('word_entries').select('id, word, word_lang, source, created_at, prompt_version').limit(2000);
  if (since) q = q.gte('created_at', since);
  if (until) q = q.lt('created_at', until);
  const { data: entries } = await q;
  console.log(`\n=== ${label} ===`);
  console.log(`Entries: ${entries?.length ?? 0}`);
  if (!entries || entries.length === 0) return;

  const byLang: Record<string, number> = {};
  const promptVers: Record<string, number> = {};
  for (const e of entries) {
    byLang[e.word_lang] = (byLang[e.word_lang] ?? 0) + 1;
    promptVers[e.prompt_version ?? 'null'] = (promptVers[e.prompt_version ?? 'null'] ?? 0) + 1;
  }
  console.log('  by_lang:', byLang);
  console.log('  prompt_versions:', promptVers);

  // Sample a few — chunk IDs to avoid URL length issues
  let totalTr = 0, emptyEx = 0, nonemptyEx = 0;
  const ids = entries.map((e) => e.id);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data: trs } = await a
      .from('word_translations')
      .select('word_entry_id, examples_translated')
      .in('word_entry_id', chunk);
    for (const t of trs ?? []) {
      totalTr++;
      const exs = Array.isArray(t.examples_translated) ? t.examples_translated : [];
      if (exs.length === 0) emptyEx++; else nonemptyEx++;
    }
  }
  console.log(`  translations: total=${totalTr}  empty_examples=${emptyEx}  with_examples=${nonemptyEx}`);
}

async function main() {
  // Window 1: 48-24h ago (yesterday's user activity)
  const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await summarize('48h-24h ago (yesterday before our work)', since48, since24);
  await summarize('24h-deploy (today before deploy)', since24, DEPLOY_TIME);
  await summarize('Post-deploy (after today\'s deploy)', DEPLOY_TIME, null);
}
main();
