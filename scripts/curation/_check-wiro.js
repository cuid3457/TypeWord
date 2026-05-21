const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  for (const slug of ['topik-2-part-1', 'topik-2-part-2', 'topik-2-part-3', 'topik-1-part-2']) {
    const { data: list } = await admin.from('curated_wordlists').select('id').eq('slug', slug).single();
    if (!list) continue;
    const { data } = await admin.from('curated_words').select('word, results_by_target_lang').eq('curated_wordlist_id', list.id).eq('word', '위로').maybeSingle();
    if (!data) continue;
    console.log(`\n위로 found in ${slug}`);
    const r = data.results_by_target_lang?.en || Object.values(data.results_by_target_lang || {})[0];
    console.log('  reading:', JSON.stringify(r.reading));
    console.log('  ipa:', r.ipa);
    for (const m of (r.meanings || [])) console.log(`    [${m.partOfSpeech}] ${m.definition}`);
  }

  // tts_cache lookup
  const { data: cache } = await admin.from('tts_cache').select('text, lang, voice_id, phoneme').like('text', '%위로%').limit(20);
  console.log('\nTTS cache rows where text contains 위로:');
  for (const c of (cache || [])) console.log('  ', JSON.stringify(c));
})().catch(e => { console.error(e); process.exit(1); });
