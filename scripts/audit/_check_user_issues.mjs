import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const { data: book } = await c.from('books').select('id').eq('user_id', USER_ID).eq('source_lang', 'ko').like('title', '샘플 검증%').single();

for (const target of ['42', '학교', '학굣', '배']) {
  const { data: w } = await c.from('user_words').select('result_json').eq('book_id', book.id).eq('word', target).maybeSingle();
  if (!w) { console.log(`\n=== ${target}: NOT FOUND`); continue; }
  const r = w.result_json;
  console.log(`\n=== ${target} ===`);
  console.log(`headword: ${r?.headword}, note: ${r?.note ?? 'none'}, originalInput: ${r?.originalInput}`);
  (r?.meanings ?? []).forEach((m, i) => console.log(`  m[${i}]: (${m.partOfSpeech}) ${m.definition} (rel=${m.relevanceScore})`));
  (r?.examples ?? []).forEach((e) => console.log(`  ex(mi=${e.meaningIndex}): ${e.sentence}`));
}
