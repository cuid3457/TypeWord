// Full data inventory — wordlist + cache + user-added counts.
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function listTables() {
  const tables = [
    'word_entries', 'word_translations', 'reverse_lookups',
    'curated_words', 'books', 'curated_books',
    'community_books', 'community_words',
    'user_wordlist', 'user_word_progress',
    'wordlists', 'user_words',
  ];
  console.log('=== Table existence + counts ===\n');
  for (const t of tables) {
    try {
      const { count, error } = await c.from(t).select('*', { count: 'exact', head: true });
      if (error) console.log(`  ${t.padEnd(28)} N/A (${error.message.slice(0, 50)})`);
      else console.log(`  ${t.padEnd(28)} ${(count ?? 0).toLocaleString()}`);
    } catch (e) {
      console.log(`  ${t.padEnd(28)} ERR (${e.message?.slice(0, 50)})`);
    }
  }
}

async function curatedByLang() {
  console.log('\n=== curated_words by language ===\n');
  for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it']) {
    const { count } = await c.from('curated_words').select('id', { count: 'exact', head: true }).eq('word_lang', lang);
    console.log(`  ${lang.padEnd(8)} ${(count ?? 0).toLocaleString()}`);
  }
}

async function curatedByBook() {
  console.log('\n=== curated_words by book (top 30) ===\n');
  const { data, error } = await c.from('curated_words').select('book_id').limit(50000);
  if (error) { console.log('  ERR:', error.message); return; }
  const counts = {};
  for (const r of data ?? []) counts[r.book_id] = (counts[r.book_id] ?? 0) + 1;
  const sorted = Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 30);
  for (const [bid, n] of sorted) console.log(`  ${bid?.padEnd(20)} ${n.toLocaleString()}`);
  console.log(`  ... total unique books: ${Object.keys(counts).length}`);
}

async function bookList() {
  console.log('\n=== books (curated + community) ===\n');
  // Try several possible book table names
  for (const tbl of ['books', 'curated_books', 'community_books']) {
    const { data, error, count } = await c.from(tbl).select('id, title, word_lang', { count: 'exact' }).limit(50);
    if (error) { console.log(`  ${tbl}: ${error.message.slice(0, 60)}`); continue; }
    console.log(`  ${tbl}: ${count} entries`);
    for (const b of (data ?? []).slice(0, 30)) {
      console.log(`    - ${b.id?.padEnd?.(24) ?? b.id} ${b.title ?? ''} [${b.word_lang ?? '?'}]`);
    }
  }
}

async function userAdded() {
  console.log('\n=== User-added words (across all user wordlists) ===\n');
  // Try user-related tables
  for (const tbl of ['user_wordlist', 'user_words', 'user_word_progress', 'wordlists']) {
    const { count, error } = await c.from(tbl).select('*', { count: 'exact', head: true });
    if (!error) console.log(`  ${tbl.padEnd(28)} ${(count ?? 0).toLocaleString()}`);
  }
}

async function lookupCacheCoverage() {
  console.log('\n=== word_entries by word_lang ===\n');
  for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it']) {
    const { count } = await c.from('word_entries').select('id', { count: 'exact', head: true }).eq('word_lang', lang);
    console.log(`  ${lang.padEnd(8)} ${(count ?? 0).toLocaleString()}`);
  }
}

await listTables();
await curatedByLang();
await bookList();
await curatedByBook();
await userAdded();
await lookupCacheCoverage();
