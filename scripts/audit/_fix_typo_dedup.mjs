// Re-process typo entries sequentially (after their canonical forms) so the
// ENRICH-stage dedup can copy from the now-enriched canonical entry.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

// Typo entries across all 8 sample books (per _create_sample_books.mjs).
const TYPOS = [
  { src: 'ko', tgt: 'en', words: ['학굣', '친귀'] },
  { src: 'en', tgt: 'ko', words: ['recieve', 'definately'] },
  { src: 'ja', tgt: 'ko', words: ['こんにちわ', 'ありがとうごじゃいます'] },
  { src: 'zh-CN', tgt: 'ko', words: ['你号', '謝謝'] },
  { src: 'es', tgt: 'ko', words: ['porfavor', 'graciaa'] },
  { src: 'fr', tgt: 'ko', words: ['bojour', 'merci beacoup'] },
  { src: 'de', tgt: 'ko', words: ['danke schon', 'guten morgan'] },
  { src: 'it', tgt: 'ko', words: ['chiao', 'grazi'] },
];

let ok = 0, failed = 0;
for (const { src, tgt, words } of TYPOS) {
  const { data: book } = await c.from('books').select('id').eq('user_id', USER_ID).eq('source_lang', src).like('title', '샘플 검증%').single();
  if (!book) continue;
  for (const w of words) {
    process.stdout.write(`[${src}→${tgt}] ${w.padEnd(28)} ... `);
    const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: w, sourceLang: src, targetLang: tgt, mode: 'enrich', forceFresh: true }),
    });
    if (!r.ok) { console.log(`HTTP ${r.status}`); failed++; continue; }
    const j = await r.json();
    const result = j.result;
    if (!result) { console.log('no result'); failed++; continue; }
    const { data: uw } = await c.from('user_words').select('id').eq('book_id', book.id).eq('word', w).maybeSingle();
    if (!uw) { console.log('no user_word'); failed++; continue; }
    const now = new Date().toISOString();
    const { error } = await c.from('user_words').update({ result_json: result, updated_at: now }).eq('id', uw.id);
    if (error) { console.log(`update fail: ${error.message?.slice(0,40)}`); failed++; continue; }
    const headword = result.headword;
    const firstEx = result.examples?.[0]?.sentence?.slice(0, 40);
    console.log(`OK (→${headword}) ex="${firstEx}"`);
    ok++;
  }
}
console.log(`\nDone. OK=${ok}, failed=${failed}`);
