import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const a = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  // Recent 24h reports
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: reports, error } = await a
    .from('content_reports')
    .select('id, user_id, word, reason, description, context, source_lang, target_lang, created_at, processed_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`\n=== Reports in last 24h (${reports?.length ?? 0}) ===\n`);
  for (const r of reports ?? []) {
    const procMark = r.processed_at ? '✓ processed ' + new Date(r.processed_at).toLocaleString() : '✗ UNPROCESSED';
    console.log(`[${new Date(r.created_at).toLocaleString()}] ${r.source_lang}→${r.target_lang} "${r.word}" (${r.reason})`);
    console.log(`  user_id=${r.user_id?.slice(0, 8) ?? 'null'}  ${procMark}`);
    if (r.description) console.log(`  desc: ${r.description.slice(0, 80)}`);
  }

  // Recent report_fixes
  const { data: fixes } = await a
    .from('report_fixes')
    .select('id, word, source_lang, target_lang, report_count, judge_verdict, judge_confidence, status, applied_at, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`\n=== Report fixes in last 24h (${fixes?.length ?? 0}) ===\n`);
  for (const f of fixes ?? []) {
    console.log(`[${new Date(f.created_at).toLocaleString()}] ${f.source_lang}→${f.target_lang} "${f.word}"`);
    console.log(`  status=${f.status} verdict=${f.judge_verdict} conf=${f.judge_confidence} applied_at=${f.applied_at ?? '-'}`);
  }
}
main();
