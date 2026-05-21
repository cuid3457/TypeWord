// Verify warm_check logic:
//   1. First call (no recent activity) → "warmed" (OpenAI fired)
//   2. Immediate second call → "warm" (within 5 min, no OpenAI)
//   3. Real lookup → also updates warm_state
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
console.log('ANON loaded:', !!ANON, ANON.slice(0, 30));
const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function pingWarm() {
  const t = Date.now();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ warm_only: true }),
  });
  const ms = Date.now() - t;
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j, durationMs: ms };
}

async function checkWarmState() {
  const { data } = await admin.from('warm_state').select('last_real_call_at').eq('id', 1).single();
  if (!data) return null;
  const age = Date.now() - new Date(data.last_real_call_at).getTime();
  return { last: data.last_real_call_at, ageMs: age };
}

(async () => {
  // Force warm_state to old (5+ min ago) by setting it directly.
  const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin.from('warm_state').upsert({ id: 1, last_real_call_at: oldTime }, { onConflict: 'id' });
  console.log('Forced warm_state to 10min old\n');

  console.log('-- Ping 1: should be "warmed" (cache stale) --');
  let r = await pingWarm();
  console.log('  status:', r.status, 'duration:', r.durationMs + 'ms');
  console.log('  body:', JSON.stringify(r.body).slice(0, 200));
  let state = await checkWarmState();
  console.log('  warm_state ageMs:', state?.ageMs);

  console.log('\n-- Ping 2 (immediately): should be "warm" (within 5 min) --');
  r = await pingWarm();
  console.log('  status:', r.status, 'duration:', r.durationMs + 'ms');
  console.log('  body:', JSON.stringify(r.body).slice(0, 200));

  console.log('\n-- Ping 3 (immediately again): should still be "warm" --');
  r = await pingWarm();
  console.log('  status:', r.status, 'duration:', r.durationMs + 'ms');
  console.log('  body:', JSON.stringify(r.body).slice(0, 200));
})().catch(e => { console.error(e); process.exit(1); });
