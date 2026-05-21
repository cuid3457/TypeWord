// Re-process all words in "EN 케이스 분기 테스트 2026-05-19" book.
// For each word: call word-lookup-v2 (forceFresh) → update
// user_words.result_json with the fresh response. Client will pull via
// pullWords on next AppState active.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOOK_ID = '8ccfae26-2423-45f9-8922-ddb6261cd0b2';

const c = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function lookup(word, sourceLang, targetLang) {
  // mode='enrich' triggers examples + syn/ant in addition to QUICK
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ word, sourceLang, targetLang, mode: 'enrich', forceFresh: true }),
  });
  if (!resp.ok) {
    return { error: `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  }
  return await resp.json();
}

// 1. Fetch book + words
const { data: book } = await c.from('books').select('*').eq('id', BOOK_ID).single();
console.log(`Book: "${book.title}" | source=${book.source_lang} target=${book.target_lang}`);

const { data: words, error } = await c.from('user_words')
  .select('id, word, reading_key, result_json')
  .eq('book_id', BOOK_ID);
if (error) { console.error(error); process.exit(1); }

console.log(`Words: ${words.length}\n`);

// 2. Process each (sequential to avoid rate limit; tiny set anyway)
const nowIso = new Date().toISOString();
let success = 0, failed = 0;
for (const w of words) {
  process.stdout.write(`  ${w.word.padEnd(22)} ... `);
  const r = await lookup(w.word, book.source_lang, book.target_lang);
  if (r.error) {
    console.log(`ERR: ${r.error.slice(0, 80)}`);
    failed++;
    continue;
  }
  const result = r.result;
  if (!result) {
    console.log(`(no result)`);
    failed++;
    continue;
  }

  // Update user_words.result_json + updated_at so client picks up via sync
  const { error: upErr } = await c.from('user_words').update({
    result_json: result,
    updated_at: nowIso,
  }).eq('id', w.id);
  if (upErr) {
    console.log(`UPDATE ERR: ${upErr.message.slice(0, 80)}`);
    failed++;
    continue;
  }
  const note = result.note ? `(note=${result.note})` : `m${(result.meanings ?? []).length} ex${(result.examples ?? []).length}`;
  console.log(`OK ${note}`);
  success++;
}

console.log(`\nDone. success=${success}, failed=${failed}`);
console.log(`Client will sync via AppState 'active' (60s throttle) — open the app or background→foreground.`);
