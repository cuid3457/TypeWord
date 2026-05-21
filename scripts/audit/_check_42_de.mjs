import { createClient } from '@supabase/supabase-js';

const c = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// 1) See what's in word_entries for 42 de
const { data: e } = await c.from('word_entries').select('*').eq('word', '42').eq('word_lang', 'de').limit(1);
console.log('=== word_entries (canonical) ===');
console.log(JSON.stringify(e?.[0]?.meanings, null, 2));

// 2) See what's in word_translations for 42 de→ko
const entryId = e?.[0]?.id;
if (entryId) {
  const { data: t } = await c.from('word_translations').select('*').eq('word_entry_id', entryId).eq('target_lang', 'ko').limit(1);
  console.log('=== word_translations (translated to ko) ===');
  console.log(JSON.stringify(t?.[0]?.meanings_translated, null, 2));
}

// 3) Call the function fresh
const { data: r } = await c.functions.invoke('word-lookup-v2', {
  body: { word: '42', sourceLang: 'de', targetLang: 'ko', mode: 'enrich' },
});
console.log('=== stitched result ===');
console.log(JSON.stringify(r?.result?.meanings, null, 2));
