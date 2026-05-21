// Generate Apple Client Secret JWT for Supabase Auth → Apple provider.
// Output the JWT string; paste it into Supabase's "Secret Key (for OAuth)".
// Apple requires regeneration every 6 months — schedule a calendar reminder.
//
// Usage:
//   1. Fill in TEAM_ID, KEY_ID, CLIENT_ID, P8_PATH below.
//   2. Save your .p8 file path (e.g. ~/Downloads/AuthKey_ABC123DEF4.p8).
//   3. node scripts/generate_apple_secret.js
//   4. Copy the printed JWT into Supabase.
//
// 'jose' is already in the project's deps via supabase-js. If not, run
// `npm i --no-save jose` first.

const fs = require('fs');
const path = require('path');

// ──────────── ENV VARS (do NOT hardcode for public repo) ────────────
// Required env vars:
//   APPLE_TEAM_ID   — your Apple Developer Team ID (10-char alphanumeric)
//   APPLE_KEY_ID    — the AuthKey .p8 file's Key ID (10-char alphanumeric)
//   APPLE_CLIENT_ID — bundle ID registered for Sign in with Apple (e.g. app.typeword.app)
//   APPLE_P8_PATH   — absolute path to your AuthKey_*.p8 file (the .p8 itself must NEVER be committed)
const TEAM_ID = process.env.APPLE_TEAM_ID;
const KEY_ID = process.env.APPLE_KEY_ID;
const CLIENT_ID = process.env.APPLE_CLIENT_ID;
const P8_PATH = process.env.APPLE_P8_PATH
  ? path.resolve(process.env.APPLE_P8_PATH)
  : null;
if (!TEAM_ID || !KEY_ID || !CLIENT_ID || !P8_PATH) {
  console.error('Missing env vars: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_P8_PATH all required');
  process.exit(1);
}
// ────────────────────────────────────────────────────────────────────

(async () => {
  const { SignJWT, importPKCS8 } = await import('jose');

  if (!fs.existsSync(P8_PATH)) {
    console.error(`✗ .p8 file not found at: ${P8_PATH}`);
    console.error('  Edit P8_PATH at the top of this script to point at your downloaded .p8 file.');
    process.exit(1);
  }

  const privateKeyPem = fs.readFileSync(P8_PATH, 'utf8');
  const key = await importPKCS8(privateKeyPem, 'ES256');

  const now = Math.floor(Date.now() / 1000);
  const sixMonths = 60 * 60 * 24 * 180;

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuer(TEAM_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + sixMonths)
    .setAudience('https://appleid.apple.com')
    .setSubject(CLIENT_ID)
    .sign(key);

  const expDate = new Date((now + sixMonths) * 1000).toISOString().slice(0, 10);
  console.log('\n──────── Apple Client Secret JWT ────────');
  console.log(jwt);
  console.log('──────────────────────────────────────────');
  console.log(`✓ Generated. Expires on ${expDate} (regenerate before then).`);
  console.log(`  Paste the JWT (above between the lines) into Supabase → Auth → Apple → "Secret Key (for OAuth)".\n`);
})();
