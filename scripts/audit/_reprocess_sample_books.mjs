// Re-process all 8 sample books with the latest anchor-rule prompt.
// Calls word-lookup-v2 forceFresh + ENRICH, then patches user_words.result_json.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

// Find the 8 sample books.
const { data: books, error: bErr } = await c
  .from('books')
  .select('id,title,source_lang,target_lang')
  .eq('user_id', USER_ID)
  .like('title', '샘플 검증%')
  .order('created_at', { ascending: true });
if (bErr) { console.error(bErr); process.exit(1); }
console.log(`Re-processing ${books.length} books...\n`);

let total = 0, ok = 0, failed = 0;
const failures = [];

for (const b of books) {
  const { data: words } = await c
    .from('user_words')
    .select('id,word')
    .eq('book_id', b.id)
    .order('created_at', { ascending: true });
  console.log(`\nBook "${b.title}" (${b.source_lang}→${b.target_lang}): ${words.length} words`);

  for (const w of words) {
    total++;
    process.stdout.write(`  ${w.word.padEnd(28)} ... `);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: w.word,
          sourceLang: b.source_lang,
          targetLang: b.target_lang,
          mode: 'enrich',
          forceFresh: true,
        }),
      });
      if (!r.ok) { console.log(`HTTP ${r.status}`); failed++; failures.push(`${b.title} | ${w.word} | HTTP${r.status}`); continue; }
      const j = await r.json();
      const result = j.result;
      if (!result) { console.log('no result'); failed++; failures.push(`${b.title} | ${w.word} | no result`); continue; }

      const now = new Date().toISOString();
      const { error: uErr } = await c
        .from('user_words')
        .update({ result_json: result, updated_at: now })
        .eq('id', w.id);
      if (uErr) { console.log(`UPDATE ERR ${uErr.message?.slice(0, 60)}`); failed++; failures.push(`${b.title} | ${w.word} | update`); continue; }

      const note = result.note ? `(note=${result.note})` : `m${(result.meanings ?? []).length} ex${(result.examples ?? []).length}`;
      console.log(`OK ${note}`);
      ok++;
    } catch (e) {
      console.log(`ERR ${e.message?.slice(0, 50)}`);
      failed++;
      failures.push(`${b.title} | ${w.word} | ${e.message?.slice(0, 50)}`);
    }
  }
}

console.log(`\n\n=== SUMMARY ===`);
console.log(`Total: ${total}, OK: ${ok}, Failed: ${failed}`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f}`);
}
