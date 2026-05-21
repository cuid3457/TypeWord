/**
 * Security UAT — runs the attack scenarios that don't require a UI.
 *
 *   1. CRIT-1 — anon-authenticated client tries to PATCH profiles.plan='pro'
 *      against their own row. Expected: 42501 raised by tg_profiles_protect_columns.
 *   2. CRIT-1.b — same client tries to zero image_extract_count. Expected: 42501.
 *   3. CRIT-1.c — same client tries to set bonus_premium_until far future.
 *      Expected: 42501.
 *   4. HIGH-1 — RC webhook with wrong bearer secret. Expected: 401.
 *   5. CRIT-3 — send-auth-email called with no signature. Expected: 401.
 *
 * Reads SUPABASE_URL + SUPABASE_ANON_KEY from .env.local.
 *
 * Run from project root: node scripts/security-uat.js
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function expect(label, predicate, info) {
  const ok = !!predicate;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok && info) console.log('   detail:', JSON.stringify(info, null, 2));
  return ok;
}

(async () => {
  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error('Missing SUPABASE_URL or ANON_KEY in .env.local');
    process.exit(1);
  }

  // 1-3: Mint an anonymous user via Supabase auth, then attempt PATCH.
  console.log('\n=== CRIT-1: profiles column lockdown ===');
  const signinResp = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const signinJson = await signinResp.json();
  const token = signinJson.access_token;
  const userId = signinJson.user?.id;
  if (!token || !userId) {
    console.error('Anonymous sign-in failed:', signinJson);
    process.exit(1);
  }
  console.log(`  test user: ${userId}`);

  async function patchProfile(payload) {
    const r = await fetch(`${url}/rest/v1/profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  }

  const planAttack = await patchProfile({ plan: 'pro' });
  await expect(
    'CRIT-1.a: PATCH plan=pro is blocked',
    planAttack.status >= 400 && /read-only|42501|permission/i.test(JSON.stringify(planAttack.body)),
    planAttack,
  );

  const quotaAttack = await patchProfile({ image_extract_count: 0, image_extract_bucket: '1999-01' });
  await expect(
    'CRIT-1.b: PATCH image_extract_count is blocked',
    quotaAttack.status >= 400 && /read-only|42501|permission/i.test(JSON.stringify(quotaAttack.body)),
    quotaAttack,
  );

  const bonusAttack = await patchProfile({ bonus_premium_until: '2099-01-01T00:00:00Z' });
  await expect(
    'CRIT-1.c: PATCH bonus_premium_until is blocked',
    bonusAttack.status >= 400 && /read-only|42501|permission/i.test(JSON.stringify(bonusAttack.body)),
    bonusAttack,
  );

  // Sanity: a legitimate update (e.g. timezone) should still succeed.
  const legit = await patchProfile({ timezone: 'Asia/Seoul' });
  await expect(
    'CRIT-1 sanity: legitimate timezone PATCH still works',
    legit.status >= 200 && legit.status < 300,
    legit,
  );

  // 4: RC webhook wrong secret
  console.log('\n=== HIGH-1: RC webhook auth ===');
  const rcResp = await fetch(`${url}/functions/v1/revenuecat-webhook`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer wrong-secret-12345',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE', app_user_id: userId, entitlement_ids: ['TypeWord pro'] } }),
  });
  await expect('HIGH-1: wrong RC bearer is rejected (401)', rcResp.status === 401, { status: rcResp.status });

  // 5: send-auth-email no signature
  console.log('\n=== CRIT-3: send-auth-email signature ===');
  const seResp = await fetch(`${url}/functions/v1/send-auth-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: { email: 'attacker@example.com' }, email_data: { token_hash: 'fake', email_action_type: 'recovery', redirect_to: 'https://evil.tld/' } }),
  });
  await expect(
    'CRIT-3: unsigned send-auth-email is rejected (401/403)',
    seResp.status === 401 || seResp.status === 403,
    { status: seResp.status, body: await seResp.text() },
  );

  // Cleanup: delete the test user via admin API would need service-role key
  // and isn't critical — the anonymous user has zero data.
  console.log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
