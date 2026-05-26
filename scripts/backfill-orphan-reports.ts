import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const a = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  // Find content_reports with null lang — they came from the ReviewActiveCard bug.
  const { data: orphans } = await a
    .from('content_reports')
    .select('id, user_id, word, processed_at')
    .is('source_lang', null)
    .is('processed_at', null);
  console.log(`Orphan reports (null lang, unprocessed): ${orphans?.length ?? 0}`);
  if (!orphans || orphans.length === 0) return;

  // For each orphan, find the user's user_words to discover (book_id → source_lang/target_lang).
  // user_id + word → user_words → book_id → books.source_lang/target_lang
  let fixed = 0;
  for (const r of orphans) {
    if (!r.user_id) {
      console.log(`  skip (no user_id): "${r.word}"`);
      continue;
    }
    const { data: uw } = await a
      .from('user_words')
      .select('book_id')
      .eq('user_id', r.user_id)
      .eq('word', r.word)
      .limit(1)
      .maybeSingle();
    if (!uw?.book_id) {
      console.log(`  skip (no user_word for "${r.word}" / user ${r.user_id.slice(0, 8)})`);
      continue;
    }
    const { data: book } = await a
      .from('books')
      .select('source_lang, target_lang')
      .eq('id', uw.book_id)
      .maybeSingle();
    if (!book?.source_lang || !book?.target_lang) {
      console.log(`  skip (book missing lang) "${r.word}"`);
      continue;
    }
    const { error } = await a
      .from('content_reports')
      .update({ source_lang: book.source_lang, target_lang: book.target_lang })
      .eq('id', r.id);
    if (error) {
      console.log(`  ✗ ${r.word}: ${error.message}`);
    } else {
      fixed++;
      console.log(`  ✓ ${r.word}: ${book.source_lang}→${book.target_lang}`);
    }
  }
  console.log(`\nFixed ${fixed} reports. They'll be picked up by the 10-min cron or any next INSERT trigger.`);
  console.log(`To trigger process-report manually now, insert any dummy report (would re-fire the queue).`);
}
main();
