const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  // pg_cron jobs aren't directly readable via supabase-js, so call a tiny
  // RPC that exposes the cron.job table.
  // Fallback: try a SQL-based RPC. If unavailable, just confirm the migration
  // ran by reading warm_state which the cron updates.
  const { data, error } = await admin.from('warm_state').select('*').limit(1);
  console.log('warm_state:', data, 'err:', error?.message);
})();
