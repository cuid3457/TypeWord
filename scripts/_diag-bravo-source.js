const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const word = process.argv[2] ?? 'bravo';
  const src = process.argv[3] ?? 'en';
  const tgt = process.argv[4] ?? 'ko';
  const { data: e } = await admin.from('word_entries').select('id, source').eq('word', word).eq('word_lang', src).maybeSingle();
  if (!e) { console.log('no entry'); return; }
  const { data: t } = await admin.from('word_translations').select('examples_translated').eq('word_entry_id', e.id).eq('target_lang', tgt).maybeSingle();
  console.log('entry.source =', e.source);
  console.log('examples raw:');
  for (const ex of t?.examples_translated ?? []) {
    console.log('  source=', ex.source, ' translation_len=', (ex.translation ?? '').length);
  }
  const hasLlmExample = (t?.examples_translated ?? []).some(ex => ex.source === 'llm' && ex.translation);
  console.log('hasLlmExample =', hasLlmExample, '→', hasLlmExample ? 'enrich SHORT-CIRCUITS (fast)' : 'enrich REGENERATES (slow)');
})();
