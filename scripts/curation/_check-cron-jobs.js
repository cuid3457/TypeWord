const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  // Use raw SQL via Supabase admin client. We need to call via the public API
  // since the JS client doesn't expose cron schema natively.
  const { data, error } = await admin.from('cron.job').select('jobname, schedule, active');
  if (error) {
    console.log('Error:', error.message);
    // Try alternate query
    const res = await fetch(process.env.EXPO_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/list_cron_jobs', {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    console.log('Fallback:', res.status, await res.text().catch(() => ''));
    return;
  }
  console.log(data);
})();
