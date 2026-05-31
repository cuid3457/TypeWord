require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // 1. Check user_words structure - does it reference word_entries?
  const uw = await admin.from('user_words').select('*').limit(1);
  console.log('user_words sample columns:', Object.keys(uw.data?.[0] || {}));

  // 2. Check curated_wordlists table schemas
  const cw = await admin.from('curated_wordlists').select('*').limit(1);
  console.log('curated_wordlists sample columns:', Object.keys(cw.data?.[0] || {}));

  // 3. Look for tables with FK to word_entries
  const re = await admin.from('word_entries').select('id,word,word_lang').limit(2);
  console.log('word_entries sample:', JSON.stringify(re.data));

  // Check audit_logs, api_logs etc
  for (const t of ['api_logs', 'process_reports', 'report_fixes', 'word_audit_logs', 'tts_cache']) {
    try {
      const r = await admin.from(t).select('*', { count: 'exact', head: true });
      console.log(`${t}: ${r.count} rows`);
    } catch (e) {}
  }
})();
