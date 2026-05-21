// Diagnose: Are the sample books reachable via the same query syncService uses?
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

// Use service role to see ground truth
const svc = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

// Get the latest 1 book to see all columns
const { data: one, error } = await svc.from('books').select('*').eq('user_id', USER_ID).order('created_at', { ascending: false }).limit(1);
if (error) { console.error(error); process.exit(1); }
console.log('Server books row (first):');
console.log(JSON.stringify(one[0], null, 2));

// Simulate pullBooks query (with since=epoch)
const since = new Date(0).toISOString();
const { data: pulled, error: pErr } = await svc.from('books').select('*').gt('updated_at', since).order('updated_at', { ascending: true }).range(0, 999);
console.log(`\n\nsyncService pullBooks query (admin) returns ${pulled?.length ?? 0} rows`);
if (pErr) console.error('PERR:', pErr);

// Simulate as the user (with RLS) — using anon + auth header may not work; just check user_id filter
const { data: userBooks, error: uErr } = await svc.from('books').select('id,title,updated_at,user_id').eq('user_id', USER_ID).gt('updated_at', since).order('updated_at', { ascending: true });
console.log(`\nUser-specific books (admin): ${userBooks?.length ?? 0} rows`);
if (uErr) console.error('UERR:', uErr);
for (const b of userBooks ?? []) console.log(`  ${b.updated_at} "${b.title}"`);
