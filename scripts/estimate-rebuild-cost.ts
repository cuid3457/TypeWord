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

async function main() {
  // Total rows
  const { count: entriesAll } = await a.from('word_entries').select('id', { count: 'exact', head: true });
  const { count: transAll } = await a.from('word_translations').select('id', { count: 'exact', head: true });

  // By prompt_version (which lookup pipeline generated this entry)
  const versions = ['dict-first-v4', 'v7-2026-05-17', 'v6-fix-1', 'v6'];
  const byVersion: Record<string, number> = {};
  for (const v of versions) {
    const { count } = await a.from('word_entries').select('id', { count: 'exact', head: true }).eq('prompt_version', v);
    byVersion[v] = count ?? 0;
  }
  const { count: nullVer } = await a.from('word_entries').select('id', { count: 'exact', head: true }).is('prompt_version', null);
  byVersion['(null)'] = nullVer ?? 0;

  // By source
  const { count: dictCount } = await a.from('word_entries').select('id', { count: 'exact', head: true }).eq('source', 'dictionary');
  const { count: llmCount } = await a.from('word_entries').select('id', { count: 'exact', head: true }).eq('source', 'llm');

  // Translations with empty examples vs non-empty (sample-based — count via SQL filter)
  // jsonb_array_length(examples_translated) = 0
  const { data: emptyEx } = await a.rpc('count_empty_examples').then(
    (r: any) => ({ data: r.data }),
    () => ({ data: null }),
  );
  // Fallback: fetch first 5000 and count locally
  const { data: trSample } = await a.from('word_translations').select('examples_translated').limit(5000);
  let emptyCount = 0, fullCount = 0;
  for (const t of trSample ?? []) {
    const exs = Array.isArray(t.examples_translated) ? t.examples_translated : [];
    if (exs.length === 0) emptyCount++; else fullCount++;
  }

  console.log('=== Global cache ===');
  console.log(`word_entries total: ${entriesAll}`);
  console.log(`word_translations total: ${transAll}`);
  console.log('\n=== word_entries by prompt_version ===');
  for (const [v, c] of Object.entries(byVersion)) console.log(`  ${v}: ${c}`);
  console.log('\n=== word_entries by source ===');
  console.log(`  dictionary: ${dictCount}`);
  console.log(`  llm: ${llmCount}`);
  console.log('\n=== word_translations examples_translated state (sample of first ' + (trSample?.length ?? 0) + ') ===');
  console.log(`  empty examples: ${emptyCount}`);
  console.log(`  with examples: ${fullCount}`);
  console.log(`  ratio empty: ${((emptyCount / (emptyCount + fullCount)) * 100).toFixed(1)}%`);
}
main();
