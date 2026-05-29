const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function ping(label) {
  const t0 = Date.now();
  const res = await fetch(`${URL}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON}`,
      'apikey': ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ warm_only: true }),
  });
  const dt = Date.now() - t0;
  const body = await res.text();
  console.log(`${label}: ${res.status} ${dt}ms  ${body.slice(0, 150)}`);
}

(async () => {
  console.log('--- v4 warm ping (3 sequential) ---');
  await ping('ping 1 (likely cold)');
  await ping('ping 2 (warm)');
  await ping('ping 3 (warm)');
})();
