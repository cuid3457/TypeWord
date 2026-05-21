// Wipe AI lookup caches (safe — lazy regen on next user search).
// DOES NOT touch curated_words / user_words / books — those preserve
// user learning state.

import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function tableCount(t) {
  const { count } = await c.from(t).select('*', { count: 'exact', head: true });
  return count ?? 0;
}

console.log('Pre-wipe counts:');
console.log('  word_entries:', await tableCount('word_entries'));
console.log('  word_translations:', await tableCount('word_translations'));
console.log('  reverse_lookups:', await tableCount('reverse_lookups'));
console.log();

// Order matters: word_translations references word_entries via word_entry_id FK.
// Delete children first.

async function wipeTable(name) {
  let total = 0;
  while (true) {
    const { data: ids, error } = await c.from(name).select('id').limit(50);
    if (error) { console.error('SELECT err:', error); process.exit(1); }
    if (!ids || ids.length === 0) break;
    const { error: delErr } = await c.from(name).delete().in('id', ids.map(r => r.id));
    if (delErr) { console.error('DELETE err:', delErr); process.exit(1); }
    total += ids.length;
    if (total % 1000 === 0 || ids.length < 50) process.stdout.write(`  deleted ${total}\r`);
  }
  console.log(`\n  ✓ ${name}: ${total} deleted`);
}

console.log('Deleting word_translations...');
await wipeTable('word_translations');

console.log('Deleting word_entries...');
await wipeTable('word_entries');

console.log('Deleting reverse_lookups...');
await wipeTable('reverse_lookups');

console.log('\nPost-wipe counts:');
console.log('  word_entries:', await tableCount('word_entries'));
console.log('  word_translations:', await tableCount('word_translations'));
console.log('  reverse_lookups:', await tableCount('reverse_lookups'));
console.log('  (curated_words / user_words / books — untouched)');
console.log('  curated_words:', await tableCount('curated_words'));
console.log('  user_words:', await tableCount('user_words'));
console.log('  books:', await tableCount('books'));
