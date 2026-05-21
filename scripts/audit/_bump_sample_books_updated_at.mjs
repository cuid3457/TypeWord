// Bump 8 sample books' updated_at so the client's next pullBooks definitely
// catches them. Use case: previous sync may have set LAST_SYNC_KEY past
// these books' original timestamps, leaving them invisible to the wordlist tab
// even though they're on the server.
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const { data: books } = await c
  .from('books')
  .select('id,title,updated_at')
  .eq('user_id', USER_ID)
  .like('title', '샘플 검증%');

console.log(`Touching ${books.length} sample books to bump updated_at...`);
const now = new Date().toISOString();
for (const b of books) {
  const { error } = await c.from('books').update({ updated_at: now }).eq('id', b.id);
  if (error) { console.error(`${b.title}:`, error.message); continue; }
  console.log(`  bumped "${b.title}"`);
}

// Verify
const { data: after } = await c.from('books').select('updated_at').eq('user_id', USER_ID).like('title', '샘플 검증%').limit(1);
console.log(`\nServer updated_at now: ${after[0]?.updated_at}`);
