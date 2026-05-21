// Audit synonym/antonym coverage for ko→en sample book.
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const { data: book } = await c.from('books').select('id').eq('user_id', USER_ID).eq('source_lang', 'ko').like('title', '샘플 검증%').single();
const { data: words } = await c.from('user_words').select('word,result_json').eq('book_id', book.id).order('created_at', { ascending: true });

console.log(`ko→en 단어장: ${words.length}개 단어\n`);
let hasSyn = 0, hasAnt = 0;
for (const w of words) {
  const r = w.result_json;
  const syn = r?.synonyms ?? [];
  const ant = r?.antonyms ?? [];
  const meanings = (r?.meanings ?? []).map((m) => m.definition).join(' / ');
  if (syn.length) hasSyn++;
  if (ant.length) hasAnt++;
  console.log(`${w.word.padEnd(18)} ${meanings.slice(0, 40).padEnd(42)} syn=${JSON.stringify(syn).slice(0, 40).padEnd(40)} ant=${JSON.stringify(ant)}`);
}
console.log(`\n=== Coverage ===`);
console.log(`syn present: ${hasSyn}/${words.length}`);
console.log(`ant present: ${hasAnt}/${words.length}`);
