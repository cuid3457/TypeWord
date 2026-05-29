// One-shot diagnostic: dump everything about a word to figure out why review
// shows mismatched example/meaning. Reads word_entries + all word_translations
// + every curated_words row containing the word.
//
// Usage:  node scripts/_diag-word.js "야속하네" ko
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const word = process.argv[2];
  const sourceLang = process.argv[3] || 'ko';
  if (!word) {
    console.error('Usage: node scripts/_diag-word.js <word> <sourceLang>');
    process.exit(1);
  }

  console.log(`\n=== word_entries (word="${word}", word_lang="${sourceLang}") ===`);
  const { data: entry, error: eErr } = await supabase
    .from('word_entries')
    .select('id, word, word_lang, headword, prompt_version, model, source, meanings, examples, updated_at')
    .eq('word', word)
    .eq('word_lang', sourceLang)
    .maybeSingle();
  if (eErr) console.error('entry error:', eErr.message);
  if (!entry) {
    console.log('(no word_entries row)');
  } else {
    console.log(`id=${entry.id}  prompt_version=${entry.prompt_version}  source=${entry.source}  updated=${entry.updated_at}`);
    console.log(`headword="${entry.headword}"`);
    console.log(`meanings (canonical, ${(entry.meanings ?? []).length}):`);
    for (const m of entry.meanings ?? []) {
      console.log(`  - sense_id=${m.sense_id}  pos=${m.pos}  score=${m.frequency_score}  en="${m.en_translation}"  source_def="${m.source_def}"`);
    }
    console.log(`canonical examples (${(entry.examples ?? []).length}):`);
    for (const ex of entry.examples ?? []) {
      console.log(`  - meaningIndex=${ex.meaningIndex}  senseId=${ex.senseId ?? '<MISSING>'}  sentence="${ex.sentence}"`);
    }

    console.log(`\n=== word_translations (entry=${entry.id}) ===`);
    const { data: trans } = await supabase
      .from('word_translations')
      .select('target_lang, prompt_version, model, updated_at, meanings_translated, examples_translated')
      .eq('word_entry_id', entry.id);
    for (const t of trans ?? []) {
      console.log(`\n--- target_lang=${t.target_lang} prompt_version=${t.prompt_version} updated=${t.updated_at} ---`);
      console.log(`meanings_translated (${(t.meanings_translated ?? []).length}):`);
      (t.meanings_translated ?? []).forEach((m, i) => {
        console.log(`  [${i}] def="${m.definition}"  pos=${m.partOfSpeech}  score=${m.relevanceScore}  senseId=${m.senseId ?? '<MISSING>'}`);
      });
      console.log(`examples_translated (${(t.examples_translated ?? []).length}):`);
      (t.examples_translated ?? []).forEach((ex, i) => {
        const definedMeaning = t.meanings_translated?.[ex.meaningIndex]?.definition;
        console.log(`  [${i}] meaningIndex=${ex.meaningIndex}  -> "${definedMeaning ?? 'OUT-OF-RANGE'}"`);
        console.log(`       sentence="${ex.sentence}"`);
        console.log(`       translation="${ex.translation}"`);
      });
    }
  }

  console.log(`\n=== curated_words containing "${word}" ===`);
  const { data: cur } = await supabase
    .from('curated_words')
    .select('curated_wordlist_id, word, reading_key, results_by_target_lang, updated_at')
    .eq('word', word);
  if (!cur || cur.length === 0) {
    console.log('(none)');
  } else {
    for (const c of cur) {
      const { data: meta } = await supabase
        .from('curated_wordlists')
        .select('slug')
        .eq('id', c.curated_wordlist_id)
        .maybeSingle();
      console.log(`\n--- wordlist=${meta?.slug ?? c.curated_wordlist_id}  reading_key="${c.reading_key}"  updated=${c.updated_at} ---`);
      const map = c.results_by_target_lang ?? {};
      for (const tgt of Object.keys(map)) {
        const r = map[tgt];
        console.log(`  target=${tgt}:`);
        console.log(`    meanings (${(r.meanings ?? []).length}):`);
        (r.meanings ?? []).forEach((m, i) => {
          console.log(`      [${i}] def="${m.definition}"  pos=${m.partOfSpeech}  score=${m.relevanceScore}`);
        });
        console.log(`    examples (${(r.examples ?? []).length}):`);
        (r.examples ?? []).forEach((ex, i) => {
          const defAt = r.meanings?.[ex.meaningIndex]?.definition;
          console.log(`      [${i}] meaningIndex=${ex.meaningIndex}  -> "${defAt ?? 'OUT-OF-RANGE'}"`);
          console.log(`           sentence="${ex.sentence}"`);
          console.log(`           translation="${ex.translation}"`);
        });
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
