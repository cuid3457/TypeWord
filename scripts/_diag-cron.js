const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { data, error } = await admin.rpc('pg_cron_show').catch(() => ({ data: null, error: 'rpc not available' }));
  if (data) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  // Fallback: read cron.job via SQL exposed via rpc/edge fn
  const { data: rows, error: e2 } = await admin.from('cron_jobs').select('*').limit(50);
  console.log('rows:', rows, 'err:', e2?.message);
})();
