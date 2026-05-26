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
  // Past 48h: count word_entries by source + check translations examples emptiness
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: recent } = await a
    .from('word_entries')
    .select('id, word, word_lang, source, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  console.log(`Total word_entries created in past 48h: ${recent?.length ?? 0}`);
  const bySource: Record<string, number> = {};
  const byLang: Record<string, number> = {};
  for (const e of recent ?? []) {
    bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    byLang[e.word_lang] = (byLang[e.word_lang] ?? 0) + 1;
  }
  console.log('By source:', bySource);
  console.log('By word_lang:', byLang);

  // Check examples emptiness for the new entries' translations
  if (recent && recent.length > 0) {
    const ids = recent.map((e) => e.id);
    const { data: trans } = await a
      .from('word_translations')
      .select('word_entry_id, target_lang, examples_translated, created_at')
      .in('word_entry_id', ids)
      .limit(1000);
    let emptyEx = 0, nonemptyEx = 0;
    for (const t of trans ?? []) {
      const exs = Array.isArray(t.examples_translated) ? t.examples_translated : [];
      if (exs.length === 0) emptyEx++; else nonemptyEx++;
    }
    console.log(`Translations for those entries — empty examples: ${emptyEx}, non-empty: ${nonemptyEx}`);
  }

  // Also: total cache state across all word_entries
  const { count: totalEntries } = await a.from('word_entries').select('id', { count: 'exact', head: true });
  const { count: totalTrans } = await a.from('word_translations').select('id', { count: 'exact', head: true });
  console.log(`\nGlobal cache state:`);
  console.log(`  word_entries total: ${totalEntries}`);
  console.log(`  word_translations total: ${totalTrans}`);

  // Sample 3 recent entries — show what their translation actually looks like
  console.log('\n--- 3 most recent entries (full data) ---');
  for (const e of (recent ?? []).slice(0, 3)) {
    console.log(`\n${e.word_lang} "${e.word}" (src=${e.source}, ${e.created_at})`);
    const { data: tr } = await a
      .from('word_translations')
      .select('target_lang, meanings_translated, examples_translated')
      .eq('word_entry_id', e.id)
      .limit(3);
    for (const t of tr ?? []) {
      const meanings = Array.isArray(t.meanings_translated) ? t.meanings_translated : [];
      const exs = Array.isArray(t.examples_translated) ? t.examples_translated : [];
      console.log(`  → ${t.target_lang}: ${meanings.length} meanings, ${exs.length} examples`);
      for (const ex of exs.slice(0, 1)) {
        console.log(`     ex: ${JSON.stringify(ex).slice(0, 150)}`);
      }
    }
  }
}
main();
