// Invoke word-lookup-v4 to see what it returns for a given (word, sourceLang, targetLang).
// Uses service role so curation rate-limit bypass applies.
//
// Usage:  node scripts/_diag-v4-lookup.js "야속하다" ko en
//         node scripts/_diag-v4-lookup.js "야속하다" ko en --force-purge   (deletes cache first)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('env missing');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function purgeCache(word, sourceLang) {
  const { data: entry } = await admin
    .from('word_entries')
    .select('id')
    .eq('word', word)
    .eq('word_lang', sourceLang)
    .maybeSingle();
  if (!entry) {
    console.log('  (no cache to purge)');
    return;
  }
  await admin.from('word_translations').delete().eq('word_entry_id', entry.id);
  await admin.from('word_entries').delete().eq('id', entry.id);
  console.log(`  purged entry ${entry.id} and its translations`);
}

async function main() {
  const word = process.argv[2];
  const sourceLang = process.argv[3] || 'ko';
  const targetLang = process.argv[4] || 'en';
  const force = process.argv.includes('--force-purge');
  if (!word) { console.error('Usage: <word> <source> <target> [--force-purge]'); process.exit(1); }

  if (force) {
    console.log('=== PURGE CACHE ===');
    await purgeCache(word, sourceLang);
  }

  console.log(`\n=== invoke word-lookup-v4 (word="${word}", ${sourceLang}→${targetLang}, mode=enrich) ===`);
  const t0 = Date.now();
  const resp = await admin.functions.invoke('word-lookup-v4', {
    body: { word, sourceLang, targetLang, mode: 'enrich' },
  });
  const dt = Date.now() - t0;
  console.log(`elapsed: ${dt}ms`);
  if (resp.error) {
    console.error('ERROR:', resp.error.message);
    if (resp.error.context) console.error('context:', JSON.stringify(resp.error.context, null, 2));
    return;
  }
  const result = resp.data?.result;
  console.log(`cached=${resp.data?.cached}`);
  if (!result) { console.log('(no result)'); return; }
  console.log(`headword="${result.headword}"  note=${result.note ?? '-'}  confidence=${result.confidence}`);
  console.log(`meanings (${(result.meanings ?? []).length}):`);
  (result.meanings ?? []).forEach((m, i) => {
    console.log(`  [${i}] def="${m.definition}"  pos=${m.partOfSpeech}  score=${m.relevanceScore}  senseId=${m.senseId ?? '-'}`);
  });
  console.log(`examples (${(result.examples ?? []).length}):`);
  (result.examples ?? []).forEach((ex, i) => {
    const at = result.meanings?.[ex.meaningIndex]?.definition;
    console.log(`  [${i}] meaningIndex=${ex.meaningIndex}  -> "${at ?? 'OUT-OF-RANGE'}"  source=${ex.source}`);
    console.log(`       sentence="${ex.sentence}"`);
    console.log(`       translation="${ex.translation}"`);
  });

  // Re-read word_entries to see if the lookup wrote to dict source or llm source.
  const { data: entry } = await admin
    .from('word_entries')
    .select('source, meanings')
    .eq('word', word)
    .eq('word_lang', sourceLang)
    .maybeSingle();
  if (entry) {
    console.log(`\nword_entries.source = "${entry.source}"  (dict-first if "dictionary", LLM fallback if "llm")`);
    console.log(`canonical senses (${(entry.meanings ?? []).length}):`);
    (entry.meanings ?? []).forEach((m, i) => {
      console.log(`  [${i}] sense_id=${m.sense_id} pos=${m.pos} score=${m.frequency_score} en="${m.en_translation}"`);
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
