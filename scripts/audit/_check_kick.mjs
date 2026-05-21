import { createClient } from '@supabase/supabase-js';

const c = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await c.functions.invoke('word-lookup-v2', {
  body: { word: 'kick the bucket', sourceLang: 'en', targetLang: 'ko', mode: 'enrich', forceFresh: true, forceFreshTranslation: true },
});
if (error) { console.error('ERR', error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
