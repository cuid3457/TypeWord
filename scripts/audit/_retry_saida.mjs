import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ word: '사이다', sourceLang: 'ko', targetLang: 'en', mode: 'enrich', forceFresh: true }),
});
console.log('HTTP', r.status);
const j = await r.json();
console.log('result:', JSON.stringify(j.result, null, 2));

// Try update
const { data: w } = await c.from('user_words').select('id').eq('word', '사이다').eq('user_id', '44e40709-8ea9-4d33-98e7-c839ae098dc0').single();
console.log('user_word id:', w?.id);
const { error: uErr } = await c.from('user_words').update({ result_json: j.result, updated_at: new Date().toISOString() }).eq('id', w.id);
console.log('update error:', uErr);
