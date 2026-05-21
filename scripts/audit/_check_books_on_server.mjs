import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const { data: books, error } = await c
  .from('books')
  .select('id,title,source_lang,target_lang,study_lang,curated_wordlist_id,created_at,updated_at,user_id,sort_order,pinned')
  .eq('user_id', USER_ID)
  .order('created_at', { ascending: false })
  .limit(30);
if (error) { console.error(error); process.exit(1); }

console.log(`총 ${books.length}개 books:\n`);
for (const b of books) {
  const cnt = await c.from('user_words').select('id', { count: 'exact', head: true }).eq('book_id', b.id);
  console.log(`${b.created_at}  ${b.source_lang}→${b.target_lang}  study=${b.study_lang}  words=${cnt.count}  curated=${b.curated_wordlist_id ? 'Y' : 'N'}  "${b.title}"`);
  console.log(`  id=${b.id}`);
}
