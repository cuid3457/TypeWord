import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

async function main() {
  const a = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const word = process.argv[2];
  const lang = process.argv[3];
  if (!word || !lang) {
    console.error('usage: tsx inv-single.ts <word> <lang>');
    process.exit(1);
  }
  const { data: ents } = await a
    .from('word_entries')
    .select('id, source')
    .eq('word', word)
    .eq('word_lang', lang);
  console.log(`found ${ents?.length ?? 0} entry rows for ${lang} ${word}`);
  for (const e of ents ?? []) {
    const t1 = await a.from('word_translations').delete().eq('word_entry_id', e.id);
    const t2 = await a.from('word_entries').delete().eq('id', e.id);
    console.log(`  deleted entry ${e.id} (src=${e.source}) tr_err=${t1.error?.message ?? 'ok'} en_err=${t2.error?.message ?? 'ok'}`);
  }
  const { data: post } = await a
    .from('word_entries')
    .select('id')
    .eq('word', word)
    .eq('word_lang', lang);
  console.log(`remaining: ${post?.length ?? 0}`);
}
main();
