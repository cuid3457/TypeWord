// Show 1 concrete cached example end-to-end (word_entries + word_translations).
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Pick a word likely re-processed
const { data: e } = await c.from('word_entries').select('*').eq('word','학교').eq('word_lang','ko').single();
if (e) {
  console.log('=== word_entries (canonical, source-lang) ===');
  console.log(JSON.stringify(e, null, 2).slice(0, 1500));

  const { data: trans } = await c.from('word_translations').select('*').eq('word_entry_id', e.id);
  console.log(`\n=== word_translations (${trans?.length ?? 0} target_lang variants) ===`);
  for (const t of trans ?? []) {
    console.log(`--- target=${t.target_lang} ---`);
    console.log(JSON.stringify({
      target_lang: t.target_lang,
      meanings_translated: t.meanings_translated,
      examples_translated: t.examples_translated,
      model: t.model,
      prompt_version: t.prompt_version,
    }, null, 2));
  }
}
