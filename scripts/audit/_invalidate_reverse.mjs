import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NEW_TAG = 'v3-outdated-2026-05-19-reverse';
const { count } = await c.from('reverse_lookups').select('*', { count: 'exact', head: true }).neq('prompt_version', NEW_TAG);
console.log(`reverse_lookups to invalidate: ${count}`);
const { error } = await c.from('reverse_lookups').update({ prompt_version: NEW_TAG }).neq('prompt_version', NEW_TAG);
if (error) { console.error(error); process.exit(1); }
console.log('Done.');
