// Add 'pièce' (room/coin/play) to fr→ko sample book to reach 20 words.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';
const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

const { data: book } = await c
  .from('books')
  .select('id')
  .eq('user_id', USER_ID)
  .eq('source_lang', 'fr')
  .like('title', '샘플 검증%')
  .single();
if (!book) { console.error('fr sample book not found'); process.exit(1); }

const word = 'pièce';
const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ word, sourceLang: 'fr', targetLang: 'ko', mode: 'enrich', forceFresh: true }),
});
if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(1); }
const j = await r.json();
const result = j.result;
console.log(`Lookup OK: m${(result.meanings ?? []).length} ex${(result.examples ?? []).length}`);

const now = new Date().toISOString();
const { error } = await c.from('user_words').insert({
  id: randomUUID(),
  user_id: USER_ID,
  book_id: book.id,
  word,
  reading_key: '',
  result_json: result,
  source_sentence: null,
  ease_factor: 2.5,
  interval_days: 0,
  next_review: now,
  review_count: 0,
  created_at: now,
  updated_at: now,
});
if (error) { console.error('insert error:', error); process.exit(1); }
console.log(`Inserted '${word}' into fr→ko sample book`);

// Show result
console.log('\n--- result ---');
(result.meanings ?? []).forEach((m, i) => console.log(`  m[${i}]: (${m.partOfSpeech}) ${m.definition}`));
(result.examples ?? []).forEach((e) => console.log(`  ex(mi=${e.meaningIndex}): ${e.sentence}  →  ${e.translation ?? ''}`));
