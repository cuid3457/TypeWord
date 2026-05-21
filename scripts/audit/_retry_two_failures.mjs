// Retry the 2 failed entries from the wipe+reprocess run.
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const failures = [
  { word: 'de rien', src: 'fr', tgt: 'ko' },
  { word: '백화점', src: 'ko', tgt: 'en' },
];

for (const f of failures) {
  process.stdout.write(`[${f.src}→${f.tgt}] ${f.word.padEnd(20)} ... `);
  const r = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/word-lookup-v2`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: f.word, sourceLang: f.src, targetLang: f.tgt, mode: 'enrich', forceFresh: true }),
  });
  if (!r.ok) { console.log(`HTTP ${r.status}`); continue; }
  const j = await r.json();
  if (!j.result) { console.log('no result'); continue; }

  // Find matching user_words and patch
  const { data: books } = await c.from('books').select('id').eq('source_lang', f.src).eq('target_lang', f.tgt);
  const bookIds = (books ?? []).map((b) => b.id);
  const { data: uws } = await c.from('user_words').select('id').in('book_id', bookIds).eq('word', f.word);
  const ids = (uws ?? []).map((u) => u.id);
  if (ids.length === 0) { console.log('OK (no user_word to patch)'); continue; }
  const now = new Date().toISOString();
  const { error } = await c.from('user_words').update({ result_json: j.result, updated_at: now }).in('id', ids);
  if (error) { console.log(`update fail: ${error.message?.slice(0,40)}`); continue; }
  console.log(`OK (patched ${ids.length} user_words)`);
}
