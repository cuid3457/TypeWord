// Verify the wipe + repopulate state matches the intent:
//   - word_entries / word_translations / reverse_lookups: only contains
//     entries derived from user_words (re-process repopulated them)
//   - curated_words.results_by_target_lang: all '{}'
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. word_entries count
const { count: weCount } = await c.from('word_entries').select('id', { count: 'exact', head: true });
console.log(`word_entries: ${weCount}`);

// 2. word_translations count
const { count: wtCount } = await c.from('word_translations').select('id', { count: 'exact', head: true });
console.log(`word_translations: ${wtCount}`);

// 3. reverse_lookups count
const { count: rvCount } = await c.from('reverse_lookups').select('id', { count: 'exact', head: true });
console.log(`reverse_lookups: ${rvCount}`);

// 4. curated_words — all rows + how many have non-empty results_by_target_lang
const { count: cwTotal } = await c.from('curated_words').select('id', { count: 'exact', head: true });
console.log(`curated_words rows total: ${cwTotal}`);

// Sample 5 rows to see if results_by_target_lang is empty
const { data: cwSample } = await c.from('curated_words').select('id, word, results_by_target_lang').limit(5);
console.log('\ncurated_words sample (results_by_target_lang):');
for (const r of cwSample ?? []) {
  const keys = Object.keys(r.results_by_target_lang ?? {});
  console.log(`  ${r.word}: keys=[${keys.join(',') || 'EMPTY'}]`);
}

// 5. Count curated_words with non-empty content (this should be 0 after wipe)
const { count: cwNonEmpty } = await c.from('curated_words')
  .select('id', { count: 'exact', head: true })
  .neq('results_by_target_lang', '{}');
console.log(`\ncurated_words with non-empty results_by_target_lang: ${cwNonEmpty}`);

// 6. Unique words in user_words (should roughly match word_entries count for sample + processed)
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';
let from = 0;
const allUw = [];
while (true) {
  const { data } = await c.from('user_words').select('word, books!inner(source_lang, target_lang)').range(from, from+999);
  if (!data || data.length === 0) break;
  allUw.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
const uniqueByWordLang = new Set();
for (const u of allUw) {
  if (u.books?.source_lang) uniqueByWordLang.add(`${u.word}|${u.books.source_lang}`);
}
console.log(`\nuser_words unique (word, source_lang) tuples: ${uniqueByWordLang.size}`);
console.log(`Total user_words rows: ${allUw.length}`);

console.log('\nExpected: word_entries ~= unique tuples in user_words');
