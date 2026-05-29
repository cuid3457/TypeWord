// Direct fetch (no supabase-js wrapper) so we can see the raw error body.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  const word = process.argv[2] || '야속하다';
  const src = process.argv[3] || 'ko';
  const tgt = process.argv[4] || 'en';
  const res = await fetch(`${URL}/functions/v1/word-lookup-v4`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
      'apikey': KEY,
    },
    body: JSON.stringify({ word, sourceLang: src, targetLang: tgt, mode: 'enrich' }),
  });
  console.log('status:', res.status);
  console.log('body:', await res.text());
})();
